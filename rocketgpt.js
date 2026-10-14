(() => {
  'use strict';

  const elements = {
    messages: document.getElementById('messages'),
    emptyState: document.getElementById('emptyState'),
    prompt: document.getElementById('prompt'),
    composer: document.getElementById('composer'),
    newChat: document.getElementById('newChat'),
    send: document.querySelector('#composer .send')
  };
  const apiBaseUrl = document.querySelector('meta[name="api-base-url"]')?.content.replace(/\/$/, '') || '';
  const conversation = [];
  let activeRequest;

  function createMessage(text, type, citations = []) {
    const message = document.createElement('div');
    const avatar = document.createElement('div');
    const bubble = document.createElement('div');
    const paragraph = document.createElement('p');

    message.className = `message ${type}`;
    avatar.className = 'message-avatar';
    if (type === 'assistant') {
      const logo = document.createElement('img');
      logo.src = 'rocketgpt-logo.svg';
      logo.alt = '';
      avatar.appendChild(logo);
    } else {
      avatar.textContent = 'You';
    }
    bubble.className = 'bubble';
    paragraph.textContent = text;
    bubble.appendChild(paragraph);
    if (citations.length) {
      const sources = document.createElement('div');
      sources.className = 'message-sources';
      const label = document.createElement('span');
      label.textContent = 'Sources';
      sources.appendChild(label);
      citations.forEach((citation) => {
        try {
          const url = new URL(citation.url);
          if (!['http:', 'https:'].includes(url.protocol)) return;
          const link = document.createElement('a');
          link.href = url.href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = citation.title || url.hostname;
          sources.appendChild(link);
        } catch {
          return;
        }
      });
      if (sources.childElementCount > 1) bubble.appendChild(sources);
    }
    message.append(avatar, bubble);
    return message;
  }

  function addMessage(text, type, citations = []) {
    const message = createMessage(text, type, citations);
    elements.messages.appendChild(message);
    message.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return message;
  }

  async function shareAnswer(text, button) {
    const shareUrl = document.querySelector('meta[property="og:url"]')?.content || window.location.href;
    const shareText = `${text}\n\n— Rocket 2.0`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Rocket 2.0', text: shareText, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      button.textContent = 'Link copied';
      window.setTimeout(() => { button.textContent = 'Share answer ↗'; }, 1800);
    } catch (error) {
      if (error.name === 'AbortError') return;
      button.textContent = 'Copy unavailable';
      window.setTimeout(() => { button.textContent = 'Share answer ↗'; }, 1800);
    }
  }

  function addNextVector(answer) {
    const action = document.createElement('div');
    const nextButton = document.createElement('button');
    const shareButton = document.createElement('button');
    action.className = 'vector-action';
    nextButton.className = 'next-vector';
    nextButton.type = 'button';
    nextButton.textContent = 'Next Vector  ↗';
    shareButton.className = 'share-answer';
    shareButton.type = 'button';
    shareButton.textContent = 'Share answer ↗';
    shareButton.setAttribute('aria-label', 'Share this Rocket 2.0 answer');
    shareButton.addEventListener('click', () => shareAnswer(answer, shareButton));
    action.append(nextButton, shareButton);
    elements.messages.appendChild(action);
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
    const controller = new AbortController();
    activeRequest = controller;
    try {
      const response = await fetch(`${apiBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversation }),
        signal: controller.signal
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || `The chat server is unavailable (HTTP ${response.status}).`);
      }
      if (typeof data?.reply !== 'string' || !data.reply.trim()) {
        throw new Error('The AI returned an empty response. Please try again.');
      }
      return data;
    } finally {
      if (activeRequest === controller) activeRequest = undefined;
    }
  }

  async function sendMessage() {
    const text = elements.prompt.value.trim();
    if (!text) return;

    elements.emptyState.hidden = true;
    addMessage(text, 'user');
    conversation.push({ role: 'user', content: text });
    elements.prompt.value = '';
    elements.prompt.style.height = 'auto';
    elements.send.disabled = true;
    const typingMessage = showTyping();

    try {
      const { reply, citations } = await requestReply();
      typingMessage.remove();
      conversation.push({ role: 'assistant', content: reply });
      addMessage(reply, 'assistant', citations);
      addNextVector(reply);
    } catch (error) {
      if (error.name === 'AbortError') return;
      typingMessage.remove();
      addMessage(`Connection issue: ${error.message}`, 'assistant');
    } finally {
      elements.send.disabled = false;
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
    if (suggestion) {
      elements.prompt.value = suggestion.dataset.prompt || suggestion.textContent.trim();
      elements.prompt.focus();
      return;
    }

    if (event.target.closest('.next-vector')) {
      elements.prompt.value = 'What is the next concrete action I should take based on your last answer?';
      elements.prompt.focus();
      return;
    }

  });

  elements.newChat.addEventListener('click', () => {
    activeRequest?.abort();
    activeRequest = undefined;
    elements.send.disabled = false;
    conversation.length = 0;
    elements.messages.replaceChildren();
    elements.emptyState.hidden = false;
    elements.prompt.focus();
  });
})();
