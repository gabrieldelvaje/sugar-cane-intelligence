/* One live composer for both states. Move it from the centered welcome
   slot to its existing fixed chat dock on first submission (FLIP animation).
   All question processing, locale, builder, and answer animations stay intact. */
(() => {
  'use strict';
  const body = document.body;
  const hero = document.querySelector('#home-hero');
  const slot = document.querySelector('#home-composer');
  const form = document.querySelector('#question-form');
  const suggestions = document.querySelector('#suggestions');
  const reset = document.querySelector('#new-chat');
  if (!hero || !slot || !form || !suggestions || !reset) return;

  let moveAnimation = null;
  // Keep the completion signal and expose a slightly earlier handoff.
  // Starting the user's bubble just before the composer finishes eliminates
  // the perceived pause, while both animations retain their own timing.
  let dockFinished = Promise.resolve();
  let bubbleHandoff = Promise.resolve();
  window.SCIComposerDock = {
    whenSettled: () => dockFinished,
    whenReadyForBubble: () => bubbleHandoff
  };

  function scheduleBubbleHandoff(animation, duration, leadMs = 145) {
    // In background/reduced-timer situations, completion wins the race.
    // Clear the timer afterward; a canceled animation also resolves promptly.
    const settled = animation.finished.catch(() => {});
    bubbleHandoff = new Promise(resolve => {
      const timer = window.setTimeout(resolve, Math.max(0, duration - leadMs));
      settled.then(() => { window.clearTimeout(timer); resolve(); });
    });
    dockFinished = settled;
  }
  const desktop = () => window.matchMedia('(min-width: 651px)').matches;
  // Chat animations already run on desktop independently of the OS setting.
  // Match that behavior here; keep the working mobile preference untouched.
  const motionAllowed = () =>
    desktop() || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clearMove() {
    moveAnimation?.cancel();
    moveAnimation = null;
    form.style.removeProperty('transform');
    form.style.removeProperty('transform-origin');
    form.style.removeProperty('will-change');
  }

  function dockComposer() {
    if (!body.classList.contains('sci-home')) return;
    clearMove();
    const first = form.getBoundingClientRect();
    // Reparent the SAME form; keep the handlers and builder intact.
    body.append(form);
    body.classList.remove('sci-home');
    const last = form.getBoundingClientRect();

    // Do not show the fallback/legacy welcome screen while the composer
    // descends. The same input is already safely reparented to <body>, so
    // hide the entire welcome hero now, before the first animation frame.
    // chat-ui-v5 waits for dockFinished before lifting the user bubble.
    hero.hidden = true;

    if (!motionAllowed() || !first.width || !last.width || !form.animate) return;

    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const sx = first.width / last.width;
    const sy = first.height / last.height;

    if (!desktop()) {
      // Preserve the existing, working mobile animation.
      moveAnimation = form.animate([
        { translate: `${dx}px ${dy}px`, scale: `${sx} ${sy}` },
        { translate: '0px 0px', scale: '1 1' }
      ], {
        duration: 620,
        easing: 'cubic-bezier(.22, 1, .36, 1)'
      });
      const animation = moveAnimation;
      scheduleBubbleHandoff(animation, 620, 135);
      animation.addEventListener('finish', () => {
        if (moveAnimation === animation) moveAnimation = null;
      }, { once: true });
      return;
    }

    // Desktop: animate the real CSS transform, not the independent
    // translate/scale properties. Applying the inverted transform inline
    // BEFORE the first paint prevents the docked form from flashing at
    // the bottom while Chromium is initializing the WAAPI animation.
    const endTransform = getComputedStyle(form).transform;
    const base = new DOMMatrixReadOnly(endTransform === 'none' ? undefined : endTransform);
    const startTransform = `matrix(${sx}, 0, 0, ${sy}, ${base.m41 + dx}, ${base.m42 + dy})`;
    const targetTransform = endTransform === 'none'
      ? 'matrix(1, 0, 0, 1, 0, 0)' : endTransform;

    form.style.transformOrigin = 'top left';
    form.style.willChange = 'transform';
    form.style.transform = startTransform;

    // Start the Web Animation synchronously in the submission event.
    // Waiting for requestAnimationFrame can expose the docked position for
    // one frame on desktop, especially with Windows animation reduction.
    // 'fill: both' holds the inverted starting geometry before the first paint.
    const animation = form.animate([
      { transform: startTransform },
      { transform: targetTransform }
    ], {
      duration: 680,
      easing: 'cubic-bezier(.22, 1, .36, 1)',
      fill: 'both'
    });
    moveAnimation = animation;
    scheduleBubbleHandoff(animation, 680, 155);
    form.style.transform = targetTransform;
    animation.addEventListener('finish', () => {
      if (moveAnimation !== animation) return;
      clearMove();
    }, { once: true });
  }

  // Registered before chat-ui-v5's capture handlers. Docking happens before
  // that controller hides the hero, so the composer never disappears mid-send.
  form.addEventListener('submit', () => {
    // Empty submit must leave the welcome screen intact.
    if (form.querySelector('#question')?.value.trim()) dockComposer();
  }, true);
  suggestions.addEventListener('click', event => {
    if (event.target.closest('button') && suggestions.contains(event.target.closest('button')))
      dockComposer();
  }, true);

  // Always restore the welcome layout on New chat, even when reset occurs
  // while a chat animation is running. Do not gate on hero.hidden: depending
  // on the order of reset listeners, the legacy code may unhide it afterward.
  reset.addEventListener('click', () => {
    clearMove();
    slot.append(form);
    body.classList.add('sci-home');
    hero.hidden = false;
  });
})();
