/* Translate follow-ups after their generator and UF-labeling routines settle.
   Observe structural insertions only: listening to every text change caused
   competing English translation observers to rewrite the same node forever. */
(() => {
  'use strict';
  const i18n = window.SCIi18n;
  const conversation = document.querySelector('#conversation');
  const submit = document.querySelector('#question-form button[type="submit"]');
  if (!i18n || !conversation || !submit) return;

  function sourceQuestion(button) {
    const current = button.textContent.trim();
    const fromData = button.dataset.question;
    if (/^(?:Qual|Quais|Compare a)\b/i.test(current)) return current;
    if (fromData && /^(?:Qual|Quais|Compare a)\b/i.test(fromData)) {
      return /\([A-Z]{2}\)/.test(current) && !/\([A-Z]{2}\)/.test(fromData)
        ? i18n.toPortugueseQuestion(current) : fromData;
    }
    return i18n.toPortugueseQuestion(current);
  }

  function translateGroup(group, force = false) {
    if (!group.isConnected) return;
    const english = i18n.get() === 'en';
    const label = group.querySelector('.follow-up-label');
    if (label) {
      if (!label.dataset.sourcePt) {
        label.dataset.sourcePt = label.textContent.trim() === 'You can also ask'
          ? 'Você também pode perguntar'
          : label.textContent.trim().startsWith('Try a comparison')
            ? 'Experimente uma comparação com valores maiores que zero:'
            : label.textContent.trim();
      }
      const source = label.dataset.sourcePt;
      const target = english ? (source.startsWith('Experimente ')
        ? 'Try a comparison with values greater than zero:'
        : source === 'Você também pode perguntar' ? 'You can also ask' : source) : source;
      if (label.textContent.trim() !== target) label.textContent = target;
    }
    for (const button of group.querySelectorAll('button')) {
      if (!button.dataset.sourcePt) button.dataset.sourcePt = sourceQuestion(button);
      const source = button.dataset.sourcePt;
      const target = english ? i18n.toEnglishQuestion(source) : source;
      const current = button.textContent.trim();
      // Preserve a state abbreviation added by the other observer after
      // translation instead of repeatedly removing and reintroducing it.
      if (!force && english && current !== target && /\([A-Z]{2}\)/.test(current)
          && !/\([A-Z]{2}\)/.test(target)) {
        button.dataset.sourcePt = i18n.toPortugueseQuestion(current);
        continue;
      }
      if (current !== target) button.textContent = target;
    }
  }

  const pending = new Set();
  function schedule(group) {
    if (!group || pending.has(group)) return;
    pending.add(group);
    requestAnimationFrame(() => {
      pending.delete(group);
      translateGroup(group);
    });
  }

  new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches('.follow-up-suggestions')) schedule(node);
        else {
          const parent = node.closest('.follow-up-suggestions');
          if (parent) schedule(parent);
          node.querySelectorAll('.follow-up-suggestions').forEach(schedule);
        }
      }
    }
  }).observe(conversation, { childList: true, subtree: true });

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
      conversation.querySelectorAll('.follow-up-suggestions').forEach(group => translateGroup(group, true));
      translateLoadingError();
    });
  });
  conversation.querySelectorAll('.follow-up-suggestions').forEach(schedule);
})();