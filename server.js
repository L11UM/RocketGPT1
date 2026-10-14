const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN || '*').split(',').map((origin) => origin.trim());
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8'
};

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  const requestOrigin = response.req?.headers.origin;
  const allowedOrigin = ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin || '*'
    : ALLOWED_ORIGINS[0];
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Length': Buffer.byteLength(payload)
  });
  response.end(payload);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('Request body is too large.'));
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

async function handleChat(request, response) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      sendJson(response, 503, { error: 'AI is not configured. Add GEMINI_API_KEY to the server environment.' });
      return;
    }

    const body = JSON.parse(await readBody(request));
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const input = messages
      .filter((message) => ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
      .slice(-20)
      .map(({ role, content }) => ({ role, content }));

    if (!input.length || input[input.length - 1].role !== 'user') {
      sendJson(response, 400, { error: 'A user message is required.' });
      return;
    }

    const tools = [];
    if (process.env.GEMINI_SEARCH_ENABLED === 'true') tools.push({ googleSearch: {} });
    if (process.env.GEMINI_CODE_EXECUTION_ENABLED === 'true') tools.push({ codeExecution: {} });

    const requestBody = {
      systemInstruction: {
        parts: [{ text: 'You are Rocket, a capable and thoughtful AI copilot. Answer the user directly and accurately. For difficult requests, reason carefully before responding, but provide only useful conclusions and concise explanations, never private chain-of-thought. Use clear structure when it improves understanding. State uncertainty, distinguish facts from assumptions, and ask a focused clarifying question only when needed. Use web search for current or verifiable facts and code execution for calculations when available. Keep the response proportional to the request.' }]
      },
      contents: input.map(({ role, content }) => ({ role: role === 'assistant' ? 'model' : 'user', parts: [{ text: content }] })),
      ...(tools.length ? { tools } : {}),
      generationConfig: {
        maxOutputTokens: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 8192),
        thinkingConfig: { thinkingLevel: process.env.GEMINI_THINKING_LEVEL || 'HIGH' }
      }
    };
    const requestModel = (model) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(120_000)
    });
    const primaryModel = process.env.GEMINI_MODEL || 'gemini-4-argon';
    const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.6-flash';
    let providerResponse = await requestModel(primaryModel);
    let result = await providerResponse.json().catch(() => ({}));
    if ([429, 503].includes(providerResponse.status) && fallbackModel !== primaryModel) {
      providerResponse = await requestModel(fallbackModel);
      result = await providerResponse.json().catch(() => ({}));
    }
    if (!providerResponse.ok) {
      sendJson(response, 502, { error: result.error?.message || result.error || `The AI provider returned HTTP ${providerResponse.status}.` });
      return;
    }

    const candidate = result.candidates?.[0];
    const reply = candidate?.content?.parts?.map((part) => part.text || '').join('');
    const citations = [...new Map((candidate?.groundingMetadata?.groundingChunks || [])
      .filter((chunk) => chunk.web?.uri)
      .map((chunk) => [chunk.web.uri, { title: chunk.web.title || chunk.web.uri, url: chunk.web.uri }])).values()];
    sendJson(response, 200, { reply: reply || 'I could not produce a response this time.', citations });
  } catch (error) {
    const message = error.name === 'TimeoutError'
      ? 'The AI request timed out. Please try again.'
      : error.message || 'Invalid chat request.';
    sendJson(response, error.name === 'TimeoutError' ? 504 : 502, { error: message });
  }
}

function serveStatic(request, response) {
  const requestedPath = request.url === '/' ? '/rocketgpt.html' : request.url.split('?')[0];
  const safePath = path.normalize(requestedPath).replace(/^([.][.][/\\])+/, '');
  const filePath = path.join(ROOT, safePath);
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer((request, response) => {
  if (request.method === 'OPTIONS') {
    const allowedOrigin = ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(request.headers.origin)
      ? request.headers.origin || '*'
      : ALLOWED_ORIGINS[0];
    response.writeHead(204, {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    });
    response.end();
    return;
  }
  if (request.method === 'POST' && request.url === '/api/chat') {
    handleChat(request, response);
    return;
  }
  if (request.method === 'GET') {
    serveStatic(request, response);
    return;
  }
  response.writeHead(405, { Allow: 'GET, POST' });
  response.end('Method not allowed');
});

server.listen(PORT, () => {
  console.log(`RocketGPT running at http://localhost:${PORT}`);
});
