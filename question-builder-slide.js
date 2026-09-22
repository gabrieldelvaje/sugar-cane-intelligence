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

  // On desktop, do not depend on a CSS animation or the OS motion preference:
  // question-builder.js skips its animation entirely under reduced motion.
  // Drive the full-size panel with the same frame-based transform technique
  // used elsewhere in the chat, while the clipped stage hides the lower half.
  let desktopAnimation = null;
  let desktopAnimationToken = 0;
  const isDesktop = () => window.matchMedia('(min-width: 651px)').matches;

  function animateDesktop(expanded) {
    if (!isDesktop() || typeof panel.animate !== 'function') return;
    syncDock();

    const token = ++desktopAnimationToken;
    // Preserve the current transform if the user reverses the motion midway.
    const interruptedTransform = desktopAnimation && desktopAnimation.playState === 'running'
      ? getComputedStyle(panel).transform : null;
    if (desktopAnimation) desktopAnimation.cancel();

    const closed = 'translate(-50%, calc(100% + 16px))';
    const opened = 'translate(-50%, 0)';
    const from = interruptedTransform || (expanded ? closed : opened);
    const to = expanded ? opened : closed;

    // Keep the panel visible during the downward journey, even when the
    // builder controller immediately removes its open class on Windows.
    panel.style.visibility = 'visible';
    if (!expanded) panel.style.pointerEvents = 'none';

    const animation = panel.animate(
      [{ transform: from }, { transform: to }],
      { duration: expanded ? 510 : 490,
        easing: expanded ? 'cubic-bezier(.22, 1, .36, 1)' : 'cubic-bezier(.4, 0, .2, 1)',
        fill: 'both' }
    );
    desktopAnimation = animation;
    animation.onfinish = () => {
      if (token !== desktopAnimationToken) return;
      animation.cancel();
      desktopAnimation = null;
      panel.style.removeProperty('visibility');
      panel.style.removeProperty('pointer-events');
    };
  }

  // aria-expanded reflects ALL close paths (toggle, X, backdrop, Escape,
  // submit and new chat), not only mouse clicks on the icon.
  new MutationObserver(records => {
    if (!records.some(record => record.attributeName === 'aria-expanded')) return;
    animateDesktop(toggle.getAttribute('aria-expanded') === 'true');
  }).observe(toggle, { attributes: true, attributeFilter: ['aria-expanded'] });
})();