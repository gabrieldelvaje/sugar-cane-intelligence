/* Chat controller: a single send path for typed and suggested questions. */
(() => {
  'use strict';
  const form = document.querySelector('#question-form');
  const input = document.querySelector('#question');
  const initial = document.querySelector('#suggestions');
  const reset = document.querySelector('#new-chat');
  const conversation = document.querySelector('#conversation');
  const page = document.querySelector('.page-shell');
  const hero = document.querySelector('#home-hero');
  const template = document.querySelector('#message-template');
  const submit = form?.querySelector('button[type="submit"]');
  if (!form || !input || !initial || !reset || !conversation || !page || !hero || !template ||
      !submit || typeof answer !== 'function' || typeof state === 'undefined') return;

  const EASE = 'cubic-bezier(.22, 1, .36, 1)';
  const questions = [
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
  let round = 0;
  let busy = false;
  let previous = [];
  const animations = new Set();
  // Animation is always on. Keep only the light/dark theme control in the header.
  const motionOn = true;

  function bottom() {
    // Repeated smooth scrolling on every token makes Chrome lag and jump.
    window.scrollTo({ top: Math.max(0, document.documentElement.scrollHeight - innerHeight), behavior: 'instant' });
  }
  function message(role) {
    const element = template.content.firstElementChild.cloneNode(true);
    element.classList.add(role);
    conversation.append(element);
    return element;
  }
  async function animate(element, frames, opts) {
    if (!motionOn || !element.animate) return;
    const effect = element.animate(frames, { duration: 350, easing: EASE, fill: 'both', ...opts });
    animations.add(effect);
    try { await effect.finished; } catch (_) { /* New chat cancels pending animations. */ }
    finally { animations.delete(effect); effect.cancel(); }
  }
  const normalize = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  function suggestions(content, prompt) {
    const recent = new Set(previous.map(normalize));
    const choices = questions.filter(q => normalize(q) !== normalize(prompt) && !recent.has(normalize(q)));
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    previous = choices.slice(0, 2);
    const group = document.createElement('div');
    group.className = 'follow-up-suggestions';
    group.setAttribute('aria-label', 'Sugestões de próximas perguntas');
    const caption = document.createElement('p');
    caption.className = 'follow-up-label';
    caption.textContent = 'Você também pode perguntar';
    group.append(caption);
    for (const question of previous) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = question;
      button.addEventListener('click', () => send(question));
      group.append(button);
    }
    content.append(group);
    return group;
  }
  function prepare(content) {
    const textBlocks = [...content.querySelectorAll('.result-title, .answer, .error')];
    const deferred = [...content.children].filter(el => !textBlocks.includes(el));
    deferred.forEach(el => el.classList.add('chat-deferred'));
    const tokens = [];
    for (const block of textBlocks) {
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        const words = node.textContent.match(/\s*\S+\s*/gu);
        if (!words) continue;
        node.textContent = '';
        words.forEach(word => tokens.push({ node, word }));
      }
    }
    return { tokens, deferred };
  }
  async function stream(content, prepared, active) {
    const { tokens, deferred } = prepared;
    if (!motionOn || !tokens.length) {
      tokens.forEach(({ node, word }) => { node.textContent += word; });
    } else {
      const caret = document.createElement('span');
      caret.className = 'chat-stream-cursor';
      caret.setAttribute('aria-hidden', 'true');
      const interval = Math.max(32, Math.min(78, 3600 / tokens.length));
      await new Promise(done => {
        let started;
        let index = 0;
        function frame(now) {
          if (!active()) { caret.remove(); done(); return; }
          if (started === undefined) started = now;
          const target = document.hidden ? tokens.length : Math.min(tokens.length, 1 + Math.floor((now - started) / interval));
          while (index < target) {
            const { node, word } = tokens[index++];
            node.textContent += word;
            node.after(caret);
          }
          bottom();
          if (index < tokens.length) requestAnimationFrame(frame);
          else { caret.remove(); done(); }
        }
        requestAnimationFrame(frame);
      });
    }
    if (!active()) return;
    for (const block of deferred) {
      block.classList.remove('chat-deferred');
      if (motionOn && block.animate) block.animate([
        { opacity: 0, transform: 'translateY(7px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 320, easing: EASE });
    }
    bottom();
  }

  async function send(question) {
    const prompt = String(question ?? '').trim();
    if (!prompt || busy) return;
    busy = true;
    const token = ++round;
    const active = () => token === round;
    input.value = '';
    input.disabled = true;
    submit.disabled = true;
    hero.hidden = true;
    page.classList.add('chat-started');

    const user = message('user');
    const userContent = user.querySelector('.message-content');
    const text = document.createElement('p');
    text.textContent = prompt;
    userContent.append(text);
    bottom();
    const field = form.getBoundingClientRect();
    const bubble = userContent.getBoundingClientRect();
    const dx = Math.max(-36, Math.min(36, field.right - bubble.right));
    const dy = Math.max(24, field.top - bubble.top + 16);
    await animate(user, [
      { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(.95)` },
      { opacity: 1, transform: 'translate(0, 0) scale(1)' }
    ], { duration: 530 });
    if (!active()) return;

    const typing = message('assistant');
    typing.classList.add('chat-typing-message');
    typing.setAttribute('role', 'status');
    typing.setAttribute('aria-label', 'Preparando resposta');
    const dots = document.createElement('span');
    dots.className = 'chat-typing-dots';
    dots.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i++) dots.append(document.createElement('i'));
    typing.querySelector('.message-content').append(dots);
    bottom();
    await animate(typing, [
      { opacity: 0, transform: 'translateY(9px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 240 });
    if (!active()) return;
    if (motionOn) await Promise.all([...dots.children].map((dot, i) => animate(dot, [
      { opacity: .4, transform: 'translateY(0) scale(1)' },
      { opacity: 1, transform: 'translateY(-5px) scale(1.08)', offset: .48 },
      { opacity: .4, transform: 'translateY(0) scale(1)' }
    ], { duration: 430, delay: i * 90, iterations: 3, easing: 'ease-in-out' })));
    if (!active()) return;

    let html;
    try {
      html = state.ready ? answer(prompt)
        : '<div class="error">A base ainda está carregando. Tente novamente em alguns segundos.</div>';
    } catch (error) {
      html = '<div class="error">Não consegui analisar esta pergunta: ' + esc(error.message) + '</div>';
    }
    const isError = /class="error"/.test(html);
    const response = message('assistant');
    response.classList.add('chat-response');
    const content = response.querySelector('.message-content');
    content.innerHTML = html;
    const prepared = prepare(content);
    typing.remove();
    bottom();
    await animate(response, [
      { opacity: 0, transform: 'translateY(12px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 360 });
    if (!active()) return;
    await stream(content, prepared, active);
    if (!active()) return;
    if (!isError) {
      const options = suggestions(content, prompt);
      await animate(options, [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 320 });
    }
    if (!active()) return;
    busy = false;
    input.disabled = false;
    submit.disabled = false;
    bottom();
    input.focus({ preventScroll: true });
  }

  // app.js still has instant-render handlers. Capture and stop these events
  // so they cannot bypass the sequenced chat animation.
  form.addEventListener('submit', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    send(input.value);
  }, true);
  initial.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || !initial.contains(button)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    send(button.textContent);
  }, true);
  reset.addEventListener('click', () => {
    round++;
    animations.forEach(animation => animation.cancel());
    animations.clear();
    previous = [];
    busy = false;
    input.disabled = false;
    submit.disabled = false;
    page.classList.remove('chat-started');
    // The original handler clears the conversation and restores initial buttons.
  }, true);
})();