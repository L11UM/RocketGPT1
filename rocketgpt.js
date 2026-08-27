(() => {
  'use strict';

  const elements = {
    messages: document.getElementById('messages'),
    prompt: document.getElementById('prompt'),
    composer: document.getElementById('composer'),
    history: document.getElementById('history'),
    newChat: document.getElementById('newChat')
  };
  const apiBaseUrl = document.querySelector('meta[name="api-base-url"]')?.content.replace(/\/$/, '') || '';
  const conversation = [];
  let activeRequest;

  function createMessage(text, type) {
    const message = document.createElement('div');
    const avatar = document.createElement('div');
    const bubble = document.createElement('div');
    const paragraph = document.createElement('p');

    message.className = `message ${type}`;
    avatar.className = 'message-avatar';
    avatar.textContent = type === 'user' ? 'LM' : '↗';
    bubble.className = 'bubble';
    paragraph.textContent = text;
    bubble.appendChild(paragraph);
    message.append(avatar, bubble);
    return message;
  }

  function addMessage(text, type) {
    const message = createMessage(text, type);
    elements.messages.appendChild(message);
    message.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return message;
  }

  function showTyping() {
    const message = createMessage('', 'assistant');
    const bubble = message.querySelector('.bubble');
    const typing = document.createElement('span');
    typing.className = 'typing';
    typing.textContent = 'Rocket is thinking...';
    bubble.replaceChildren(typing);
    elements.messages.appendChild(message);
    return message;
  }

  async function requestReply() {
    activeRequest?.abort();
    activeRequest = new AbortController();
    const response = await fetch(`${apiBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversation }),
      signal: activeRequest.signal
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Rocket could not respond.');
    return data.reply;
  }

  async function sendMessage() {
    const text = elements.prompt.value.trim();
    if (!text) return;

    addMessage(text, 'user');
    conversation.push({ role: 'user', content: text });
    elements.prompt.value = '';
    elements.prompt.style.height = 'auto';
    const typingMessage = showTyping();

    try {
      const reply = await requestReply();
      typingMessage.remove();
      conversation.push({ role: 'assistant', content: reply });
      addMessage(reply, 'assistant');
    } catch (error) {
      if (error.name === 'AbortError') return;
      typingMessage.remove();
      addMessage(`Connection issue: ${error.message}`, 'assistant');
    }
  }

  elements.composer.addEventListener('submit', (event) => {
    event.preventDefault();
    sendMessage();
  });

  elements.prompt.addEventListener('input', () => {
    elements.prompt.style.height = 'auto';
    elements.prompt.style.height = `${Math.min(elements.prompt.scrollHeight, 100)}px`;
  });

  elements.prompt.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      elements.composer.requestSubmit();
    }
  });

  document.addEventListener('click', (event) => {
    const suggestion = event.target.closest('.suggestion');
    const thread = event.target.closest('.thread');

    if (suggestion) {
      elements.prompt.value = suggestion.textContent;
      elements.prompt.focus();
      return;
    }

    if (thread) {
      elements.history.querySelector('.active')?.classList.remove('active');
      thread.classList.add('active');
    }
  });

  elements.newChat.addEventListener('click', () => {
    activeRequest?.abort();
    conversation.length = 0;
    elements.messages.replaceChildren(createMessage('New conversation ready.', 'assistant'));
    elements.prompt.focus();
  });
})();
