const form = document.getElementById('chatForm');
const promptInput = document.getElementById('prompt');
const sendButton = document.getElementById('sendButton');
const clearButton = document.getElementById('clearButton');
const statusMessage = document.getElementById('status');
const messagesElement = document.getElementById('messages');
const welcomeElement = document.getElementById('welcome');
const requestedModelPort = new URLSearchParams(window.location.search).get('modelPort');
const modelPort = /^\d{1,5}$/.test(requestedModelPort || '')
  && Number(requestedModelPort) >= 1024
  && Number(requestedModelPort) <= 65535
  ? Number(requestedModelPort)
  : 8080;
const modelEndpoint = `http://127.0.0.1:${modelPort}/v1/chat/completions`;
const conversation = [];
const systemMessage = {
  role: 'system',
  content: 'You are MakingGPT, an experimental RocketGPT language model running locally. Be helpful, clear, and honest about uncertainty. Do not claim to be GPT-3 or a model trained from scratch.'
};

function addMessage(role, content) {
  const message = document.createElement('article');
  message.className = `message ${role}`;
  const icon = document.createElement('span');
  icon.className = 'message-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = role === 'assistant' ? '✦' : 'You';
  const text = document.createElement('div');
  text.className = 'message-content';
  text.textContent = content;
  message.append(icon, text);
  messagesElement.append(message);
  message.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function getReply() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(modelEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'mlx-community/Qwen2.5-1.5B-Instruct-4bit',
        messages: [systemMessage, ...conversation.slice(-20)],
        temperature: 0.6,
        max_tokens: 512,
        stream: false
      }),
      signal: controller.signal
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = result?.error?.message || result?.detail || `HTTP ${response.status}`;
      throw new Error(`Local model request failed: ${detail}`);
    }

    const reply = result?.choices?.[0]?.message?.content;
    if (typeof reply !== 'string' || !reply.trim()) {
      throw new Error('The local model returned an empty response.');
    }
    return reply.trim();
  } finally {
    window.clearTimeout(timeout);
  }
}

async function sendMessage(message) {
  conversation.push({ role: 'user', content: message });
  addMessage('user', message);
  welcomeElement.hidden = true;
  sendButton.disabled = true;
  promptInput.disabled = true;
  statusMessage.textContent = 'The local model is thinking…';
  statusMessage.removeAttribute('data-error');

  try {
    const reply = await getReply();
    conversation.push({ role: 'assistant', content: reply });
    addMessage('assistant', reply);
    statusMessage.textContent = 'Prompts stay on this device. The local model may make mistakes.';
  } catch (error) {
    conversation.pop();
    statusMessage.textContent = error.name === 'AbortError'
      ? 'The local model took too long to respond. Try a shorter prompt or check that it is still running.'
      : `${error.message} Check the terminal running the local demo.`;
    statusMessage.dataset.error = 'true';
  } finally {
    sendButton.disabled = false;
    promptInput.disabled = false;
    promptInput.focus();
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const message = promptInput.value.trim();
  if (!message || sendButton.disabled) return;
  promptInput.value = '';
  promptInput.style.height = '';
  sendMessage(message);
});

promptInput.addEventListener('input', () => {
  promptInput.style.height = 'auto';
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 180)}px`;
});

promptInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.querySelectorAll('[data-prompt]').forEach((button) => {
  button.addEventListener('click', () => {
    promptInput.value = button.dataset.prompt;
    form.requestSubmit();
  });
});

clearButton.addEventListener('click', () => {
  conversation.length = 0;
  messagesElement.replaceChildren();
  welcomeElement.hidden = false;
  statusMessage.textContent = 'Prompts stay on this device. The local model may make mistakes.';
  statusMessage.removeAttribute('data-error');
  promptInput.focus();
});
