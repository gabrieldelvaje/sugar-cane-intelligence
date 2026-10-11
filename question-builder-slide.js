/* A clipped stage gives the question builder a physical place to slide out
   from behind the fixed composer, regardless of desktop/mobile viewport size.
   The existing builder continues to own all open/close state and focus logic. */
(() => {
  'use strict';
  const form = document.querySelector('#question-form');
  const panel = document.querySelector('#question-builder-panel');
  const toggle = document.querySelector('#question-builder-toggle');
  if (!form || !panel || !toggle) return;

  const stage = document.createElement('div');
  stage.className = 'qb-slide-viewport';
  stage.setAttribute('aria-hidden', 'false');
  document.body.append(stage);
  stage.append(panel);

  let previousBottom = -1;
  function syncDock() {
    const rect = form.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    // The clipping edge follows the real top of the composer on either device.
    const viewportHeight = window.innerHeight;
    const bottom = Math.max(0, viewportHeight - rect.top);
    if (Math.abs(bottom - previousBottom) < .5) return;
    previousBottom = bottom;
    stage.style.setProperty('--qb-slide-dock-bottom', `${bottom.toFixed(2)}px`);
  }

  syncDock();
  toggle.addEventListener('click', syncDock, true);
  window.addEventListener('resize', syncDock, { passive: true });
  window.addEventListener('orientationchange', syncDock, { passive: true });
  window.visualViewport?.addEventListener('resize', syncDock, { passive: true });
  window.visualViewport?.addEventListener('scroll', syncDock, { passive: true });
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(syncDock).observe(form);
  }

  // The welcome builder is a centered dialog; after a question it resumes
  // the established slide-up-from-composer animation unchanged.
  let desktopAnimation = null;
  let desktopAnimationToken = 0;
  const isDesktop = () => window.matchMedia('(min-width: 651px)').matches;

  function animatePanel(expanded) {
    const welcome = document.body.classList.contains('sci-home');
    if ((!welcome && !isDesktop()) || typeof panel.animate !== 'function') return;
    if (!welcome) syncDock();

    const token = ++desktopAnimationToken;
    const running = desktopAnimation && desktopAnimation.playState === 'running';
    const interruptedTransform = running ? getComputedStyle(panel).transform : null;
    const interruptedOpacity = running ? getComputedStyle(panel).opacity : null;
    if (desktopAnimation) desktopAnimation.cancel();

    const opened = welcome
      ? 'translate(-50%, -50%) scale(1)'
      : 'translate(-50%, 0)';
    // Use layout dimensions, unaffected by an interrupted transform, to map
    // the welcome dialog precisely to its trigger on any viewport size.
    let closed = 'translate(-50%, calc(100% + 16px))';
    if (welcome) {
      const trigger = toggle.getBoundingClientRect();
      const viewport = stage.getBoundingClientRect();
      const dx = trigger.left + trigger.width / 2 - (viewport.left + viewport.width / 2);
      const dy = trigger.top + trigger.height / 2 - (viewport.top + viewport.height / 2);
      const sx = trigger.width / Math.max(1, panel.offsetWidth);
      const sy = trigger.height / Math.max(1, panel.offsetHeight);
      closed = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${sx}, ${sy})`;
    }
    const from = interruptedTransform || (expanded ? closed : opened);
    const to = expanded ? opened : closed;

    panel.style.visibility = 'visible';
    panel.style.pointerEvents = expanded ? 'auto' : 'none';

    const frames = welcome ? (expanded ? [
      { transform: from, opacity: interruptedOpacity ?? 1 },
      { transform: to, opacity: 1 }
    ] : [
      { transform: from, opacity: interruptedOpacity ?? 1, offset: 0 },
      // Fade out during the return, before the miniature meets the trigger.
      { opacity: 0, offset: .65 },
      { transform: to, opacity: 0, offset: 1 }
    ]) : [
      { transform: from },
      { transform: to }
    ];
    const animation = panel.animate(frames, {
      duration: !isDesktop() && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : (welcome ? (expanded ? 500 : 280) : (expanded ? 510 : 490)),
      easing: (welcome || expanded) ? 'cubic-bezier(.22, 1, .36, 1)' : 'cubic-bezier(.4, 0, .2, 1)',
      fill: 'both'
    });
    desktopAnimation = animation;
    animation.onfinish = () => {
      if (token !== desktopAnimationToken) return;
      animation.cancel();
      desktopAnimation = null;
      // The question-builder controller removes its open class after 540 ms.
      // Hide the closed welcome dialog until that cleanup to avoid a flash.
      if (welcome && !expanded) {
        panel.style.visibility = 'hidden';
        panel.style.pointerEvents = 'none';
      } else {
        panel.style.removeProperty('visibility');
        panel.style.removeProperty('pointer-events');
      }
    };
  }

  // aria-expanded reflects ALL close paths (toggle, X, backdrop, Escape,
  // submit and new chat), not only mouse clicks on the icon.
  new MutationObserver(records => {
    if (!records.some(record => record.attributeName === 'aria-expanded')) return;
    animatePanel(toggle.getAttribute('aria-expanded') === 'true');
  }).observe(toggle, { attributes: true, attributeFilter: ['aria-expanded'] });
})();