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
    sidebarBackdrop: document.getElementById('sidebarBackdrop'),
    shareApp: document.getElementById('shareApp'),
    launchMode: document.getElementById('launchMode'),
    modeControl: document.getElementById('modeControl'),
    fuelStatus: document.getElementById('fuelStatus'),
    fuelProgress: document.getElementById('fuelProgress'),
    fuelCountdown: document.getElementById('fuelCountdown'),
    exportMarkdown: document.getElementById('exportMarkdown'),
    exportText: document.getElementById('exportText'),
    historyStatus: document.getElementById('historyStatus')
  };
  const apiBaseUrl = document.querySelector('meta[name="api-base-url"]')?.content.replace(/\/$/, '') || '';
  const storageKey = 'rocket2-chat-library-v1';
  const cooldownStorageKey = 'rocket2-cooldown-until';
  const requestTimeoutMs = 90_000;
  const personas = {
    creator: {
      icon: '✍️',
      color: '#ff9a7e',
      instruction: 'Act as Creator: help make clear, original writing for the requested audience and format. Keep the voice natural and the details concrete.'
    },
    coach: {
      icon: '🧭',
      color: '#8ee4e2',
      instruction: 'Act as Coach: help the user clarify a goal, identify realistic next steps, and notice tradeoffs. Be encouraging without being pushy or pretending certainty.'
    },
    explainer: {
      icon: '💡',
      color: '#ffd85b',
      instruction: 'Act as Explainer: make difficult ideas easy to understand with plain language, useful structure, and a short example when it helps.'
    },
    'hype-writer': {
      icon: '🚀',
      color: '#ff744f',
      instruction: 'Act as Hype Writer: write energetic, memorable copy while staying honest. Never invent proof, claims, or guarantees.'
    },
    brainstormer: {
      icon: '🧠',
      color: '#c4a7ff',
      instruction: 'Act as Brainstormer: generate varied, specific ideas, group them usefully, and call out the most promising directions without presenting speculation as fact.'
    }
  };
  const conversation = [];
  const messageElements = new WeakMap();
  let savedThreads = loadSavedThreads();
  let activeThreadId;
  let activeRequest;
  let responseInProgress = false;
  let revealGeneration = 0;
  let cooldownTimer;
  let cooldownUntil = 0;

  function buildDirectApiInstructions(viralMode, launchMode) {
    const currentDate = new Date().toISOString().slice(0, 10);
    const persona = personas[launchMode] || personas.creator;
    const viralInstructions = viralMode
      ? 'VIRAL MODE IS ON for this answer. Help the user create highly shareable content for the requested platform and audience: lead with a specific, attention-grabbing hook; make the core idea clear and emotionally resonant; use concrete details and tight wording; and end with a natural takeaway or call to action when appropriate. Keep it authentic and useful: do not fabricate claims, promise virality, or use deceptive engagement bait. Follow any requested format and give multiple distinct options when useful.'
      : '';
    return `You are Rocket, a capable and thoughtful AI copilot. AUTHORITATIVE CURRENT DATE: ${currentDate} (UTC). If asked for today's date, the current date, or the current year, answer using this date; never substitute a date or year inferred from training data.
${persona.instruction}

Give the most useful correct answer you can:
- Address the user's actual goal and follow their requested format, scope, and constraints.
- Use relevant conversation context; do not make the user repeat information or restate the question unnecessarily.
- Lead with the answer or requested deliverable. Add a short explanation, steps, or examples only when they help.
- For complex tasks, break the work into clear parts and check the response for contradictions, missing requirements, and arithmetic errors before answering. Do not reveal private chain-of-thought.
- If the user corrects an earlier answer, re-check it and clearly correct any mistake instead of defending it. If a request is ambiguous, make a reasonable assumption or ask one focused question.
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

  function updateModeControl() {
    const persona = personas[elements.launchMode.value] || personas.creator;
    elements.modeControl.dataset.mode = elements.launchMode.value;
    elements.modeControl.querySelector('.mode-icon').textContent = persona.icon;
    elements.modeControl.style.setProperty('--mode-color', persona.color);
  }

  async function shareApp() {
    const shareData = {
      title: 'Rocket 2.0 — Turn ideas into attention',
      text: 'Try Rocket 2.0, a free AI chat workspace for sharper ideas and shareable content.',
      url: 'https://rocketgpt.net/rocketgpt.html'
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(shareData.url);
      elements.shareApp.classList.add('is-copied');
      elements.shareApp.setAttribute('aria-label', 'Rocket 2.0 link copied');
    } catch (error) {
      if (error.name === 'AbortError') return;
      elements.shareApp.classList.add('is-unavailable');
      elements.shareApp.setAttribute('aria-label', 'Rocket 2.0 sharing unavailable');
    }
    window.setTimeout(() => {
      elements.shareApp.classList.remove('is-copied', 'is-unavailable');
      elements.shareApp.setAttribute('aria-label', 'Share Rocket 2.0');
    }, 2200);
  }

  function loadSavedThreads() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (!Array.isArray(stored)) return [];
      return stored.filter((thread) => thread && typeof thread.id === 'string' && Array.isArray(thread.messages))
        .map((thread) => ({
          id: thread.id,
          title: typeof thread.title === 'string' ? thread.title : 'Untitled chat',
          customTitle: thread.customTitle === true,
          mode: Object.prototype.hasOwnProperty.call(personas, thread.mode) ? thread.mode : 'creator',
          updatedAt: Number(thread.updatedAt) || 0,
          messages: thread.messages
            .filter((message) => ['user', 'assistant'].includes(message?.role) && typeof message.content === 'string')
            .slice(-60)
            .map((message) => ({
              role: message.role,
              content: message.content,
              prompt: typeof message.prompt === 'string' ? message.prompt : '',
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
    const hasMessages = conversation.length > 0;
    elements.exportMarkdown.disabled = !hasMessages;
    elements.exportText.disabled = !hasMessages;
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
      const renameButton = document.createElement('button');
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
      renameButton.className = 'thread-rename';
      renameButton.type = 'button';
      renameButton.textContent = '✎';
      renameButton.title = 'Rename chat';
      renameButton.setAttribute('aria-label', `Rename chat: ${thread.title}`);
      renameButton.addEventListener('click', () => renameSavedThread(thread.id));
      deleteButton.className = 'thread-delete';
      deleteButton.type = 'button';
      deleteButton.textContent = '×';
      deleteButton.title = 'Delete chat';
      deleteButton.setAttribute('aria-label', `Delete chat: ${thread.title}`);
      deleteButton.addEventListener('click', () => deleteSavedThread(thread.id));
      row.append(openButton, renameButton, deleteButton);
      elements.threadList.appendChild(row);
    });
  }

  function saveActiveThread() {
    if (!conversation.length) return;
    activeThreadId ||= globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const firstUserMessage = conversation.find((message) => message.role === 'user')?.content || 'New chat';
    const existing = savedThreads.find((saved) => saved.id === activeThreadId);
    const title = existing?.customTitle
      ? existing.title
      : firstUserMessage.trim().replace(/\s+/g, ' ').slice(0, 48);
    const thread = {
      id: activeThreadId,
      title: title || 'New chat',
      customTitle: existing?.customTitle === true,
      mode: elements.launchMode.value,
      updatedAt: Date.now(),
      messages: conversation.slice(-60)
    };
    savedThreads = [thread, ...savedThreads.filter((saved) => saved.id !== activeThreadId)].slice(0, 50);
    persistSavedThreads();
    renderThreadList();
  }

  function renameSavedThread(threadId) {
    const thread = savedThreads.find((saved) => saved.id === threadId);
    if (!thread) return;
    const title = window.prompt('Name this chat', thread.title);
    if (title === null) return;
    const nextTitle = title.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!nextTitle) {
      elements.historyStatus.textContent = 'Chat names can’t be empty.';
      return;
    }
    thread.title = nextTitle;
    thread.customTitle = true;
    persistSavedThreads();
    renderThreadList();
  }

  function exportActiveThread(format) {
    const thread = savedThreads.find((saved) => saved.id === activeThreadId);
    const messages = thread?.messages || conversation;
    if (!messages.length) return;
    const title = thread?.title || messages.find((message) => message.role === 'user')?.content || 'Rocket 2.0 chat';
    const content = format === 'markdown'
      ? `# ${title}\n\n${messages.map((message) => `## ${message.role === 'user' ? 'You' : 'Rocket 2.0'}\n\n${message.content}`).join('\n\n')}\n`
      : `${title}\n\n${messages.map((message) => `${message.role === 'user' ? 'You' : 'Rocket 2.0'}:\n${message.content}`).join('\n\n')}\n`;
    const blob = new Blob([content], { type: `text/${format === 'markdown' ? 'markdown' : 'plain'};charset=utf-8` });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'rocket-chat'}.${format === 'markdown' ? 'md' : 'txt'}`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    elements.historyStatus.textContent = `Chat exported as .${format === 'markdown' ? 'md' : 'txt'}.`;
  }

  function closeHistoryDrawer() {
    elements.sidebar.classList.remove('is-open');
    elements.sidebarBackdrop.hidden = true;
    elements.mobileHistory.setAttribute('aria-expanded', 'false');
  }

  function startNewChat() {
    activeRequest?.abort();
    activeRequest = undefined;
    responseInProgress = false;
    revealGeneration += 1;
    activeThreadId = undefined;
    elements.send.disabled = cooldownUntil > Date.now();
    conversation.length = 0;
    elements.messages.replaceChildren();
    elements.emptyState.hidden = false;
    elements.historyStatus.textContent = 'Saved only in this browser';
    renderThreadList();
    closeHistoryDrawer();
    elements.prompt.focus();
  }

  function openSavedThread(threadId) {
    const thread = savedThreads.find((saved) => saved.id === threadId);
    if (!thread) return;
    activeRequest?.abort();
    activeRequest = undefined;
    responseInProgress = false;
    revealGeneration += 1;
    activeThreadId = thread.id;
    elements.launchMode.value = thread.mode || 'creator';
    updateModeControl();
    elements.send.disabled = cooldownUntil > Date.now();
    conversation.splice(0, conversation.length, ...thread.messages.map((message) => ({ ...message })));
    elements.messages.replaceChildren();
    conversation.forEach((message) => {
      const rendered = addMessage(message.content, message.role, message.citations);
      messageElements.set(message, rendered);
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

  async function copyText(text) {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.');
    await navigator.clipboard.writeText(text);
  }

  function appendInlineMarkdown(parent, text) {
    const tokenPattern = /(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;
    let position = 0;
    for (const match of text.matchAll(tokenPattern)) {
      const start = match.index;
      if (start > position) parent.append(document.createTextNode(text.slice(position, start)));
      const token = match[0];
      if (token.startsWith('[')) {
        const split = token.indexOf('](');
        const label = token.slice(1, split);
        const rawUrl = token.slice(split + 2, -1);
        try {
          const url = new URL(rawUrl);
          if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported link protocol');
          const link = document.createElement('a');
          link.href = url.href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = label;
          parent.appendChild(link);
        } catch {
          parent.append(document.createTextNode(label));
        }
      } else if (token.startsWith('`')) {
        const code = document.createElement('code');
        code.className = 'inline-code';
        code.textContent = token.slice(1, -1);
        parent.appendChild(code);
      } else if (token.startsWith('**')) {
        const strong = document.createElement('strong');
        strong.textContent = token.slice(2, -2);
        parent.appendChild(strong);
      } else {
        const emphasis = document.createElement('em');
        emphasis.textContent = token.slice(1, -1);
        parent.appendChild(emphasis);
      }
      position = start + token.length;
    }
    if (position < text.length) parent.append(document.createTextNode(text.slice(position)));
  }

  function renderMarkdown(container, text) {
    container.replaceChildren();
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    let paragraphLines = [];
    let listElement;
    let listKind = '';
    let codeLines = null;
    let codeLanguage = '';

    function flushParagraph() {
      if (!paragraphLines.length) return;
      const paragraph = document.createElement('p');
      paragraphLines.forEach((line, index) => {
        if (index) paragraph.appendChild(document.createElement('br'));
        appendInlineMarkdown(paragraph, line);
      });
      container.appendChild(paragraph);
      paragraphLines = [];
    }

    function closeList() {
      if (!listElement) return;
      container.appendChild(listElement);
      listElement = undefined;
      listKind = '';
    }

    function addCodeBlock() {
      const wrapper = document.createElement('div');
      const header = document.createElement('div');
      const language = document.createElement('span');
      const copyButton = document.createElement('button');
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      wrapper.className = 'code-block';
      header.className = 'code-block-header';
      language.textContent = codeLanguage || 'Code';
      copyButton.className = 'code-copy';
      copyButton.type = 'button';
      copyButton.textContent = 'Copy code';
      copyButton.addEventListener('click', async () => {
        try {
          await copyText(code.textContent);
          copyButton.textContent = 'Copied';
        } catch {
          copyButton.textContent = 'Copy unavailable';
        }
        window.setTimeout(() => { copyButton.textContent = 'Copy code'; }, 1800);
      });
      code.textContent = codeLines.join('\n');
      header.append(language, copyButton);
      pre.appendChild(code);
      wrapper.append(header, pre);
      container.appendChild(wrapper);
    }

    for (const line of lines) {
      const fence = line.match(/^\s*```([\w+-]*)\s*$/);
      if (codeLines) {
        if (fence) {
          addCodeBlock();
          codeLines = null;
          codeLanguage = '';
        } else {
          codeLines.push(line);
        }
        continue;
      }
      if (fence) {
        flushParagraph();
        closeList();
        codeLines = [];
        codeLanguage = fence[1];
        continue;
      }
      if (!line.trim()) {
        flushParagraph();
        closeList();
        continue;
      }
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        closeList();
        const element = document.createElement(heading[1].length === 1 ? 'h3' : 'h4');
        appendInlineMarkdown(element, heading[2]);
        container.appendChild(element);
        continue;
      }
      const listItem = line.match(/^\s*([-*+]|\d+\.)\s+(.+)$/);
      if (listItem) {
        flushParagraph();
        const nextKind = /^\d/.test(listItem[1]) ? 'ol' : 'ul';
        if (listKind !== nextKind) {
          closeList();
          listElement = document.createElement(nextKind);
          listKind = nextKind;
        }
        const item = document.createElement('li');
        appendInlineMarkdown(item, listItem[2]);
        listElement.appendChild(item);
        continue;
      }
      closeList();
      paragraphLines.push(line);
    }
    flushParagraph();
    closeList();
    if (codeLines) addCodeBlock();
  }

  function createMessage(text, type, citations = []) {
    const message = document.createElement('div');
    const avatar = document.createElement('div');
    const bubble = document.createElement('div');

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
    if (type === 'assistant') {
      renderMarkdown(bubble, text);
    } else {
      const paragraph = document.createElement('p');
      paragraph.textContent = text;
      bubble.appendChild(paragraph);
    }
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
    if (type === 'assistant') message.setAttribute('aria-live', 'polite');
    elements.messages.appendChild(message);
    message.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return message;
  }

  function getSourcePrompt(message) {
    if (message.prompt) return message.prompt;
    const index = conversation.indexOf(message);
    return conversation[index - 1]?.content || '';
  }

  function drawWrappedText(context, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    const visibleLines = lines.slice(0, maxLines);
    if (lines.length > maxLines) {
      let lastLine = visibleLines.at(-1) || '';
      while (lastLine && context.measureText(`${lastLine}…`).width > maxWidth) {
        lastLine = lastLine.slice(0, -1);
      }
      visibleLines[visibleLines.length - 1] = `${lastLine}…`;
    }
    visibleLines.forEach((value, index) => context.fillText(value, x, y + index * lineHeight));
    return y + visibleLines.length * lineHeight;
  }

  async function createShareCard(message) {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot create a share card.');
    const background = context.createLinearGradient(0, 0, 1200, 630);
    background.addColorStop(0, '#0c111b');
    background.addColorStop(1, '#182538');
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < 48; index += 1) {
      const x = (index * 197 + 41) % canvas.width;
      const y = (index * 113 + 23) % canvas.height;
      context.fillStyle = index % 4 === 0 ? 'rgba(255,116,79,.75)' : 'rgba(222,232,245,.5)';
      context.fillRect(x, y, index % 7 === 0 ? 3 : 2, index % 7 === 0 ? 3 : 2);
    }
    context.fillStyle = '#ff744f';
    context.fillRect(0, 0, 8, canvas.height);
    context.fillStyle = '#f3f6fb';
    context.font = '700 19px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    context.fillText('ROCKETGPT', 72, 72);
    context.fillStyle = '#ff9a7e';
    context.font = '500 12px ui-monospace, SFMono-Regular, Menlo, monospace';
    context.fillText('ROCKET 2.0 · AN IDEA IN MOTION', 72, 99);

    const prompt = getSourcePrompt(message) || 'A conversation with Rocket 2.0';
    context.fillStyle = 'rgba(8,11,18,.72)';
    context.fillRect(72, 132, 1056, 124);
    context.fillStyle = '#ff9a7e';
    context.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
    context.fillText('THE PROMPT', 96, 160);
    context.fillStyle = '#f3f6fb';
    context.font = '500 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    drawWrappedText(context, prompt.slice(0, 260), 96, 194, 1000, 29, 2);

    context.fillStyle = 'rgba(8,11,18,.72)';
    context.fillRect(72, 276, 1056, 270);
    context.fillStyle = '#8ee4e2';
    context.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
    context.fillText('THE RESPONSE', 96, 305);
    context.fillStyle = '#e0e7f0';
    context.font = '400 17px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    drawWrappedText(context, message.content.replace(/```[\s\S]*?```/g, '[code snippet]').slice(0, 900), 96, 340, 1000, 26, 7);
    context.fillStyle = '#9eabba';
    context.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    context.fillText('AI-generated · check important details', 72, 590);
    context.fillStyle = '#ff9a7e';
    context.textAlign = 'right';
    context.fillText('rocketgpt.net', 1128, 590);
    context.textAlign = 'left';

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('The share card image could not be created.'));
      }, 'image/png');
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function answerShareUrl(message) {
    const url = new URL(document.querySelector('meta[property="og:url"]')?.content || window.location.href);
    const prompt = getSourcePrompt(message);
    if (prompt) url.searchParams.set('prompt', prompt);
    return url.toString();
  }

  async function shareAnswer(message, button) {
    button.disabled = true;
    button.textContent = 'Preparing card…';
    try {
      const blob = await createShareCard(message);
      const shareUrl = answerShareUrl(message);
      if (navigator.share && navigator.canShare && typeof File === 'function') {
        const file = new File([blob], 'rocketgpt-answer.png', { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'A RocketGPT answer',
            text: `A prompt and response from Rocket 2.0. ${getSourcePrompt(message)}`,
            url: shareUrl
          });
          button.textContent = 'Card shared';
          return;
        }
      }
      downloadBlob(blob, 'rocketgpt-answer.png');
      button.textContent = 'Card downloaded';
    } catch (error) {
      if (error.name !== 'AbortError') button.textContent = error.message || 'Share unavailable';
    } finally {
      button.disabled = false;
      window.setTimeout(() => { button.textContent = 'Share answer ↗'; }, 2200);
    }
  }

  async function copyPromptLink(message, button) {
    try {
      await copyText(answerShareUrl(message));
      button.textContent = 'Prompt link copied';
    } catch {
      button.textContent = 'Copy unavailable';
    }
    window.setTimeout(() => { button.textContent = 'Copy prompt link'; }, 1800);
  }

  async function downloadAnswerCard(message, button) {
    button.disabled = true;
    button.textContent = 'Preparing…';
    try {
      downloadBlob(await createShareCard(message), 'rocketgpt-answer.png');
      button.textContent = 'Downloaded';
    } catch (error) {
      button.textContent = error.message || 'Download unavailable';
    } finally {
      button.disabled = false;
      window.setTimeout(() => { button.textContent = 'Download card'; }, 2200);
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
    const copyButton = document.createElement('button');
    const regenerateButton = document.createElement('button');
    const promptLinkButton = document.createElement('button');
    const downloadCardButton = document.createElement('button');
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
    shareButton.addEventListener('click', () => shareAnswer(message, shareButton));
    copyButton.className = 'share-answer';
    copyButton.type = 'button';
    copyButton.textContent = 'Copy answer';
    copyButton.setAttribute('aria-label', 'Copy this Rocket 2.0 answer');
    copyButton.addEventListener('click', async () => {
      try {
        await copyText(message.content);
        copyButton.textContent = 'Copied';
      } catch {
        copyButton.textContent = 'Copy unavailable';
      }
      window.setTimeout(() => { copyButton.textContent = 'Copy answer'; }, 1800);
    });
    regenerateButton.className = 'share-answer regenerate-answer';
    regenerateButton.type = 'button';
    regenerateButton.textContent = 'Regenerate';
    regenerateButton.disabled = cooldownUntil > Date.now();
    regenerateButton.setAttribute('aria-label', 'Regenerate this answer');
    regenerateButton.addEventListener('click', () => regenerateAnswer(message));
    promptLinkButton.className = 'share-answer';
    promptLinkButton.type = 'button';
    promptLinkButton.textContent = 'Copy prompt link';
    promptLinkButton.addEventListener('click', () => copyPromptLink(message, promptLinkButton));
    downloadCardButton.className = 'share-answer';
    downloadCardButton.type = 'button';
    downloadCardButton.textContent = 'Download card';
    downloadCardButton.addEventListener('click', () => downloadAnswerCard(message, downloadCardButton));
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
    action.append(nextButton, shareButton, copyButton, regenerateButton, promptLinkButton, downloadCardButton, ...feedbackButtons, feedbackStatus);
    elements.messages.appendChild(action);
  }

  async function regenerateAnswer(message) {
    if (responseInProgress || activeRequest || cooldownUntil > Date.now()) return;
    const messageIndex = conversation.indexOf(message);
    const userMessage = conversation[messageIndex - 1];
    const userElement = messageElements.get(userMessage);
    const assistantElement = messageElements.get(message);
    if (messageIndex < 1 || userMessage?.role !== 'user' || !userElement || !assistantElement) return;

    let node = assistantElement;
    while (node) {
      const next = node.nextElementSibling;
      node.remove();
      node = next;
    }
    conversation.splice(messageIndex);
    saveActiveThread();
    await sendMessage({ existingUserMessage: userMessage, userElement });
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

  function revealResponse(messageElement, content) {
    const generation = ++revealGeneration;
    const bubble = messageElement.querySelector('.bubble');
    const sources = bubble.querySelector('.message-sources');
    const textNode = document.createTextNode('');
    let position = 0;
    const chunkSize = Math.max(1, Math.ceil(content.length / 100));
    bubble.replaceChildren(textNode);
    messageElement.setAttribute('aria-live', 'off');
    return new Promise((resolve) => {
      function revealChunk() {
        if (generation !== revealGeneration) {
          resolve(false);
          return;
        }
        position = Math.min(content.length, position + chunkSize);
        textNode.textContent = content.slice(0, position);
        if (position === content.length) {
          renderMarkdown(bubble, content);
          if (sources) bubble.appendChild(sources);
          messageElement.setAttribute('aria-live', 'polite');
          resolve(true);
          return;
        }
        window.setTimeout(revealChunk, 14);
      }
      revealChunk();
    });
  }

  function startCooldown(seconds, persist = true) {
    cooldownUntil = Date.now() + Math.max(1, Math.ceil(seconds)) * 1000;
    window.clearTimeout(cooldownTimer);
    if (persist) {
      try {
        localStorage.setItem(cooldownStorageKey, String(cooldownUntil));
      } catch {
        elements.historyStatus.textContent = 'Cooldown is active for this page; browser storage is unavailable.';
      }
    }

    elements.fuelStatus.hidden = false;
    elements.fuelProgress.max = 30;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      elements.fuelProgress.value = Math.max(0, 30 - remaining);
      elements.fuelCountdown.textContent = `${remaining}s`;
      elements.send.disabled = remaining > 0 || responseInProgress;
      document.querySelectorAll('.regenerate-answer').forEach((button) => {
        button.disabled = remaining > 0 || responseInProgress;
      });
      if (!remaining) {
        elements.fuelStatus.hidden = true;
        window.clearTimeout(cooldownTimer);
        cooldownTimer = undefined;
        try {
          localStorage.removeItem(cooldownStorageKey);
        } catch {
          elements.historyStatus.textContent = 'Cooldown ended; the saved timer could not be cleared.';
        }
        return;
      }
      cooldownTimer = window.setTimeout(update, 250);
    };
    update();
  }

  function restoreCooldown() {
    try {
      const storedUntil = Number(localStorage.getItem(cooldownStorageKey));
      if (Number.isFinite(storedUntil) && storedUntil > Date.now()) {
        startCooldown(Math.ceil((storedUntil - Date.now()) / 1000), false);
      } else {
        localStorage.removeItem(cooldownStorageKey);
      }
    } catch {
      elements.historyStatus.textContent = 'Saved cooldown is unavailable; the chat can still be used.';
    }
  }

  async function requestReply() {
    const controller = new AbortController();
    activeRequest = controller;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, requestTimeoutMs);
    try {
      const viralMode = elements.viralMode.getAttribute('aria-pressed') === 'true';
      const launchMode = elements.launchMode.value;
      const response = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai-fast',
          messages: [
            { role: 'system', content: buildDirectApiInstructions(viralMode, launchMode) },
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
          const error = new Error('The free AI service is cooling down. Your prompt is ready to retry when the fuel gauge refills.');
          error.cooldownSeconds = 30;
          throw error;
        }
        const providerError = data?.error?.message || data?.error;
        throw new Error(providerError || `The AI service is unavailable (HTTP ${response.status}).`);
      }
      const reply = data?.choices?.[0]?.message?.content;
      if (typeof reply !== 'string' || !reply.trim()) {
        throw new Error('The AI returned an empty response. Please try again.');
      }
      return { reply, citations: [], launchMode };
    } catch (error) {
      if (timedOut) throw new Error('The AI request took too long. Your message is ready to retry.');
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
      if (activeRequest === controller) activeRequest = undefined;
    }
  }

  function showRequestError(error, onRetry) {
    const message = createMessage(`Connection issue: ${error.message}`, 'assistant');
    const bubble = message.querySelector('.bubble');
    const retry = document.createElement('button');
    message.setAttribute('role', 'status');
    retry.className = 'retry-request';
    retry.type = 'button';
    retry.textContent = 'Retry message';
    retry.addEventListener('click', () => {
      message.remove();
      if (onRetry) onRetry();
      else elements.composer.requestSubmit();
    });
    bubble.appendChild(retry);
    elements.messages.appendChild(message);
    message.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function discardPendingMessage(threadId, pendingMessage, userElement) {
    if (conversation.at(-1) === pendingMessage) conversation.pop();
    userElement.remove();
    const savedThread = savedThreads.find((thread) => thread.id === threadId);
    if (savedThread?.messages.at(-1) === pendingMessage) {
      savedThread.messages.pop();
      if (savedThread.messages.length) {
        savedThread.updatedAt = Date.now();
      } else {
        savedThreads = savedThreads.filter((thread) => thread.id !== threadId);
      }
      persistSavedThreads();
    }

    if (activeThreadId === threadId) {
      if (conversation.length) saveActiveThread();
      else activeThreadId = undefined;
    } else {
      renderThreadList();
    }
  }

  async function sendMessage(options = {}) {
    const text = options.existingUserMessage?.content || elements.prompt.value.trim();
    if (!text || responseInProgress || activeRequest || cooldownUntil > Date.now()) return;

    elements.emptyState.hidden = true;
    responseInProgress = true;
    const userMessage = options.existingUserMessage || { role: 'user', content: text };
    const userElement = options.userElement || addMessage(text, 'user');
    messageElements.set(userMessage, userElement);
    if (!options.existingUserMessage) conversation.push(userMessage);
    saveActiveThread();
    const requestThreadId = activeThreadId;
    elements.prompt.value = '';
    elements.prompt.style.height = 'auto';
    elements.send.disabled = true;
    elements.launchMode.disabled = true;
    const typingMessage = showTyping();

    try {
      const { reply, citations, launchMode } = await requestReply();
      typingMessage.remove();
      startCooldown(30);
      const assistantMessage = { role: 'assistant', content: reply, prompt: userMessage.content, citations: Array.isArray(citations) ? citations : [], mode: launchMode };
      conversation.push(assistantMessage);
      saveActiveThread();
      const assistantElement = addMessage('', 'assistant', citations);
      messageElements.set(assistantMessage, assistantElement);
      if (await revealResponse(assistantElement, reply)) addNextVector(assistantMessage);
    } catch (error) {
      if (error.name === 'AbortError') {
        typingMessage.remove();
        if (!options.existingUserMessage) discardPendingMessage(requestThreadId, userMessage, userElement);
        return;
      }
      typingMessage.remove();
      if (options.existingUserMessage) {
        saveActiveThread();
      } else {
        discardPendingMessage(requestThreadId, userMessage, userElement);
      }
      elements.prompt.value = text;
      elements.prompt.dispatchEvent(new Event('input', { bubbles: true }));
      if (error.cooldownSeconds) startCooldown(error.cooldownSeconds);
      else showRequestError(error, options.existingUserMessage ? () => sendMessage(options) : undefined);
    } finally {
      responseInProgress = false;
      elements.launchMode.disabled = false;
      elements.send.disabled = cooldownUntil > Date.now();
    }
  }

  elements.composer.addEventListener('submit', (event) => {
    event.preventDefault();
    sendMessage();
  });

  elements.shareApp.addEventListener('click', shareApp);
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
    if (event.key === 'Enter' && (!event.shiftKey || event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      elements.composer.requestSubmit();
    }
  });

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const isEditing = target instanceof HTMLElement
      && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      startNewChat();
    } else if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !isEditing) {
      event.preventDefault();
      elements.prompt.focus();
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

  elements.launchMode.addEventListener('change', () => {
    updateModeControl();
    if (conversation.length) saveActiveThread();
  });
  elements.exportMarkdown.addEventListener('click', () => exportActiveThread('markdown'));
  elements.exportText.addEventListener('click', () => exportActiveThread('text'));
  elements.historySearch.addEventListener('input', renderThreadList);
  elements.mobileHistory.addEventListener('click', () => {
    const isOpen = elements.sidebar.classList.toggle('is-open');
    elements.sidebarBackdrop.hidden = !isOpen;
    elements.mobileHistory.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) elements.historySearch.focus();
  });
  elements.sidebarBackdrop.addEventListener('click', closeHistoryDrawer);

  updateModeControl();
  renderThreadList();
  restoreCooldown();

  const sharedPrompt = new URLSearchParams(window.location.search).get('prompt');
  if (sharedPrompt) {
    elements.prompt.value = sharedPrompt.slice(0, 4000);
    elements.prompt.dispatchEvent(new Event('input', { bubbles: true }));
    if (new URLSearchParams(window.location.search).get('launch') === '1') {
      window.setTimeout(() => elements.composer.requestSubmit(), 0);
    } else {
      elements.prompt.focus();
    }
  }
})();
