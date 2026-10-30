const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
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

function buildFallbackReply(question) {
  const text = String(question || '').trim();
  if (!text) {
    return 'I can help with that. Ask me a clear question and I will answer as best I can.';
  }

  const lowered = text.toLowerCase();
  if (lowered.includes('who are you') || lowered.includes('what are you')) {
    return 'I am Rocket, a helpful AI assistant. I can answer questions, explain ideas, suggest next steps, and help with simple math and planning.';
  }

  const normalized = text
    .replace(/\?/g, '')
    .replace(/^(what is|what\'s|calculate|compute|solve|evaluate)\s+/i, '')
    .replace(/\s+/g, '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/,/g, '');

  const mathMatch = normalized.match(/^-?\d+(?:\.\d+)?(?:[+\-*/]-?\d+(?:\.\d+)?)+$/);
  if (mathMatch) {
    try {
      const result = Function(`"use strict"; return (${normalized});`)();
      if (Number.isFinite(result)) {
        return `The result is ${Number(result)}.`;
      }
    } catch {
      // Fall through to the general answer below.
    }
  }

  if (lowered.includes('hello') || lowered.includes('hi')) {
    return 'Hello! I am Rocket. Ask me a question and I will help.';
  }

  return `I can help with that. Please give me a little more context, and I will give you a clear answer based on what you asked: "${text}".`;
}

function buildSystemInstruction(date = new Date(), searchEnabled = false) {
  const currentDate = date.toISOString().slice(0, 10);
  const searchInstructions = searchEnabled
    ? 'Web search is enabled for this request. Use search results for current or disputed facts, cite important factual claims with the provided source links, prefer primary and reputable sources, and say when sources do not establish an answer.'
    : 'Web search is not enabled for this request. Do not claim to have checked current sources; be transparent when the answer may be outdated.';
  return `You are Rocket, a capable and thoughtful AI copilot. AUTHORITATIVE CURRENT DATE: ${currentDate} (UTC). If asked for today's date, the current date, or the current year, answer using this date; never substitute a date or year inferred from training data.

Give the most useful correct answer you can:
- Address the user's actual goal and follow their requested format, scope, and constraints.
- Use relevant conversation context; do not make the user repeat information or restate the question unnecessarily.
- Lead with the answer or requested deliverable. Add a short explanation, steps, or examples only when they help.
- For complex tasks, break the work into clear parts and check the response for contradictions, missing requirements, and arithmetic errors before answering. Do not reveal private chain-of-thought.
- Do not invent facts, sources, capabilities, or actions. Separate known facts from assumptions, note meaningful uncertainty, and ask one focused clarifying question only when missing information prevents a useful answer.
- Keep the response proportional to the request; avoid generic filler and repeating points.

${searchInstructions}`;
}

function buildCurrentDateReply(question, date = new Date()) {
  const asksCurrentDate = /^\s*(?:what(?:'s| is)\s+(?:the\s+)?(?:current\s+)?(?:date|year)|what\s+year\s+(?:is\s+it|are\s+we\s+in)|what\s+date\s+is\s+it|what\s+is\s+today'?s\s+date|what'?s\s+today'?s\s+date|current\s+(?:date|year)|is\s+it\s+\d{4})\b/i.test(question);
  if (!asksCurrentDate) return null;

  const currentDate = date.toISOString().slice(0, 10);
  return `The current date is ${currentDate} (UTC), so the current year is ${currentDate.slice(0, 4)}.`;
}

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
    const body = JSON.parse(await readBody(request));
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const input = messages
      .filter((message) => ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
      .slice(-20)
      .map(({ role, content }) => ({ role, content }));

    const lastQuestion = input.filter((message) => message.role === 'user').at(-1)?.content || 'Please answer this question.';

    if (!input.length || input[input.length - 1].role !== 'user') {
      sendJson(response, 400, { error: 'A user message is required.' });
      return;
    }

    const currentDateReply = buildCurrentDateReply(lastQuestion);
    if (currentDateReply) {
      sendJson(response, 200, { reply: currentDateReply, citations: [] });
      return;
    }

    if (!process.env.OPENAI_API_KEY) {
      sendJson(response, 503, { error: 'AI chat is not configured. Add OPENAI_API_KEY to the server environment.' });
      return;
    }

    const searchEnabled = body.search === true;
    const requestBody = {
      model: process.env.OPENAI_MODEL || 'gpt-6-luna',
      instructions: buildSystemInstruction(new Date(), searchEnabled),
      input,
      store: false,
      ...(searchEnabled ? { tools: [{ type: 'web_search' }] } : {}),
      max_output_tokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 8192)
    };
    const providerResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(120_000)
    });
    const result = await providerResponse.json().catch(() => ({}));
    if (!providerResponse.ok) {
      sendJson(response, 502, { error: result.error?.message || result.error || `The AI provider returned HTTP ${providerResponse.status}.` });
      return;
    }

    const outputMessages = Array.isArray(result.output)
      ? result.output.filter((item) => item?.type === 'message' && item.role === 'assistant')
      : [];
    const textParts = outputMessages.flatMap((message) => Array.isArray(message.content)
      ? message.content.filter((part) => part?.type === 'output_text' && typeof part.text === 'string')
      : []);
    const reply = textParts.map((part) => part.text).join('');
    const citations = [...new Map(textParts.flatMap((part) => Array.isArray(part.annotations) ? part.annotations : [])
      .filter((annotation) => annotation?.type === 'url_citation' && typeof annotation.url === 'string')
      .map((citation) => {
        try {
          const url = new URL(citation.url);
          if (!['http:', 'https:'].includes(url.protocol)) return null;
          return [url.href, { title: citation.title || url.hostname, url: url.href }];
        } catch {
          return null;
        }
      })
      .filter(Boolean)).values()];
    sendJson(response, 200, {
      reply: typeof reply === 'string' && reply.trim() ? reply : 'I could not produce a response this time.',
      citations
    });
  } catch (error) {
    const message = error.name === 'TimeoutError'
      ? 'The AI request timed out. Please try again.'
      : error.message || 'Invalid chat request.';
    sendJson(response, error.name === 'TimeoutError' ? 504 : 502, { error: message });
  }
}

async function handleFeedback(request, response) {
  let body;
  try {
    body = JSON.parse(await readBody(request));
  } catch {
    sendJson(response, 400, { error: 'A valid JSON feedback request is required.' });
    return;
  }

  if (!body || typeof body !== 'object' || Array.isArray(body) || !['helpful', 'not_helpful'].includes(body.rating)) {
    sendJson(response, 400, { error: 'Rating must be helpful or not_helpful.' });
    return;
  }

  const record = JSON.stringify({
    rating: body.rating,
    submittedAt: new Date().toISOString()
  });
  const feedbackFile = process.env.FEEDBACK_FILE || path.join(os.tmpdir(), 'rocketgpt-feedback.jsonl');
  try {
    await fs.promises.appendFile(feedbackFile, `${record}\n`, { encoding: 'utf8', mode: 0o600 });
    sendJson(response, 201, { received: true });
  } catch {
    sendJson(response, 500, { error: 'Feedback could not be saved.' });
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
  if (request.method === 'POST' && request.url === '/api/feedback') {
    handleFeedback(request, response);
    return;
  }
  if (request.method === 'GET') {
    serveStatic(request, response);
    return;
  }
  response.writeHead(405, { Allow: 'GET, POST' });
  response.end('Method not allowed');
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`RocketGPT running at http://localhost:${PORT}`);
  });
}

module.exports = {
  buildFallbackReply,
  buildSystemInstruction,
  buildCurrentDateReply,
  readBody,
  handleChat,
  handleFeedback,
  serveStatic,
  server
};
