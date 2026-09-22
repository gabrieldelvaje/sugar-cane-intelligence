/* Keep the chevron identical to the original upward arrow throughout the snake animation. */
(() => {
  'use strict';
  const form = document.querySelector('#question-form');
  const submit = form?.querySelector('button[type="submit"]');
  if (!submit) return;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const BACK = 3.5;
  const WING = 3.5;
  let currentShaft = null;
  let shaftObserver = null;

  function makeIdleArrow() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'submit-snake-loader submit-idle-arrow');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');

    const shaft = document.createElementNS(SVG_NS, 'path');
    shaft.setAttribute('class', 'submit-snake-shaft');
    shaft.setAttribute('d', 'M12 19 L12 5');

    const head = document.createElementNS(SVG_NS, 'path');
    head.setAttribute('class', 'submit-snake-head');
    head.setAttribute('d', 'M8.5 8.5 L12 5 L15.5 8.5');
    svg.append(shaft, head);
    return svg;
  }

  function alignHead() {
    const shaft = currentShaft;
    const head = shaft?.parentElement?.querySelector('.submit-snake-head');
    if (!shaft?.isConnected || !head?.isConnected) return;

    let total;
    try { total = shaft.getTotalLength(); } catch (_) { return; }
    if (total < BACK) return;

    // Read a whole arrowhead-depth of the ACTUAL drawn shaft, not just the
    // last fraction of a pixel (which can point the V into the curve).
    const tip = shaft.getPointAtLength(total);
    const behind = shaft.getPointAtLength(Math.max(0, total - BACK));
    let dx = tip.x - behind.x;
    let dy = tip.y - behind.y;
    const size = Math.hypot(dx, dy);
    if (size < .001) return;
    dx /= size;
    dy /= size;

    const px = -dy;
    const py = dx;
    const leftX = tip.x - dx * BACK + px * WING;
    const leftY = tip.y - dy * BACK + py * WING;
    const rightX = tip.x - dx * BACK - px * WING;
    const rightY = tip.y - dy * BACK - py * WING;

    head.setAttribute('d',
      `M ${leftX.toFixed(3)} ${leftY.toFixed(3)} ` +
      `L ${tip.x.toFixed(3)} ${tip.y.toFixed(3)} ` +
      `L ${rightX.toFixed(3)} ${rightY.toFixed(3)}`
    );
  }

  function trackShaft() {
    const shaft = submit.querySelector('.submit-snake-group .submit-snake-shaft');
    if (shaft === currentShaft) return;

    shaftObserver?.disconnect();
    shaftObserver = null;
    currentShaft = shaft;
    if (!shaft) return;

    shaftObserver = new MutationObserver(alignHead);
    shaftObserver.observe(shaft, { attributes: true, attributeFilter: ['d'] });
    alignHead();
  }

  function syncIdleArrow() {
    if (submit.classList.contains('is-loading') || submit.classList.contains('is-returning')) return;
    if (submit.querySelector('.submit-snake-loader')) return;
    submit.replaceChildren(makeIdleArrow());
  }

  // The controller restores a text glyph after the animation. Replace it
  // before the next paint with the same SVG used at the start of the motion.
  new MutationObserver(() => {
    trackShaft();
    syncIdleArrow();
  }).observe(submit, { childList: true, subtree: false });

  trackShaft();
  syncIdleArrow();
})();
