/* Keep the original uploaded SVG asset as the menu icon and center the close mark. */
(() => {
  'use strict';
  const toggle = document.querySelector('#question-builder-toggle');
  const close = document.querySelector('#question-builder-panel .qb-close');
  if (toggle) {
    const icon = document.createElement('span');
    icon.className = 'qb-uploaded-pen-icon';
    icon.setAttribute('aria-hidden', 'true');
    toggle.replaceChildren(icon);
  }
  if (close) {
    const mark = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    mark.setAttribute('viewBox', '0 0 24 24');
    mark.setAttribute('width', '16');
    mark.setAttribute('height', '16');
    mark.setAttribute('fill', 'none');
    mark.setAttribute('stroke', 'currentColor');
    mark.setAttribute('stroke-width', '2');
    mark.setAttribute('stroke-linecap', 'round');
    mark.setAttribute('aria-hidden', 'true');
    for (const pathData of ['M6 6 18 18', 'M18 6 6 18']) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      mark.append(path);
    }
    close.replaceChildren(mark);
  }
})();
