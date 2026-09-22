/* Match the original send arrow's symmetric tip while preserving the snake motion. */
(() => {
  'use strict';
  const form = document.querySelector('#question-form');
  if (!form) return;

  let currentShaft = null;
  let shaftObserver = null;

  function alignHead() {
    const shaft = currentShaft;
    const head = shaft?.parentElement?.querySelector('.submit-snake-head');
    if (!shaft?.isConnected || !head?.isConnected) return;

    // Use the tangent of the actual drawn path, not a separate point sampling:
    // the chevron and shaft must meet at precisely the same tip and angle.
    let total;
    try { total = shaft.getTotalLength(); } catch (_) { return; }
    if (total < 1) return;

    const tip = shaft.getPointAtLength(total);
    const behind = shaft.getPointAtLength(Math.max(0, total - .6));
    let dx = tip.x - behind.x;
    let dy = tip.y - behind.y;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude < .001) return;
    dx /= magnitude;
    dy /= magnitude;

    // Same balanced 45-degree V as the original upward send arrow.
    const back = 3.5;
    const wing = 3.5;
    const px = -dy;
    const py = dx;
    const leftX = tip.x - dx * back + px * wing;
    const leftY = tip.y - dy * back + py * wing;
    const rightX = tip.x - dx * back - px * wing;
    const rightY = tip.y - dy * back - py * wing;

    head.setAttribute('d',
      `M ${leftX.toFixed(2)} ${leftY.toFixed(2)} ` +
      `L ${tip.x.toFixed(2)} ${tip.y.toFixed(2)} ` +
      `L ${rightX.toFixed(2)} ${rightY.toFixed(2)}`
    );
  }

  function trackShaft() {
    const shaft = form.querySelector('.submit-snake-shaft');
    if (shaft === currentShaft) return;

    shaftObserver?.disconnect();
    shaftObserver = null;
    currentShaft = shaft;
    if (!shaft) return;

    shaftObserver = new MutationObserver(alignHead);
    shaftObserver.observe(shaft, { attributes: true, attributeFilter: ['d'] });
    alignHead();
  }

  new MutationObserver(trackShaft).observe(form, { childList: true, subtree: true });
  trackShaft();
})();
