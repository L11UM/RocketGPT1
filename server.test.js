const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { buildFallbackReply, buildSystemInstruction, buildCurrentDateReply, handleChat, handleFeedback } = require('./server.js');

test('system instruction includes the current date in UTC', () => {
  const instruction = buildSystemInstruction(new Date('2026-10-21T12:00:00.000Z'));
  assert.match(instruction, /current date is 2026-10-21 \(UTC\)/);
  assert.match(instruction, /never substitute a date or year inferred from training data/i);
  assert.match(instruction, /Do not invent facts, sources, capabilities, or actions/);
  assert.match(instruction, /Web search is not enabled/);
  assert.match(buildSystemInstruction(new Date('2026-10-21T12:00:00.000Z'), true), /cite important factual claims with the provided source links/);
});

test('buildCurrentDateReply gives the actual date for direct current date and year questions', () => {
  const date = new Date('2026-10-21T12:00:00.000Z');
  assert.equal(buildCurrentDateReply('What year is it?', date), 'The current date is 2026-10-21 (UTC), so the current year is 2026.');
  assert.equal(buildCurrentDateReply('Is it 2024?', date), 'The current date is 2026-10-21 (UTC), so the current year is 2026.');
  assert.equal(buildCurrentDateReply('Was it 2024 when the movie came out?', date), null);
});

test('buildFallbackReply answers simple arithmetic', () => {
  assert.match(buildFallbackReply('What is 2 + 2?'), /4/);
});

test('buildFallbackReply answers identity questions', () => {
  const reply = buildFallbackReply('Who are you?');
  assert.match(reply, /Rocket/i);
  assert.match(reply, /help/i);
});

test('handleFeedback stores only a valid rating and server timestamp', async () => {
  const previousFeedbackFile = process.env.FEEDBACK_FILE;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rocket-feedback-test-'));
  const feedbackFile = path.join(tempDir, 'ratings.jsonl');
  process.env.FEEDBACK_FILE = feedbackFile;

  function makeRequest(body) {
    return Readable.from([JSON.stringify(body)]);
  }

  function makeResponse() {
    return {
      req: { headers: {} },
      writeHead(status) {
        this.status = status;
      },
      end(body) {
        this.body = JSON.parse(body);
      }
    };
  }

  try {
    const response = makeResponse();
    await handleFeedback(makeRequest({
      rating: 'helpful',
      prompt: 'Do not store this prompt',
      reply: 'Do not store this reply'
    }), response);
    assert.equal(response.status, 201);
    assert.deepEqual(response.body, { received: true });

    const records = (await fs.readFile(feedbackFile, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(records.length, 1);
    assert.equal(records[0].rating, 'helpful');
    assert.match(records[0].submittedAt, /^\d{4}-\d\d-\d\dT/);
    assert.deepEqual(Object.keys(records[0]).sort(), ['rating', 'submittedAt']);

    const invalidResponse = makeResponse();
    await handleFeedback(makeRequest({ rating: 'neutral' }), invalidResponse);
    assert.equal(invalidResponse.status, 400);
  } finally {
    if (previousFeedbackFile === undefined) delete process.env.FEEDBACK_FILE;
    else process.env.FEEDBACK_FILE = previousFeedbackFile;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('handleChat sends Responses API requests to OpenAI and extracts web citations', async () => {
  const previousEnvironment = {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL
  };
  const originalFetch = global.fetch;
  let capturedRequest;
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL = 'gpt-6-luna';
  global.fetch = async (url, options) => {
    capturedRequest = { url, options };
    return new Response(JSON.stringify({
      output: [{
        type: 'message',
        role: 'assistant',
        content: [{
          type: 'output_text',
          text: 'Hello from the configured model.',
          annotations: [
            { type: 'url_citation', url: 'https://example.com/article', title: 'Example article' },
            { type: 'url_citation', url: 'javascript:alert(1)', title: 'Unsafe citation' }
          ]
        }]
      }]
    }), { status: 200 });
  };

  const request = Readable.from([JSON.stringify({
    messages: [
      { role: 'user', content: 'Earlier question' },
      { role: 'assistant', content: 'Earlier answer' },
      { role: 'user', content: 'Latest question' }
    ],
    search: true
  })]);
  const response = {
    req: { headers: {} },
    writeHead(status) {
      this.status = status;
    },
    end(body) {
      this.body = JSON.parse(body);
    }
  };

  try {
    await handleChat(request, response);
    assert.equal(response.status, 200);
    assert.equal(response.body.reply, 'Hello from the configured model.');
    assert.deepEqual(response.body.citations, [{
      title: 'Example article',
      url: 'https://example.com/article'
    }]);
    assert.equal(capturedRequest.url, 'https://api.openai.com/v1/responses');
    assert.equal(capturedRequest.options.headers.Authorization, 'Bearer test-key');
    const requestBody = JSON.parse(capturedRequest.options.body);
    assert.equal(requestBody.model, 'gpt-6-luna');
    assert.equal(requestBody.store, false);
    assert.deepEqual(requestBody.tools, [{ type: 'web_search' }]);
    assert.deepEqual(requestBody.input.map(({ role }) => role), ['user', 'assistant', 'user']);
    assert.match(requestBody.instructions, /Web search is enabled for this request/);
  } finally {
    global.fetch = originalFetch;
    if (previousEnvironment.apiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousEnvironment.apiKey;
    if (previousEnvironment.model === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = previousEnvironment.model;
  }
});
