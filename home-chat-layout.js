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
  const motionAllowed = () =>
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function dockComposer() {
    if (!body.classList.contains('sci-home')) return;
    const first = form.getBoundingClientRect();
    moveAnimation?.cancel();
    // Place the exact same form back where the existing chat expects it.
    body.append(form);
    body.classList.remove('sci-home');
    const last = form.getBoundingClientRect();

    if (!motionAllowed() || !first.width || !last.width) return;
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const sx = first.width / last.width;
    const sy = first.height / last.height;
    moveAnimation = form.animate([
      { translate: `${dx}px ${dy}px`, scale: `${sx} ${sy}` },
      { translate: '0px 0px', scale: '1 1' }
    ], {
      duration: 620,
      easing: 'cubic-bezier(.22, 1, .36, 1)'
    });
    moveAnimation.addEventListener('finish', () => { moveAnimation = null; }, { once: true });
  }

  // Registered before chat-ui-v5's capture handlers. Docking happens before
  // that controller hides the hero, so the composer never disappears mid-send.
  form.addEventListener('submit', dockComposer, true);
  suggestions.addEventListener('click', event => {
    if (event.target.closest('button') && suggestions.contains(event.target.closest('button')))
      dockComposer();
  }, true);

  // Always restore the welcome layout on New chat, even when reset occurs
  // while a chat animation is running. Do not gate on hero.hidden: depending
  // on the order of reset listeners, the legacy code may unhide it afterward.
  reset.addEventListener('click', () => {
    moveAnimation?.cancel();
    moveAnimation = null;
    slot.append(form);
    body.classList.add('sci-home');
    hero.hidden = false;
  });
})();
