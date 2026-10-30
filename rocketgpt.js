(() => {
  'use strict';

  const elements = {
    messages: document.getElementById('messages'),
    emptyState: document.getElementById('emptyState'),
    prompt: document.getElementById('prompt'),
    viralMode: document.getElementById('viralMode'),
    viralModeCallout: document.getElementById('viralModeCallout'),
    composer: document.getElementById('composer'),
    newChat: document.getElementById('newChat'),
    send: document.querySelector('#composer .send'),
    historySearch: document.getElementById('historySearch'),
    threadList: document.getElementById('threadList'),
    mobileHistory: document.getElementById('mobileHistory'),
    sidebar: document.querySelector('.sidebar'),
    sidebarBackdrop: document.getElementById('sidebarBackdrop')
  };
  const apiBaseUrl = document.querySelector('meta[name="api-base-url"]')?.content.replace(/\/$/, '') || '';
  const storageKey = 'rocket2-chat-library-v1';
  const conversation = [];
  let savedThreads = loadSavedThreads();
  let activeThreadId;
  let activeRequest;

  function buildDirectApiInstructions(viralMode) {
    const currentDate = new Date().toISOString().slice(0, 10);
    const viralInstructions = viralMode
      ? 'VIRAL MODE IS ON for this answer. Help the user create highly shareable content for the requested platform and audience: lead with a specific, attention-grabbing hook; make the core idea clear and emotionally resonant; use concrete details and tight wording; and end with a natural takeaway or call to action when appropriate. Keep it authentic and useful: do not fabricate claims, promise virality, or use deceptive engagement bait. Follow any requested format and give multiple distinct options when useful.'
      : '';
    return `You are Rocket, a capable and thoughtful AI copilot. AUTHORITATIVE CURRENT DATE: ${currentDate} (UTC). If asked for today's date, the current date, or the current year, answer using this date; never substitute a date or year inferred from training data.

Give the most useful correct answer you can:
- Address the user's actual goal and follow their requested format, scope, and constraints.
- Use relevant conversation context; do not make the user repeat information or restate the question unnecessarily.
- Lead with the answer or requested deliverable. Add a short explanation, steps, or examples only when they help.
- For complex tasks, break the work into clear parts and check the response for contradictions, missing requirements, and arithmetic errors before answering. Do not reveal private chain-of-thought.
- Do not invent facts, sources, capabilities, or actions. Separate known facts from assumptions, note meaningful uncertainty, and ask one focused clarifying question only when missing information prevents a useful answer.
- You do not have web search for this request; do not claim to have checked live sources.
- Keep the response proportional to the request; avoid generic filler and repeating points.

${viralInstructions}`;
  }

  function setViralMode(enabled) {
    elements.viralMode.setAttribute('aria-pressed', String(enabled));
    elements.viralMode.classList.toggle('is-active', enabled);
    elements.viralMode.textContent = `Viral mode: ${enabled ? 'On' : 'Off'}`;
    elements.viralModeCallout.setAttribute('aria-pressed', String(enabled));
    elements.viralModeCallout.classList.toggle('is-active', enabled);
    elements.viralModeCallout.querySelector('.callout-action').textContent = enabled ? 'Turn off ↗' : 'Turn on ↗';
  }

  function loadSavedThreads() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (!Array.isArray(stored)) return [];
      return stored.filter((thread) => thread && typeof thread.id === 'string' && Array.isArray(thread.messages))
        .map((thread) => ({
          id: thread.id,
          title: typeof thread.title === 'string' ? thread.title : 'Untitled chat',
          updatedAt: Number(thread.updatedAt) || 0,
          messages: thread.messages
            .filter((message) => ['user', 'assistant'].includes(message?.role) && typeof message.content === 'string')
            .slice(-60)
            .map((message) => ({
              role: message.role,
              content: message.content,
              citations: Array.isArray(message.citations) ? message.citations : [],
              feedbackSubmitted: message.feedbackSubmitted === true
            }))
        }));
    } catch {
      return [];
    }
  }

  function persistSavedThreads() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(savedThreads));
    } catch {
      const notice = document.querySelector('.history-privacy');
      if (notice) notice.textContent = 'Browser storage is full';
    }
  }

  function renderThreadList() {
    const query = elements.historySearch.value.trim().toLowerCase();
    const matches = savedThreads.filter((thread) => !query
      || thread.title.toLowerCase().includes(query)
      || thread.messages.some((message) => message.content.toLowerCase().includes(query)));
    elements.threadList.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement('p');
      empty.className = 'history-empty';
      empty.textContent = query ? 'No matching chats' : 'Your saved chats will appear here';
      elements.threadList.appendChild(empty);
      return;
    }

    matches.forEach((thread) => {
      const row = document.createElement('div');
      const openButton = document.createElement('button');
      const title = document.createElement('span');
      const deleteButton = document.createElement('button');
      row.className = 'thread-row';
      openButton.className = `thread${thread.id === activeThreadId ? ' active' : ''}`;
      openButton.type = 'button';
      openButton.setAttribute('role', 'listitem');
      if (thread.id === activeThreadId) openButton.setAttribute('aria-current', 'true');
      title.className = 'thread-title';
      title.textContent = thread.title;
      openButton.appendChild(title);
      openButton.addEventListener('click', () => openSavedThread(thread.id));
      deleteButton.className = 'thread-delete';
      deleteButton.type = 'button';
      deleteButton.textContent = '×';
      deleteButton.title = 'Delete chat';
      deleteButton.setAttribute('aria-label', `Delete chat: ${thread.title}`);
      deleteButton.addEventListener('click', () => deleteSavedThread(thread.id));
      row.append(openButton, deleteButton);
      elements.threadList.appendChild(row);
    });
  }

  function saveActiveThread() {
    if (!conversation.length) return;
    activeThreadId ||= globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const firstUserMessage = conversation.find((message) => message.role === 'user')?.content || 'New chat';
    const title = firstUserMessage.trim().replace(/\s+/g, ' ').slice(0, 48);
    const thread = {
      id: activeThreadId,
      title: title || 'New chat',
      updatedAt: Date.now(),
      messages: conversation.slice(-60)
    };
    savedThreads = [thread, ...savedThreads.filter((saved) => saved.id !== activeThreadId)].slice(0, 50);
    persistSavedThreads();
    renderThreadList();
  }

  function closeHistoryDrawer() {
    elements.sidebar.classList.remove('is-open');
    elements.sidebarBackdrop.hidden = true;
    elements.mobileHistory.setAttribute('aria-expanded', 'false');
  }

  function startNewChat() {
    activeRequest?.abort();
    activeRequest = undefined;
    activeThreadId = undefined;
    elements.send.disabled = false;
    conversation.length = 0;
    elements.messages.replaceChildren();
    elements.emptyState.hidden = false;
    renderThreadList();
    closeHistoryDrawer();
    elements.prompt.focus();
  }

  function openSavedThread(threadId) {
    const thread = savedThreads.find((saved) => saved.id === threadId);
    if (!thread) return;
    activeRequest?.abort();
    activeRequest = undefined;
    activeThreadId = thread.id;
    elements.send.disabled = false;
    conversation.splice(0, conversation.length, ...thread.messages.map((message) => ({ ...message })));
    elements.messages.replaceChildren();
    conversation.forEach((message) => {
      addMessage(message.content, message.role, message.citations);
      if (message.role === 'assistant') addNextVector(message);
    });
    elements.prompt.value = '';
    elements.emptyState.hidden = conversation.length > 0;
    renderThreadList();
    closeHistoryDrawer();
    elements.prompt.focus();
  }

  function deleteSavedThread(threadId) {
    savedThreads = savedThreads.filter((thread) => thread.id !== threadId);
    persistSavedThreads();
    if (activeThreadId === threadId) {
      startNewChat();
    } else {
      renderThreadList();
    }
  }

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

  async function submitFeedback(message, rating, buttons, status, threadId, messageIndex) {
    buttons.forEach((button) => { button.disabled = true; });
    status.textContent = 'Saving feedback...';
    try {
      const response = await fetch(`${apiBaseUrl}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.received !== true) {
        throw new Error(data?.error || `Feedback could not be saved (HTTP ${response.status}).`);
      }

      message.feedbackSubmitted = true;
      status.textContent = 'Thanks—your rating was saved.';
      if (activeThreadId === threadId) {
        saveActiveThread();
      } else {
        const savedThread = savedThreads.find((thread) => thread.id === threadId);
        const savedMessage = savedThread?.messages[messageIndex];
        if (savedMessage) savedMessage.feedbackSubmitted = true;
        persistSavedThreads();
      }
    } catch {
      buttons.forEach((button) => { button.disabled = false; });
      status.textContent = 'Feedback could not be saved. Please try again.';
    }
  }

  function addNextVector(message) {
    const action = document.createElement('div');
    const nextButton = document.createElement('button');
    const shareButton = document.createElement('button');
    const helpfulButton = document.createElement('button');
    const notHelpfulButton = document.createElement('button');
    const feedbackStatus = document.createElement('span');
    const feedbackButtons = [helpfulButton, notHelpfulButton];
    const threadId = activeThreadId;
    const messageIndex = conversation.indexOf(message);
    action.className = 'vector-action';
    nextButton.className = 'next-vector';
    nextButton.type = 'button';
    nextButton.textContent = 'Next Vector  ↗';
    shareButton.className = 'share-answer';
    shareButton.type = 'button';
    shareButton.textContent = 'Share answer ↗';
    shareButton.setAttribute('aria-label', 'Share this Rocket 2.0 answer');
    shareButton.addEventListener('click', () => shareAnswer(message.content, shareButton));
    helpfulButton.className = 'feedback-vote';
    helpfulButton.type = 'button';
    helpfulButton.textContent = '👍 Helpful';
    helpfulButton.setAttribute('aria-label', 'Rate this answer as helpful');
    notHelpfulButton.className = 'feedback-vote';
    notHelpfulButton.type = 'button';
    notHelpfulButton.textContent = '👎 Not helpful';
    notHelpfulButton.setAttribute('aria-label', 'Rate this answer as not helpful');
    feedbackStatus.className = 'feedback-status';
    feedbackStatus.setAttribute('role', 'status');
    feedbackStatus.setAttribute('aria-live', 'polite');
    feedbackStatus.textContent = message.feedbackSubmitted
      ? 'Thanks—your rating was saved.'
      : 'Only your rating and time are saved—not linked to this chat.';
    if (message.feedbackSubmitted) {
      feedbackButtons.forEach((button) => { button.disabled = true; });
    } else {
      helpfulButton.addEventListener('click', () => submitFeedback(message, 'helpful', feedbackButtons, feedbackStatus, threadId, messageIndex));
      notHelpfulButton.addEventListener('click', () => submitFeedback(message, 'not_helpful', feedbackButtons, feedbackStatus, threadId, messageIndex));
    }
    action.append(nextButton, shareButton, ...feedbackButtons, feedbackStatus);
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
      const viralMode = elements.viralMode.getAttribute('aria-pressed') === 'true';
      const response = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai-fast',
          messages: [
            { role: 'system', content: buildDirectApiInstructions(viralMode) },
            ...conversation.slice(-20).map(({ role, content }) => ({ role, content }))
          ],
          temperature: 0.6,
          max_tokens: 2048,
          stream: false
        }),
        signal: controller.signal
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 402 || response.status === 429) {
          throw new Error('The free AI is rate-limited to one reply per IP every 30 seconds. Please wait for the limit to reset and try again.');
        }
        const providerError = data?.error?.message || data?.error;
        throw new Error(providerError || `The AI service is unavailable (HTTP ${response.status}).`);
      }
      const reply = data?.choices?.[0]?.message?.content;
      if (typeof reply !== 'string' || !reply.trim()) {
        throw new Error('The AI returned an empty response. Please try again.');
      }
      return { reply, citations: [] };
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
    saveActiveThread();
    elements.prompt.value = '';
    elements.prompt.style.height = 'auto';
    elements.send.disabled = true;
    const typingMessage = showTyping();

    try {
      const { reply, citations } = await requestReply();
      typingMessage.remove();
      const assistantMessage = { role: 'assistant', content: reply, citations: Array.isArray(citations) ? citations : [] };
      conversation.push(assistantMessage);
      saveActiveThread();
      addMessage(reply, 'assistant', citations);
      addNextVector(assistantMessage);
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

  elements.viralMode.addEventListener('click', () => {
    setViralMode(elements.viralMode.getAttribute('aria-pressed') !== 'true');
  });
  elements.viralModeCallout.addEventListener('click', () => {
    setViralMode(elements.viralMode.getAttribute('aria-pressed') !== 'true');
    elements.prompt.focus();
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
      if (suggestion.classList.contains('viral')) setViralMode(true);
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
    startNewChat();
  });

  elements.historySearch.addEventListener('input', renderThreadList);
  elements.mobileHistory.addEventListener('click', () => {
    const isOpen = elements.sidebar.classList.toggle('is-open');
    elements.sidebarBackdrop.hidden = !isOpen;
    elements.mobileHistory.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) elements.historySearch.focus();
  });
  elements.sidebarBackdrop.addEventListener('click', closeHistoryDrawer);

  renderThreadList();
})();
