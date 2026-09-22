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

  let submitLoaderRaf = 0;
  let submitLoaderElement = null;
  let submitLoaderGroup = null;
  let submitLoaderShaft = null;
  let submitLoaderHead = null;
  let submitLoaderRotation = 0;
  let submitLoaderLastFrame = 0;
  let submitLoaderEntryPromise = null;

  const SUBMIT_SVG_NS = 'http://www.w3.org/2000/svg';
  const SUBMIT_STRAIGHT_PATH = [
    [12,19],
    [12,17.8],[12,16.7],[12,15.5],
    [12,14.3],[12,13.2],[12,12],
    [12,10.8],[12,9.7],[12,8.5],
    [12,7.3],[12,6.2],[12,5]
  ];
  const SUBMIT_CIRCLE_PATH = [
    [12,4],
    [16.42,4],[20,7.58],[20,12],
    [20,16.42],[16.42,20],[12,20],
    [7.58,20],[4,16.42],[4,12],
    [4,8],[6,5],[9,4.6]
  ];
  const SUBMIT_STRAIGHT_HEAD = [[8.5,8.5],[12,5],[15.5,8.5]];
  const SUBMIT_CIRCLE_HEAD = [[6.55,4.05],[9,4.6],[8.05,7.0]];

  const submitClamp = value => Math.max(0, Math.min(1, value));
  const submitEase = value => {
    const t = submitClamp(value);
    return t * t * (3 - 2 * t);
  };
  const submitLerp = (a, b, t) => a + (b - a) * t;

  function submitInterpolatedPoints(from, to, t) {
    return from.map((point, index) => [
      submitLerp(point[0], to[index][0], t),
      submitLerp(point[1], to[index][1], t)
    ]);
  }

  function submitPathD(points) {
    return `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)} ` +
      `C ${points[1][0].toFixed(2)} ${points[1][1].toFixed(2)} ${points[2][0].toFixed(2)} ${points[2][1].toFixed(2)} ${points[3][0].toFixed(2)} ${points[3][1].toFixed(2)} ` +
      `C ${points[4][0].toFixed(2)} ${points[4][1].toFixed(2)} ${points[5][0].toFixed(2)} ${points[5][1].toFixed(2)} ${points[6][0].toFixed(2)} ${points[6][1].toFixed(2)} ` +
      `C ${points[7][0].toFixed(2)} ${points[7][1].toFixed(2)} ${points[8][0].toFixed(2)} ${points[8][1].toFixed(2)} ${points[9][0].toFixed(2)} ${points[9][1].toFixed(2)} ` +
      `C ${points[10][0].toFixed(2)} ${points[10][1].toFixed(2)} ${points[11][0].toFixed(2)} ${points[11][1].toFixed(2)} ${points[12][0].toFixed(2)} ${points[12][1].toFixed(2)}`;
  }

  function submitHeadD(points) {
    return `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)} L ${points[1][0].toFixed(2)} ${points[1][1].toFixed(2)} L ${points[2][0].toFixed(2)} ${points[2][1].toFixed(2)}`;
  }

  function setSubmitArrowMorph(progress) {
    const t = submitEase(progress);
    if (submitLoaderShaft) {
      submitLoaderShaft.setAttribute('d', submitPathD(
        submitInterpolatedPoints(SUBMIT_STRAIGHT_PATH, SUBMIT_CIRCLE_PATH, t)
      ));
    }
    if (submitLoaderHead) {
      submitLoaderHead.setAttribute('d', submitHeadD(
        submitInterpolatedPoints(SUBMIT_STRAIGHT_HEAD, SUBMIT_CIRCLE_HEAD, t)
      ));
    }
  }

  function setSubmitArrowGroup(rotation = submitLoaderRotation, scale = 1) {
    if (!submitLoaderGroup) return;
    submitLoaderGroup.setAttribute(
      'transform',
      `translate(12 12) rotate(${rotation.toFixed(2)}) scale(${scale.toFixed(3)}) translate(-12 -12)`
    );
  }

  function cancelSubmitLoaderMotion() {
    cancelAnimationFrame(submitLoaderRaf);
    submitLoaderRaf = 0;
  }

  function animateSubmitMorph(from, to, duration) {
    cancelSubmitLoaderMotion();

    return new Promise(resolve => {
      const started = performance.now();

      const frame = now => {
        if (!submitLoaderElement) {
          resolve();
          return;
        }

        const raw = submitClamp((now - started) / duration);
        const eased = submitEase(raw);
        setSubmitArrowMorph(submitLerp(from, to, eased));

        // While the straight arrow bends into a ring, let it begin walking
        // around the center so the transition feels continuous.
        if (to > from) {
          submitLoaderRotation = 22 * eased;
          setSubmitArrowGroup(submitLoaderRotation, 1 - .04 * eased);
        } else {
          setSubmitArrowGroup(submitLoaderRotation * (1 - eased), 1);
        }

        if (raw < 1) submitLoaderRaf = requestAnimationFrame(frame);
        else resolve();
      };

      submitLoaderRaf = requestAnimationFrame(frame);
    });
  }

  function startSubmitCircularArrow() {
    if (!submit.classList.contains('is-loading') || !submitLoaderElement) return;
    submitLoaderLastFrame = performance.now();

    const frame = now => {
      if (!submit.classList.contains('is-loading') || !submitLoaderElement) return;

      const delta = Math.min(.034, Math.max(0, (now - submitLoaderLastFrame) / 1000));
      submitLoaderLastFrame = now;

      const radians = submitLoaderRotation * Math.PI / 180;
      const baseSpeed = 235;
      const speedFactor = 1 + .20 * Math.sin(radians + .7);
      submitLoaderRotation += baseSpeed * speedFactor * delta;

      setSubmitArrowGroup(submitLoaderRotation, .96);
      submitLoaderRaf = requestAnimationFrame(frame);
    };

    submitLoaderRaf = requestAnimationFrame(frame);
  }

  async function enterSubmitCircularArrow() {
    submitLoaderRotation = 0;
    setSubmitArrowMorph(0);
    setSubmitArrowGroup(0, 1);

    await animateSubmitMorph(0, 1, 520);

    if (!submit.classList.contains('is-loading') || !submitLoaderElement) return;
    setSubmitArrowMorph(1);
    setSubmitArrowGroup(submitLoaderRotation, .96);
    startSubmitCircularArrow();
  }

  async function finishSubmitCircularArrow() {
    cancelSubmitLoaderMotion();
    if (!submitLoaderElement) return;

    const startRotation = submitLoaderRotation;
    let targetRotation = Math.ceil(startRotation / 360) * 360;
    if (targetRotation - startRotation < 34) targetRotation += 360;
    const distance = targetRotation - startRotation;
    const duration = Math.max(260, Math.min(440, 220 + distance * .45));

    await new Promise(resolve => {
      const started = performance.now();

      const frame = now => {
        if (!submitLoaderElement) {
          resolve();
          return;
        }

        const raw = submitClamp((now - started) / duration);
        let progress;
        if (raw < .72) {
          const local = raw / .72;
          progress = .82 * local * local;
        } else {
          const local = (raw - .72) / .28;
          progress = .82 + .18 * (1 - Math.pow(1 - local, 3));
        }

        submitLoaderRotation = startRotation + distance * progress;
        const scale = .96 + .13 * Math.sin(Math.PI * raw);
        setSubmitArrowGroup(submitLoaderRotation, scale);

        if (raw < 1) submitLoaderRaf = requestAnimationFrame(frame);
        else resolve();
      };

      submitLoaderRaf = requestAnimationFrame(frame);
    });

    if (!submitLoaderElement) return;

    submitLoaderRotation = targetRotation;
    setSubmitArrowGroup(submitLoaderRotation, .96);

    // Once the circular arrow completes the fast final lap, straighten the
    // ring back into the original upward arrow.
    await animateSubmitMorph(1, 0, 420);
    submitLoaderRotation = 0;
    setSubmitArrowMorph(0);
    setSubmitArrowGroup(0, 1);
  }

  async function setSubmitLoading(loading, instant = false) {
    submit.setAttribute('aria-label', loading ? 'Gerando resposta' : 'Enviar pergunta');

    if (loading) {
      cancelSubmitLoaderMotion();
      submit.classList.remove('is-returning');
      submit.classList.add('is-loading');

      const svg = document.createElementNS(SUBMIT_SVG_NS, 'svg');
      svg.setAttribute('class', 'submit-circular-arrow');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');

      const group = document.createElementNS(SUBMIT_SVG_NS, 'g');
      const shaft = document.createElementNS(SUBMIT_SVG_NS, 'path');
      const head = document.createElementNS(SUBMIT_SVG_NS, 'path');

      shaft.setAttribute('class', 'submit-circular-arrow-shaft');
      head.setAttribute('class', 'submit-circular-arrow-head');
      group.append(shaft, head);
      svg.append(group);

      submit.replaceChildren(svg);
      submitLoaderElement = svg;
      submitLoaderGroup = group;
      submitLoaderShaft = shaft;
      submitLoaderHead = head;

      setSubmitArrowMorph(0);
      setSubmitArrowGroup(0, 1);

      submitLoaderEntryPromise = enterSubmitCircularArrow();
      return;
    }

    submit.classList.remove('is-loading');
    submit.classList.add('is-returning');

    if (!submitLoaderElement || instant) {
      cancelSubmitLoaderMotion();
      submitLoaderElement = null;
      submitLoaderGroup = null;
      submitLoaderShaft = null;
      submitLoaderHead = null;
      submitLoaderEntryPromise = null;
      submit.classList.remove('is-returning');
      submit.textContent = '↑';
      return;
    }

    if (submitLoaderEntryPromise) {
      try { await submitLoaderEntryPromise; } catch (_) {}
      submitLoaderEntryPromise = null;
    }

    await finishSubmitCircularArrow();

    if (submitLoaderElement && !submit.classList.contains('is-loading')) {
      cancelSubmitLoaderMotion();
      submitLoaderElement = null;
      submitLoaderGroup = null;
      submitLoaderShaft = null;
      submitLoaderHead = null;
      submit.classList.remove('is-returning');
      submit.textContent = '↑';
    }
  }

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
    setSubmitLoading(true);
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
    await setSubmitLoading(false);
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
    setSubmitLoading(false, true);
    page.classList.remove('chat-started');
    // The original handler clears the conversation and restores initial buttons.
  }, true);
})();