/* Chat UI controller: the original app.js still handles data loading and answer().
   Capture the two input routes before its legacy handlers can append full answers.
   Like the portfolio preview, transitions use the Web Animations API and await
   animation.finished; progressive text uses requestAnimationFrame. */
(() => {
  'use strict';

  const form = document.querySelector('#question-form');
  const input = document.querySelector('#question');
  const starter = document.querySelector('#suggestions');
  const resetButton = document.querySelector('#new-chat');
  const conversation = document.querySelector('#conversation');
  const page = document.querySelector('.page-shell');
  const hero = document.querySelector('#home-hero');
  const template = document.querySelector('#message-template');
  if (!form || !input || !starter || !resetButton || !conversation || !page || !hero || !template ||
      typeof answer !== 'function' || typeof state === 'undefined') return;

  const MOTION = 'cubic-bezier(.22, 1, .36, 1)';
  const questionPool = [
    'Quais são os 5 municípios com maior produção em 2024?',
    'Qual foi a produção de cana em Piracicaba em 2024?',
    'Compare a produção de Piracicaba e Ribeirão Preto entre 2010 e 2024.',
    'Quais municípios tiveram maior produtividade em São Paulo em 2024?',
    'Qual foi a precipitação em Ribeirão Preto em 2024?',
    'Qual município teve maior área colhida em 2024?',
    'Qual foi a temperatura média em Piracicaba em 2024?',
    'Quais são os 10 maiores produtores de Minas Gerais em 2020?',
    'Compare a produtividade de Piracicaba e Ribeirão Preto entre 2010 e 2024.',
    'Qual município teve maior produção em Goiás em 2024?',
    'Qual foi a área colhida em Piracicaba em 2024?',
    'Quais municípios tiveram maior precipitação em São Paulo em 2024?'
  ];

  let runId = 0;
  let busy = false;
  let previousSuggestions = [];
  const runningAnimations = new Set();
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const normalize = value => String(value).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  function scrollLatest() {
    // Instant scrolling keeps the newest text above the fixed input. Animating
    // the scroll itself on every token makes the Chrome viewport lag or jump.
    window.scrollTo({ top: Math.max(0, document.documentElement.scrollHeight - innerHeight), behavior: 'instant' });
  }

  function createMessage(role) {
    const message = template.content.firstElementChild.cloneNode(true);
    message.classList.add(role);
    conversation.append(message);
    return message;
  }

  async function animate(element, frames, options) {
    if (reducedMotion() || !element.animate) return;
    const animation = element.animate(frames, { easing: MOTION, fill: 'both', ...options });
    runningAnimations.add(animation);
    try { await animation.finished; } catch (_) { /* A new chat can cancel it. */ }
    finally { runningAnimations.delete(animation); animation.cancel(); }
  }

  function pickTwo(question) {
    const old = new Set(previousSuggestions.map(normalize));
    const asked = normalize(question);
    const candidates = questionPool.filter(q => normalize(q) !== asked && !old.has(normalize(q)));
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    previousSuggestions = candidates.slice(0, 2);
    return previousSuggestions;
  }

  function addFollowUps(content, question) {
    const suggestions = document.createElement('div');
    suggestions.className = 'follow-up-suggestions';
    suggestions.setAttribute('aria-label', 'Sugestões de próximas perguntas');
    const label = document.createElement('p');
    label.className = 'follow-up-label';
    label.textContent = 'Você também pode perguntar';
    suggestions.append(label);
    for (const suggestion of pickTwo(question)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = suggestion;
      button.addEventListener('click', () => send(suggestion));
      suggestions.append(button);
    }
    content.append(suggestions);
    return suggestions;
  }

  function prepareWords(content) {
    const blocks = [...content.querySelectorAll('.result-title, .answer')];
    if (!blocks.length) blocks.push(...content.querySelectorAll('.error'));
    // Keep the title and answer in the document, but reveal data tables,
    // KPI cards and follow-up buttons only after the text is finished.
    const deferred = [...content.children].filter(child => !blocks.some(block => child === block || child.contains(block)));
    deferred.forEach(element => element.classList.add('chat-deferred'));

    const tokens = [];
    for (const block of blocks) {
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        const parts = node.textContent.match(/\s*\S+\s*/gu);
        if (parts) {
          node.textContent = '';
          parts.forEach(text => tokens.push({ node, text }));
        }
      }
    }
    return { tokens, deferred };
  }

  async function typeWords(content, prepared, isCurrent) {
    const { tokens, deferred } = prepared;
    if (!tokens.length || reducedMotion()) {
      tokens.forEach(({ node, text }) => { node.textContent += text; });
    } else {
      const cursor = document.createElement('span');
      cursor.className = 'chat-stream-cursor';
      cursor.setAttribute('aria-hidden', 'true');
      const interval = Math.max(32, Math.min(78, 3600 / tokens.length));
      let next = 0;
      await new Promise(resolve => {
        let started;
        const frame = now => {
          if (!isCurrent()) { cursor.remove(); resolve(); return; }
          if (started === undefined) started = now;
          const target = document.hidden ? tokens.length : Math.min(tokens.length, Math.floor((now - started) / interval) + 1);
          while (next < target) {
            const { node, text } = tokens[next++];
            node.textContent += text;
            node.after(cursor);
          }
          scrollLatest();
          if (next < tokens.length) requestAnimationFrame(frame);
          else { cursor.remove(); resolve(); }
        };
        requestAnimationFrame(frame);
      });
    }
    if (!isCurrent()) return;
    for (const element of deferred) {
      element.classList.remove('chat-deferred');
      if (!reducedMotion()) {
        // All supporting data appears only after the answer has been typed.
        element.animate([{ opacity: 0, transform: 'translateY(7px)' },
                         { opacity: 1, transform: 'translateY(0)' }],
          { duration: 320, easing: MOTION });
      }
    }
    scrollLatest();
  }

  async function send(question) {
    const prompt = String(question ?? '').trim();
    if (!prompt || busy) return;
    busy = true;
    const token = ++runId;
    const isCurrent = () => token === runId;
    input.value = '';
    input.disabled = true;
    form.querySelector('button[type="submit"]').disabled = true;
    hero.hidden = true;
    page.classList.add('chat-started');

    const user = createMessage('user');
    const userContent = user.querySelector('.message-content');
    const bubble = document.createElement('p');
    bubble.textContent = prompt;
    userContent.append(bubble);
    scrollLatest();

    // Animate from the input box into the right-aligned farmer's message.
    const from = form.getBoundingClientRect();
    const to = userContent.getBoundingClientRect();
    const dx = Math.max(-36, Math.min(36, from.right - to.right));
    const dy = Math.max(24, from.top - to.top + 16);
    await animate(user, [
      { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(.95)` },
      { opacity: 1, transform: 'translate(0, 0) scale(1)' }
    ], { duration: 530 });
    if (!isCurrent()) return;

    // The left-side bot shows only three dots, each hopping three times.
    const typing = createMessage('assistant');
    typing.classList.add('chat-typing-message');
    typing.setAttribute('role', 'status');
    typing.setAttribute('aria-label', 'Preparando resposta');
    const dotWrap = document.createElement('span');
    dotWrap.className = 'chat-typing-dots';
    dotWrap.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i++) dotWrap.append(document.createElement('i'));
    typing.querySelector('.message-content').append(dotWrap);
    scrollLatest();
    await animate(typing, [
      { opacity: 0, transform: 'translateY(9px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 240 });
    if (!isCurrent()) return;

    if (!reducedMotion()) {
      const dots = [...dotWrap.children];
      await Promise.all(dots.map((dot, index) => animate(dot, [
        { opacity: .4, transform: 'translateY(0) scale(1)' },
        { opacity: 1, transform: 'translateY(-5px) scale(1.08)', offset: .48 },
        { opacity: .4, transform: 'translateY(0) scale(1)' }
      ], { duration: 430, delay: index * 90, iterations: 3, easing: 'ease-in-out' })));
    }
    if (!isCurrent()) return;

    let html;
    try {
      html = !state.ready
        ? '<div class="error">A base ainda está carregando. Tente novamente em alguns segundos.</div>'
        : answer(prompt);
    } catch (error) {
      html = '<div class="error">Não consegui analisar esta pergunta: ' + esc(error.message) + '</div>';
    }
    const hasError = /class="error"/.test(html);
    const response = createMessage('assistant');
    response.classList.add('chat-response');
    const content = response.querySelector('.message-content');
    content.innerHTML = html;
    const prepared = prepareWords(content);
    typing.remove();
    scrollLatest();
    await animate(response, [
      { opacity: 0, transform: 'translateY(12px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 360 });
    if (!isCurrent()) return;
    await typeWords(content, prepared, isCurrent);
    if (!isCurrent()) return;

    if (!hasError) {
      const suggestions = addFollowUps(content, prompt);
      await animate(suggestions, [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 320 });
    }
    if (!isCurrent()) return;
    busy = false;
    input.disabled = false;
    form.querySelector('button[type="submit"]').disabled = false;
    scrollLatest();
    input.focus({ preventScroll: true });
  }

  // app.js attached legacy handlers directly to these elements. Capture and
  // stop the events here so their old instant-render/scroll path never runs.
  form.addEventListener('submit', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    send(input.value);
  }, true);
  starter.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || !starter.contains(button)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    send(button.textContent);
  }, true);
  resetButton.addEventListener('click', () => {
    runId++;
    runningAnimations.forEach(animation => animation.cancel());
    runningAnimations.clear();
    previousSuggestions = [];
    busy = false;
    input.disabled = false;
    form.querySelector('button[type="submit"]').disabled = false;
    page.classList.remove('chat-started');
    // app.js' existing new-chat handler resets the messages and initial hero.
  }, true);
})();
