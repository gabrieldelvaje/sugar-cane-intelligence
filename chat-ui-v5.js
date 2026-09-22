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
  let submitLoaderDistance = 0;
  let submitLoaderLastFrame = 0;

  const SUBMIT_TAU = Math.PI * 2;
  const SUBMIT_RADIUS = 7;
  const SUBMIT_ARROW_LENGTH = SUBMIT_RADIUS * 2;
  const SUBMIT_CIRCUMFERENCE = SUBMIT_TAU * SUBMIT_RADIUS;
  const SUBMIT_SAMPLES = 32;

  const submitClamp = value => Math.max(0, Math.min(1, value));
  const submitEase = value => {
    const t = submitClamp(value);
    return t * t * (3 - 2 * t);
  };
  const submitEaseOut = value => {
    const t = submitClamp(value);
    return 1 - Math.pow(1 - t, 3);
  };

  // Rounded joins between the Y axis and the circular orbit.
  // The tip keeps its original top/bottom points, but leaves/enters them
  // through a cubic fillet instead of a hard 90-degree corner.
  const SUBMIT_EXIT_JOIN_LENGTH = 5.2;
  const SUBMIT_EXIT_JOIN_HANDLE = 2.8;
  const SUBMIT_RETURN_JOIN_LENGTH = 3.2;
  const SUBMIT_RETURN_JOIN_HANDLE = 1.6;

  function submitCubicPoint(p0, p1, p2, p3, t) {
    const u = 1 - t;
    const uu = u * u;
    const tt = t * t;
    return [
      uu * u * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + tt * t * p3[0],
      uu * u * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + tt * t * p3[1]
    ];
  }

  function cancelSubmitLoaderMotion() {
    cancelAnimationFrame(submitLoaderRaf);
    submitLoaderRaf = 0;
  }

  function submitOrbitPoint(distance) {
    if (distance <= SUBMIT_ARROW_LENGTH) {
      return [0, SUBMIT_RADIUS - distance];
    }

    const arc = distance - SUBMIT_ARROW_LENGTH;

    // Leave y = +1 continuously: keep the exact top point, continue upward
    // for a moment, then bend into the circle with matching circle tangent.
    if (arc < SUBMIT_EXIT_JOIN_LENGTH) {
      const t = submitClamp(arc / SUBMIT_EXIT_JOIN_LENGTH);
      const endAngle = -Math.PI / 2 + SUBMIT_EXIT_JOIN_LENGTH / SUBMIT_RADIUS;
      const p0 = [0, -SUBMIT_RADIUS];
      const p3 = [
        Math.cos(endAngle) * SUBMIT_RADIUS,
        Math.sin(endAngle) * SUBMIT_RADIUS
      ];
      const tangent = [-Math.sin(endAngle), Math.cos(endAngle)];
      const p1 = [0, -SUBMIT_RADIUS - SUBMIT_EXIT_JOIN_HANDLE];
      const p2 = [
        p3[0] - tangent[0] * SUBMIT_EXIT_JOIN_HANDLE,
        p3[1] - tangent[1] * SUBMIT_EXIT_JOIN_HANDLE
      ];
      return submitCubicPoint(p0, p1, p2, p3, t);
    }

    const angle = -Math.PI / 2 + arc / SUBMIT_RADIUS;
    return [
      Math.cos(angle) * SUBMIT_RADIUS,
      Math.sin(angle) * SUBMIT_RADIUS
    ];
  }

  function submitFinishPoint(distance) {
    if (distance <= 0) {
      const angle = Math.PI / 2 + distance / SUBMIT_RADIUS;
      return [
        Math.cos(angle) * SUBMIT_RADIUS,
        Math.sin(angle) * SUBMIT_RADIUS
      ];
    }

    // Return from y = -1 through the same kind of rounded fillet. The orbit
    // arrives horizontally and the curve turns it smoothly upward into Y.
    if (distance < SUBMIT_RETURN_JOIN_LENGTH) {
      const t = submitClamp(distance / SUBMIT_RETURN_JOIN_LENGTH);
      const p0 = [0, SUBMIT_RADIUS];
      const p1 = [-SUBMIT_RETURN_JOIN_HANDLE, SUBMIT_RADIUS];
      const p3 = [0, SUBMIT_RADIUS - SUBMIT_RETURN_JOIN_LENGTH];
      const p2 = [0, p3[1] + SUBMIT_RETURN_JOIN_HANDLE];
      return submitCubicPoint(p0, p1, p2, p3, t);
    }

    return [0, SUBMIT_RADIUS - Math.min(distance, SUBMIT_ARROW_LENGTH)];
  }

  function submitSmoothPath(points) {
    if (!points.length) return '';
    if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;

    let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;

      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;

      d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
    }

    return d;
  }

  function roundedSubmitTrianglePath(tip, left, right, radius = .95) {
    const points = [tip, left, right];

    const toward = (from, to, distance) => {
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const length = Math.hypot(dx, dy) || 1;
      const d = Math.min(distance, length * .42);
      return [
        from[0] + dx / length * d,
        from[1] + dy / length * d
      ];
    };

    const tipFromRight = toward(points[0], points[2], radius);
    const tipToLeft = toward(points[0], points[1], radius);
    const leftFromTip = toward(points[1], points[0], radius);
    const leftToRight = toward(points[1], points[2], radius);
    const rightFromLeft = toward(points[2], points[1], radius);
    const rightToTip = toward(points[2], points[0], radius);

    return [
      `M ${tipFromRight[0].toFixed(2)} ${tipFromRight[1].toFixed(2)}`,
      `Q ${tip[0].toFixed(2)} ${tip[1].toFixed(2)} ${tipToLeft[0].toFixed(2)} ${tipToLeft[1].toFixed(2)}`,
      `L ${leftFromTip[0].toFixed(2)} ${leftFromTip[1].toFixed(2)}`,
      `Q ${left[0].toFixed(2)} ${left[1].toFixed(2)} ${leftToRight[0].toFixed(2)} ${leftToRight[1].toFixed(2)}`,
      `L ${rightFromLeft[0].toFixed(2)} ${rightFromLeft[1].toFixed(2)}`,
      `Q ${right[0].toFixed(2)} ${right[1].toFixed(2)} ${rightToTip[0].toFixed(2)} ${rightToTip[1].toFixed(2)}`,
      'Z'
    ].join(' ');
  }

  function renderSubmitSnake(pointAt, headDistance, scale = 1) {
    if (!submitLoaderShaft || !submitLoaderHead) return;

    // Larger head, still joined cleanly to the rounded shaft.
    const headBack = 4;
    const headWing = 4;
    const tailDistance = headDistance - SUBMIT_ARROW_LENGTH;
    const bodyEndDistance = headDistance - headBack;
    const points = [];

    for (let i = 0; i < SUBMIT_SAMPLES; i++) {
      const t = i / (SUBMIT_SAMPLES - 1);
      const distance = tailDistance + (bodyEndDistance - tailDistance) * t;
      const [x, y] = pointAt(distance);
      points.push([12 + x, 12 + y]);
    }

    submitLoaderShaft.setAttribute('d', submitSmoothPath(points));

    const [tipX, tipY] = pointAt(headDistance);
    const [baseX, baseY] = pointAt(bodyEndDistance);

    let dx = tipX - baseX;
    let dy = tipY - baseY;
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;

    const px = -dy;
    const py = dx;

    const tip = [12 + tipX, 12 + tipY];
    const base = [12 + baseX, 12 + baseY];
    const left = [
      base[0] + px * headWing,
      base[1] + py * headWing
    ];
    const right = [
      base[0] - px * headWing,
      base[1] - py * headWing
    ];

    submitLoaderHead.setAttribute(
      'd',
      roundedSubmitTrianglePath(tip, left, right)
    );

    if (submitLoaderGroup) {
      submitLoaderGroup.setAttribute(
        'transform',
        `translate(12 12) scale(${scale.toFixed(3)}) translate(-12 -12)`
      );
    }
  }

  function currentSubmitAngle() {
    const arc = Math.max(0, submitLoaderDistance - SUBMIT_ARROW_LENGTH);
    return -Math.PI / 2 + arc / SUBMIT_RADIUS;
  }

  function startSubmitSnakeOrbit() {
    if (!submit.classList.contains('is-loading') || !submitLoaderElement) return;

    submitLoaderLastFrame = performance.now();
    const baseSpeed = SUBMIT_CIRCUMFERENCE / 1.55;

    const frame = now => {
      if (!submit.classList.contains('is-loading') || !submitLoaderElement) return;

      const delta = Math.min(.034, Math.max(0, (now - submitLoaderLastFrame) / 1000));
      submitLoaderLastFrame = now;

      const angle = currentSubmitAngle();
      const speedFactor = 1 + .14 * Math.sin(angle + .45);
      submitLoaderDistance += baseSpeed * speedFactor * delta;

      renderSubmitSnake(submitOrbitPoint, submitLoaderDistance, 1);
      submitLoaderRaf = requestAnimationFrame(frame);
    };

    submitLoaderRaf = requestAnimationFrame(frame);
  }

  async function finishSubmitSnake() {
    cancelSubmitLoaderMotion();
    if (!submitLoaderElement) return;

    const currentArc = Math.max(0, submitLoaderDistance - SUBMIT_ARROW_LENGTH);
    let targetArc = Math.PI * SUBMIT_RADIUS +
      Math.ceil((currentArc - Math.PI * SUBMIT_RADIUS) / SUBMIT_CIRCUMFERENCE) * SUBMIT_CIRCUMFERENCE;

    if (targetArc <= currentArc + .35) targetArc += SUBMIT_CIRCUMFERENCE;

    const startDistance = submitLoaderDistance;
    const targetDistance = SUBMIT_ARROW_LENGTH + targetArc;
    const travel = targetDistance - startDistance;
    const duration = Math.max(250, Math.min(470, 230 + travel * 9));

    await new Promise(resolve => {
      const started = performance.now();

      const frame = now => {
        if (!submitLoaderElement) {
          resolve();
          return;
        }

        const raw = submitClamp((now - started) / duration);
        const progress = raw < .72
          ? .82 * Math.pow(raw / .72, 1.55)
          : .82 + .18 * submitEaseOut((raw - .72) / .28);

        submitLoaderDistance = startDistance + travel * progress;
        const scale = 1 + .085 * Math.sin(Math.PI * raw);

        renderSubmitSnake(submitOrbitPoint, submitLoaderDistance, scale);

        if (raw < 1) submitLoaderRaf = requestAnimationFrame(frame);
        else resolve();
      };

      submitLoaderRaf = requestAnimationFrame(frame);
    });

    if (!submitLoaderElement) return;

    submitLoaderDistance = targetDistance;
    renderSubmitSnake(submitOrbitPoint, submitLoaderDistance, 1);

    // The head is now at y = -1 (the visual bottom). From this exact point it
    // climbs the Y axis while the curved body follows behind like a snake.
    await new Promise(resolve => {
      const started = performance.now();
      const duration = 390;

      const frame = now => {
        if (!submitLoaderElement) {
          resolve();
          return;
        }

        const raw = submitClamp((now - started) / duration);
        const progress = submitEase(raw) * SUBMIT_ARROW_LENGTH;

        renderSubmitSnake(submitFinishPoint, progress, 1);

        if (raw < 1) submitLoaderRaf = requestAnimationFrame(frame);
        else resolve();
      };

      submitLoaderRaf = requestAnimationFrame(frame);
    });

    if (!submitLoaderElement) return;

    renderSubmitSnake(submitFinishPoint, SUBMIT_ARROW_LENGTH, 1);
  }

  async function setSubmitLoading(loading, instant = false) {
    submit.setAttribute('aria-label', loading ? 'Gerando resposta' : 'Enviar pergunta');

    if (loading) {
      cancelSubmitLoaderMotion();
      submit.classList.remove('is-returning');
      submit.classList.add('is-loading');

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'submit-snake-loader');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');

      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('class', 'submit-snake-group');

      const shaft = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      shaft.setAttribute('class', 'submit-snake-shaft');

      const head = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      head.setAttribute('class', 'submit-snake-head');

      group.append(shaft, head);
      svg.append(group);
      submit.replaceChildren(svg);

      submitLoaderElement = svg;
      submitLoaderGroup = group;
      submitLoaderShaft = shaft;
      submitLoaderHead = head;
      submitLoaderDistance = SUBMIT_ARROW_LENGTH;

      // At distance = 2R the body occupies the complete Y-axis diameter:
      // exactly the original upward arrow. The next frame bends only the tip.
      renderSubmitSnake(submitOrbitPoint, submitLoaderDistance, 1);
      startSubmitSnakeOrbit();
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
      submit.classList.remove('is-returning');
      submit.textContent = '↑';
      return;
    }

    await finishSubmitSnake();

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