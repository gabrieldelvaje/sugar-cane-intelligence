/* Preserve "Como foi..." as a Portuguese opening while translating it through
   the existing "Qual foi..." / "What was..." localization pattern. */
(() => {
  'use strict';
  const base = window.SCIi18n;
  if (!base) return;
  const isComoFoi = value => /^\s*como foi a\b/i.test(String(value ?? ''));
  function english(question) {
    if (!isComoFoi(question)) return base.toEnglishQuestion(question);
    const canonical = String(question)
      .replace(/^\s*como foi a\b/i, 'Qual foi a')
      .replace(/\btemperatura\b(?!\s+média)/i, 'temperatura média')
      .replace(/\bchuva\b/i, 'precipitação');
    return base.toEnglishQuestion(canonical);
  }
  window.SCIi18n = Object.freeze({
    ...base,
    toEnglishQuestion: english,
    toPortugueseQuestion: question => isComoFoi(question)
      ? String(question) : base.toPortugueseQuestion(question)
  });
})();
