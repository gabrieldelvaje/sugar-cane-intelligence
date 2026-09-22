/* Clear completed exit effects before the next wizard step is painted. */
(() => {
  'use strict';
  const view = document.querySelector('#question-builder-panel .qb-wizard-view');
  if (!view || !view.getAnimations) return;
  new MutationObserver(() => {
    for (const animation of view.getAnimations({ subtree: false })) {
      if (animation.playState === 'finished' && animation.effect?.getTiming().fill === 'forwards') {
        animation.cancel();
      }
    }
  }).observe(view, { childList: true });
})();
