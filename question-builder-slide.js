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

    // Clip precisely above the fixed composer. The panel rests 8px above
    // this edge when open; when closed it is fully below the clipping edge.
    const viewportHeight = window.innerHeight;
    const bottom = Math.max(0, viewportHeight - rect.top);
    if (Math.abs(bottom - previousBottom) < .5) return;
    previousBottom = bottom;
    stage.style.setProperty('--qb-slide-dock-bottom', `${bottom.toFixed(2)}px`);
  }

  syncDock();
  // Capture before the existing builder click handler starts its animation.
  toggle.addEventListener('click', syncDock, true);
  window.addEventListener('resize', syncDock, { passive: true });
  window.addEventListener('orientationchange', syncDock, { passive: true });
  window.visualViewport?.addEventListener('resize', syncDock, { passive: true });
  window.visualViewport?.addEventListener('scroll', syncDock, { passive: true });
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(syncDock).observe(form);
  }
})();
