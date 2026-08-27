const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
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

    if (!input.length || input[input.length - 1].role !== 'user') {
      sendJson(response, 400, { error: 'A user message is required.' });
      return;
    }

    const ollamaResponse = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || 'llama3.2',
        stream: false,
        messages: [
          { role: 'system', content: 'You are Rocket, a concise, thoughtful AI co-pilot. Give practical answers with a warm, forward-moving tone.' },
          ...input
        ],
        options: { num_predict: 700 }
      })
    });

    const result = await ollamaResponse.json();
    if (!ollamaResponse.ok) {
      sendJson(response, ollamaResponse.status, { error: result.error || 'Ollama returned an error.' });
      return;
    }

    sendJson(response, 200, { reply: result.message?.content || 'I could not produce a response this time.' });
  } catch (error) {
    const message = error.cause?.code === 'ECONNREFUSED'
      ? 'Ollama is not running. Start Ollama, then download a model with: ollama pull llama3.2'
      : error.message || 'Invalid chat request.';
    sendJson(response, 502, { error: message });
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
