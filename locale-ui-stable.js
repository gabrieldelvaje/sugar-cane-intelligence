/* Only the interface and question builder are translated here. Responses are
   rendered by locale-answers.js, follow-ups by locale-followups.js. */
(() => {
  'use strict';
  const i18n = window.SCIi18n;
  const dictionary = window.SCIuiStrings;
  const header = document.querySelector('.topbar');
  const theme = document.querySelector('#theme-toggle');
  const form = document.querySelector('#question-form');
  const input = document.querySelector('#question');
  const submit = form?.querySelector('button[type="submit"]');
  const initial = document.querySelector('#suggestions');
  const conversation = document.querySelector('#conversation');
  const panel = document.querySelector('#question-builder-panel');
  if (!i18n || !dictionary || !header || !theme || !form || !initial || !panel || !conversation) return;

  const textSources = new WeakMap();
  const attributeSources = new WeakMap();
  let inRefresh = false;
  function translated(value) {
    const source = String(value ?? '');
    const parts = source.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const core = parts[2];
    let output = dictionary[core];
    if (!output && /^(?:Qual|Quais|Compare a)\b/i.test(core)) {
      output = i18n.toEnglishQuestion(core);
    }
    if (!output) {
      const step = core.match(/^Etapa (\d+) de (\d+)$/);
      const compare = core.match(/^Comparar com (.+)\.$/);
      if (step) output = `Step ${step[1]} of ${step[2]}`;
      else if (compare) output = `Compare with ${compare[1]}.`;
    }
    return output ? parts[1] + output + parts[3] : source;
  }

  function localizeText(node) {
    if (!node.nodeValue?.trim()) return;
    const value = node.nodeValue;
    let source = textSources.get(node);
    if (!source || (value !== source.pt && value !== source.en)) {
      // Other scripts can add a state suffix such as (SP) after a question
      // was translated. Respect that change rather than reinstating stale
      // text and entering a loop with the state-labeling observer.
      const alreadyEnglish = /^(?:Which|What|Compare|How|Show|List)\b/i.test(value.trim());
      source = alreadyEnglish
        ? { pt: i18n.toPortugueseQuestion(value), en: value }
        : { pt: value, en: translated(value) };
      textSources.set(node, source);
    }
    const desired = i18n.get() === 'en' ? source.en : source.pt;
    if (value !== desired) node.nodeValue = desired;
  }

  function localizeAttributes(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    let stored = attributeSources.get(node);
    if (!stored) { stored = new Map(); attributeSources.set(node, stored); }
    for (const name of ['placeholder', 'title', 'aria-label']) {
      const current = node.getAttribute(name);
      if (current === null) continue;
      let source = stored.get(name);
      if (!source || (current !== source.pt && current !== source.en)) {
        source = { pt: current, en: translated(current) };
        stored.set(name, source);
      }
      const desired = i18n.get() === 'en' ? source.en : source.pt;
      if (current !== desired) node.setAttribute(name, desired);
    }
  }

  function localize(root) {
    if (!root) return;
    localizeAttributes(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (walker.currentNode.nodeType === Node.TEXT_NODE) localizeText(walker.currentNode);
      else localizeAttributes(walker.currentNode);
    }
  }

  const control = document.createElement('div');
  control.className = 'sci-language-control';
  control.innerHTML = '<button type="button" class="sci-language-toggle" aria-label="Idioma / Language" aria-controls="sci-language-menu" aria-expanded="false" aria-haspopup="true"><span class="sci-language-current">PT</span><span aria-hidden="true">⌄</span></button>' +
    '<div id="sci-language-menu" class="sci-language-menu" role="group" aria-label="Idioma / Language" hidden>' +
    '<button type="button" data-language="pt" lang="pt-BR">Português</button>' +
    '<button type="button" data-language="en" lang="en">English</button></div>';
  header.insertBefore(control, theme);
  const toggle = control.querySelector('.sci-language-toggle');
  const menu = control.querySelector('.sci-language-menu');
  const current = control.querySelector('.sci-language-current');
  function openMenu(open) {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  }
  toggle.addEventListener('click', () => openMenu(menu.hidden));
  document.addEventListener('click', event => {
    if (!control.contains(event.target)) openMenu(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) {
      openMenu(false);
      toggle.focus({ preventScroll: true });
    }
  });

  function refreshConversation() {
    if (!window.state?.ready || submit?.disabled) return;
    for (const response of conversation.querySelectorAll('.message.assistant.chat-response')) {
      const questionNode = response.previousElementSibling;
      if (!questionNode?.classList.contains('user')) continue;
      const question = questionNode.querySelector('.message-content p')?.textContent;
      const content = response.querySelector('.message-content');
      if (!content || !question) continue;
      const followups = content.querySelector('.follow-up-suggestions');
      if (followups) followups.remove();
      try {
        const ptQuestion = i18n.toPortugueseQuestion(question);
        content.innerHTML = answer(i18n.get() === 'en' ? question : ptQuestion);
      } catch (_) { /* Preserve the original result when data are unavailable. */ }
      if (followups) content.append(followups);
    }
  }

  function refresh(switched = false) {
    if (inRefresh) return;
    inRefresh = true;
    try {
      const language = i18n.get();
      if (current.textContent !== language.toUpperCase()) current.textContent = language.toUpperCase();
      for (const button of control.querySelectorAll('[data-language]')) {
        const selected = String(button.dataset.language === language);
        if (button.getAttribute('aria-pressed') !== selected) button.setAttribute('aria-pressed', selected);
      }
      for (const selector of ['.brand-copy', '#home-hero > h1', '#home-hero > p',
        '#loading-card', '#new-chat', '#theme-toggle', '#question-builder-toggle',
        '#question-form', '#question-builder-panel', '#suggestions']) {
        localize(document.querySelector(selector));
      }
      if (switched) refreshConversation();
    } finally { inRefresh = false; }
  }

  for (const button of control.querySelectorAll('[data-language]')) {
    button.addEventListener('click', () => {
      if (button.dataset.language !== i18n.get()) {
        i18n.set(button.dataset.language);
        refresh(true);
      }
      openMenu(false);
      toggle.focus({ preventScroll: true });
    });
  }

  conversation.addEventListener('click', event => {
    if (i18n.get() !== 'en') return;
    const button = event.target.closest('.follow-up-suggestions button');
    if (!button || button.disabled || submit?.disabled || !conversation.contains(button)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = i18n.toEnglishQuestion(button.textContent.trim());
    form.requestSubmit();
  }, true);
  document.addEventListener('submit', event => {
    if (event.target === form && i18n.get() === 'en') {
      input.value = i18n.toEnglishQuestion(input.value);
    }
  }, true);

  // Crucial: do not observe #conversation. Its streaming words, suggestions
  // and state abbreviations must never trigger another interface repaint.
  const observer = new MutationObserver(records => {
    if (!inRefresh && records.length) refresh();
  });
  observer.observe(panel, { childList: true, subtree: true, characterData: true });
  observer.observe(initial, { childList: true, subtree: true, characterData: true });
  observer.observe(document.querySelector('#loading-card'), {
    childList: true, subtree: true, characterData: true
  });
  observer.observe(document.querySelector('#question-builder-toggle'), {
    attributes: true, attributeFilter: ['title', 'aria-label']
  });
  if (submit) observer.observe(submit, {
    attributes: true, attributeFilter: ['aria-label']
  });
  refresh();
})();