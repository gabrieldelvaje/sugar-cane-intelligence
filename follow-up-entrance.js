/* Reveal follow-up questions only after the new layout is in view. */
(() => {
  'use strict';
  const conversation = document.querySelector('#conversation');
  if (!conversation) return;

  function prepareSuggestions(group) {
    // Answer sections have their own sequential reveal: in those responses,
    // the follow-ups wait until cards, tables and charts have appeared.
    if (group.classList.contains('chat-deferred')) return;
    if (group.dataset.entrancePrepared) return;
    group.dataset.entrancePrepared = 'true';

    // The mutation callback runs before the newly appended group is painted.
    // Keep it hidden while the answer/suggestions layout settles and scrolls.
    group.style.visibility = 'hidden';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    requestAnimationFrame(() => {
      if (!group.isConnected) return;

      const destination = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight
      );
      const started = performance.now();
      if (!reduceMotion) window.scrollTo({ top: destination, behavior: 'smooth' });
      else window.scrollTo({ top: destination, behavior: 'instant' });

      const revealWhenSettled = now => {
        if (!group.isConnected) return;
        const remaining = Math.abs(window.scrollY - destination);
        const elapsed = now - started;

        if (!reduceMotion && remaining > 2 && elapsed < 520) {
          requestAnimationFrame(revealWhenSettled);
          return;
        }

        // The send handler's original 320 ms animation may still be running.
        // Reveal once it is nearly finished, then fade in at the final position.
        if (!reduceMotion && elapsed < 330) {
          requestAnimationFrame(revealWhenSettled);
          return;
        }

        if (!reduceMotion && group.animate) {
          group.animate(
            [{ opacity: 0, transform: 'translateY(5px)' },
             { opacity: 1, transform: 'translateY(0)' }],
            { duration: 320, easing: 'cubic-bezier(.22,1,.36,1)' }
          );
        }
        group.style.visibility = 'visible';
      };

      requestAnimationFrame(revealWhenSettled);
    });
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches('.follow-up-suggestions')) prepareSuggestions(node);
        node.querySelectorAll('.follow-up-suggestions').forEach(prepareSuggestions);
      }
    }
  });
  observer.observe(conversation, { childList: true, subtree: true });
})();
