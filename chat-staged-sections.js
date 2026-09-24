/* Reveal existing answer sections one by one after the word-by-word response.
   The chat controller still owns text streaming and question submission. */
(() => {
  'use strict';
  const conversation = document.querySelector('#conversation');
  if (!conversation) return;

  const sequences = new WeakMap();
  const EASE = 'cubic-bezier(.22, 1, .36, 1)';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function scrollToLatest() {
    window.scrollTo({
      top: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
      behavior: 'instant'
    });
  }

  function sequenceFor(response) {
    let sequence = sequences.get(response);
    if (sequence) return sequence;
    const content = response.querySelector('.message-content');
    if (!content) return null;
    // Each direct child is one meaningful section: the KPI group, table,
    // chart, error actions, or other answer content. Never split table rows.
    const sections = [...content.children].filter(child =>
      child.classList.contains('chat-deferred') &&
      !child.classList.contains('follow-up-suggestions')
    );
    if (!sections.length) return null;
    sequence = { response, sections, followup: null, started: false };
    sequences.set(response, sequence);
    return sequence;
  }

  async function reveal(node, response) {
    if (!response.isConnected || !node.isConnected) return;
    node.classList.remove('chat-deferred');
    if (node.classList.contains('follow-up-suggestions')) node.style.visibility = 'visible';
    scrollToLatest();
    if (reducedMotion.matches || document.hidden || !node.animate) return;
    const animation = node.animate([
      { opacity: 0, transform: 'translateY(9px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 380, easing: EASE, fill: 'both' });
    try { await animation.finished; } catch (_) { /* New chat can remove the node. */ }
    finally { animation.cancel(); }
    scrollToLatest();
  }

  async function revealSequence(sequence) {
    // Let the browser register the restored hidden state before the first
    // section enters; the text streaming has already finished at this point.
    await new Promise(resolve => requestAnimationFrame(resolve));
    for (const section of sequence.sections) {
      if (!sequence.response.isConnected) return;
      await reveal(section, sequence.response);
    }
    // The chat controller appends follow-ups immediately after streaming.
    // They must wait for all answer sections, never overlap the chart/table.
    if (sequence.followup?.isConnected && sequence.response.isConnected) {
      await reveal(sequence.followup, sequence.response);
    }
  }

  const observer = new MutationObserver(records => {
    const responses = new Set();
    for (const record of records) {
      const node = record.target;
      const response = node.nodeType === Node.ELEMENT_NODE
        ? node.closest('.chat-response') : null;
      if (response) responses.add(response);
      if (record.type !== 'childList') continue;
      for (const child of record.addedNodes) {
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        const parent = child.closest('.chat-response');
        if (parent) responses.add(parent);
        if (child.matches('.chat-response')) responses.add(child);
        if (child.matches('.follow-up-suggestions')) {
          const owner = child.closest('.chat-response');
          const sequence = owner && sequenceFor(owner);
          if (sequence && sequence.started) {
            sequence.followup = child;
            child.classList.add('chat-deferred');
            child.style.visibility = 'hidden';
            child.getAnimations().forEach(animation => animation.cancel());
          }
        }
      }
    }

    for (const response of responses) {
      const sequence = sequenceFor(response);
      if (!sequence || sequence.started) continue;
      // The existing word streamer clears all deferred classes at once.
      // Intercept that batch before paint, then restore a sequential reveal.
      if (!sequence.sections.every(section => !section.classList.contains('chat-deferred'))) continue;
      sequence.started = true;
      for (const section of sequence.sections) {
        section.classList.add('chat-deferred');
        section.getAnimations().forEach(animation => animation.cancel());
      }
      void revealSequence(sequence);
    }
  });
  observer.observe(conversation, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['class']
  });
})();
