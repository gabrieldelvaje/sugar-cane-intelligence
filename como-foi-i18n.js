/* Preserve the natural Portuguese "Como foi..." wording while translating it
   into the established "What was..." question pattern in English. */
(() => {
  'use strict';
  const base = window.SCIi18n;
  if (!base) return;
  const isComoFoi = value => /^\s*como foi a\b/i.test(String(value ?? ''));
  window.SCIi18n = Object.freeze({
    ...base,
    toEnglishQuestion: question => base.toEnglishQuestion(isComoFoi(question)
      ? String(question).replace(/^\s*como foi a\b/i, 'Qual foi a') : question),
    toPortugueseQuestion: question => isComoFoi(question)
      ? String(question) : base.toPortugueseQuestion(question)
  });
})();
