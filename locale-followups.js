/* Follow-up suggestions are localized only after their generators and UF
   labeler have settled. Text changes are never observed here. */
(() => {
  'use strict';
  const i18n = window.SCIi18n;
  const conversation = document.querySelector('#conversation');
  const submit = document.querySelector('#question-form button[type="submit"]');
  if (!i18n || !conversation || !submit) return;

  function portugueseQuestion(button) {
    const shown = button.textContent.trim();
    const question = button.dataset.question;
    if (/^(?:Qual|Quais|Compare a)\b/i.test(shown)) return shown;
    if (question && /^(?:Qual|Quais|Compare a)\b/i.test(question)) {
      if (/\([A-Z]{2}\)/.test(shown) && !/\([A-Z]{2}\)/.test(question))
        return i18n.toPortugueseQuestion(shown);
      return question;
    }
    return i18n.toPortugueseQuestion(shown);
  }

  function translate(group, force = false) {
    if (!group.isConnected) return;
    const english = i18n.get() === 'en';
    const label = group.querySelector('.follow-up-label');
    if (label) {
      if (!label.dataset.sourcePt) {
        const shown = label.textContent.trim();
        label.dataset.sourcePt = shown === 'You can also ask' ? 'Você também pode perguntar'
          : shown.startsWith('Try a comparison')
            ? 'Experimente uma comparação com valores maiores que zero:' : shown;
      }
      const source = label.dataset.sourcePt;
      const desired = english ? (source.startsWith('Experimente ')
        ? 'Try a comparison with values greater than zero:'
        : source === 'Você também pode perguntar' ? 'You can also ask' : source) : source;
      if (label.textContent.trim() !== desired) label.textContent = desired;
    }
    for (const button of group.querySelectorAll('button')) {
      if (!button.dataset.sourcePt) button.dataset.sourcePt = portugueseQuestion(button);
      const desired = english ? i18n.toEnglishQuestion(button.dataset.sourcePt)
        : button.dataset.sourcePt;
      const shown = button.textContent.trim();
      // The UF labeler may add a state code after translation. Keep it;
      // restoring the older text here would create an endless rewrite loop.
      if (!force && english && shown !== desired && /\([A-Z]{2}\)/.test(shown)
          && !/\([A-Z]{2}\)/.test(desired)) {
        button.dataset.sourcePt = i18n.toPortugueseQuestion(shown);
        continue;
      }
      if (shown !== desired) button.textContent = desired;
    }
  }

  const pending = new Set();
  const nextFrame = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame : callback => setTimeout(callback, 0);
  function schedule(group) {
    if (!group || pending.has(group)) return;
    pending.add(group);
    nextFrame(() => {
      pending.delete(group);
      translate(group);
    });
  }

  new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches('.follow-up-suggestions')) schedule(node);
        else {
          const group = node.closest('.follow-up-suggestions');
          if (group) schedule(group);
          node.querySelectorAll('.follow-up-suggestions').forEach(schedule);
        }
      }
    }
  }).observe(conversation, { childList: true, subtree: true });

  function translateLoadingError() {
    if (i18n.get() !== 'en' || submit.disabled) return;
    conversation.querySelectorAll('.chat-response .error').forEach(error => {
      if (/^A base ainda está carregando\./.test(error.textContent.trim()))
        error.textContent = 'The dataset is still loading. Please try again in a few seconds.';
    });
  }
  new MutationObserver(translateLoadingError).observe(submit, {
    attributes: true, attributeFilter: ['disabled']
  });
  document.querySelectorAll('.sci-language-menu [data-language]').forEach(button => {
    button.addEventListener('click', () => {
      conversation.querySelectorAll('.follow-up-suggestions').forEach(group => translate(group, true));
      translateLoadingError();
    });
  });
  conversation.querySelectorAll('.follow-up-suggestions').forEach(schedule);
})();