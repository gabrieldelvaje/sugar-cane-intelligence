/* Keep the idle/final send arrow visually identical to the animated SVG arrow. */
(() => {
  'use strict';
  const form = document.querySelector('#question-form');
  const submit = form?.querySelector('button[type="submit"]');
  if (!submit) return;

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function makeIdleArrow() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'submit-snake-loader submit-idle-arrow');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');

    const shaft = document.createElementNS(SVG_NS, 'path');
    shaft.setAttribute('class', 'submit-snake-shaft');
    shaft.setAttribute('d', 'M12 19 L12 9');

    const head = document.createElementNS(SVG_NS, 'path');
    head.setAttribute('class', 'submit-snake-head');
    head.setAttribute('d', 'M12.64 5.64 Q12 5 11.36 5.64 L8.64 8.36 Q8 9 8.95 9 L15.05 9 Q16 9 15.36 8.36 Z');

    svg.append(shaft, head);
    return svg;
  }

  function syncIdleArrow() {
    if (submit.classList.contains('is-loading') || submit.classList.contains('is-returning')) return;
    if (submit.querySelector('.submit-snake-loader')) return;
    submit.replaceChildren(makeIdleArrow());
  }

  // The loader controller owns the animated triangular head. This helper now only
  // restores the exact same SVG once loading is finished.
  new MutationObserver(syncIdleArrow).observe(submit, { childList: true });
  syncIdleArrow();
})();
