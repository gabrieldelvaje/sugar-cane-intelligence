/* Dynamic follow-ups can be appended directly to a message-content node, before
   the general interface observer sees a mutation inside the suggestion group. */
(() => {
  'use strict';
  const i18n = window.SCIi18n;
  const conversation = document.querySelector('#conversation');
  const form = document.querySelector('#question-form');
  const submit = form?.querySelector('button[type="submit"]');
  if (!i18n || !conversation || !submit) return;

  function translateFollowup(group) {
    if (!group.isConnected) return;
    const english = i18n.get() === 'en';
    const heading = group.querySelector('.follow-up-label');
    if (heading) {
      if (!heading.dataset.originalPt) {
        const current = heading.textContent.trim();
        heading.dataset.originalPt = current === 'You can also ask'
          ? 'Você também pode perguntar'
          : current === 'Try a comparison with values greater than zero:'
            ? 'Experimente uma comparação com valores maiores que zero:' : current;
      }
      const original = heading.dataset.originalPt;
      const translated = original.startsWith('Experimente ')
        ? 'Try a comparison with values greater than zero:'
        : original === 'Você também pode perguntar' ? 'You can also ask' : original;
      const expected = english ? translated : original;
      if (heading.textContent !== expected) heading.textContent = expected;
    }
    for (const button of group.querySelectorAll('button')) {
      if (!button.dataset.originalPt) {
        const original = button.dataset.question &&
          /^(?:Qual|Quais|Compare a)\b/i.test(button.dataset.question)
          ? button.dataset.question : button.textContent.trim();
        // Another observer may have already translated the button. Recover a
        // Portuguese question for switching back without changing the data.
        button.dataset.originalPt = /^(?:Qual|Quais|Compare a)\b/i.test(original)
          ? original : i18n.toPortugueseQuestion(original);
      }
      const original = button.dataset.originalPt;
      const expected = english ? i18n.toEnglishQuestion(original) : original;
      if (button.textContent.trim() !== expected) button.textContent = expected;
    }
  }

  function syncFollowups() {
    conversation.querySelectorAll('.follow-up-suggestions').forEach(translateFollowup);
  }

  const observer = new MutationObserver(records => {
    if (!records.some(record => {
      const root = record.target.nodeType === Node.ELEMENT_NODE
        ? record.target : record.target.parentElement;
      if (root?.closest('.follow-up-suggestions')) return true;
      return [...record.addedNodes].some(node => node.nodeType === Node.ELEMENT_NODE &&
        (node.matches('.follow-up-suggestions') || node.querySelector('.follow-up-suggestions')));
    })) return;
    syncFollowups();
  });
  observer.observe(conversation, { childList: true, subtree: true, characterData: true });

  // In the uncommon case of submitting before the dataset is ready, the chat
  // controller creates a built-in Portuguese error without calling answer().
  // Wait until its typing animation has completed before translating it.
  function translateLoadingError() {
    if (i18n.get() !== 'en' || submit.disabled) return;
    conversation.querySelectorAll('.chat-response .error').forEach(error => {
      if (/^A base ainda está carregando\./.test(error.textContent.trim())) {
        error.textContent = 'The dataset is still loading. Please try again in a few seconds.';
      }
    });
  }
  new MutationObserver(translateLoadingError).observe(submit, {
    attributes: true, attributeFilter: ['disabled']
  });
  document.querySelectorAll('.sci-language-menu [data-language]').forEach(button => {
    button.addEventListener('click', () => {
      // The main language handler runs first, then restore/retranslate every
      // existing group, including those created while an answer was streaming.
      syncFollowups();
      translateLoadingError();
    });
  });
  syncFollowups();
})();