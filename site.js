(() => {
  'use strict';

  const storageKey = 'rocketgpt-color-theme';
  const root = document.documentElement;
  let theme = document.querySelector('meta[name="default-theme"]')?.content === 'light' ? 'light' : 'dark';

  try {
    const savedTheme = localStorage.getItem(storageKey);
    if (savedTheme === 'light' || savedTheme === 'dark') theme = savedTheme;
  } catch {
    // Theme preferences are optional when browser storage is unavailable.
  }

  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#080b12' : '#ffffff');

  const button = document.createElement('button');
  button.className = 'theme-toggle';
  button.type = 'button';
  button.setAttribute('aria-label', 'Switch to light theme');

  function updateButton() {
    const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    button.textContent = `${nextTheme === 'light' ? '☼' : '☾'} ${nextTheme} mode`;
    button.setAttribute('aria-label', `Switch to ${nextTheme} theme`);
    button.setAttribute('aria-pressed', String(root.dataset.theme === 'light'));
  }

  function setupHomepagePrompts() {
    const promptText = document.getElementById('dailyPrompt');
    const outputText = document.getElementById('dailyOutput');
    const dailyButton = document.getElementById('dailyPromptLaunch');
    const heroInput = document.getElementById('heroPrompt');
    if (!promptText || !outputText || !dailyButton || !heroInput) return;

    const prompts = [
      {
        prompt: 'What is one ordinary thing I could explain in a way that makes someone see it differently?',
        output: 'A good explanation can turn a familiar object into a tiny design story: what problem it solves, what tradeoff it makes, and what you would change.'
      },
      {
        prompt: 'Help me turn one small win from this week into a useful, honest story.',
        output: 'Start with the moment, name what made it harder than expected, and end with one thing someone else can try.'
      },
      {
        prompt: 'Give me five thoughtful questions to ask before I say yes to a new project.',
        output: 'Try asking what success looks like, what can move, who decides, what is already committed, and what a smaller first step could be.'
      },
      {
        prompt: 'Suggest a tiny creative challenge I can finish in 20 minutes with things I already have.',
        output: 'Choose a nearby object, write a six-line field guide to it, and include one detail you usually overlook.'
      }
    ];
    const dayNumber = Math.floor(Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate()
    ) / 86_400_000);
    const daily = prompts[((dayNumber % prompts.length) + prompts.length) % prompts.length];
    promptText.textContent = daily.prompt;
    outputText.textContent = daily.output;
    dailyButton.dataset.promptOfDay = daily.prompt;

    document.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-fill-prompt], [data-prompt-of-day]');
      if (!trigger) return;
      const prompt = trigger.dataset.fillPrompt || trigger.dataset.promptOfDay;
      if (!prompt) return;
      heroInput.value = prompt;
      heroInput.focus();
    });
  }

  function mountButton() {
    const header = document.querySelector('.header-actions, .topbar-actions, .site-header, .topbar, header');
    if (header && !document.querySelector('.theme-toggle')) {
      header.appendChild(button);
      updateButton();
    }
    setupHomepagePrompts();
  }

  button.addEventListener('click', () => {
    theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#080b12' : '#ffffff');
    try {
      localStorage.setItem(storageKey, theme);
    } catch {
      // The selected theme remains active until this page is closed.
    }
    updateButton();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountButton, { once: true });
  } else {
    mountButton();
  }
})();
