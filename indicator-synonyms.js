/* Normalize supported metric synonyms before scope checks, guided repairs and analysis.
   The farmer's original message remains unchanged in the conversation. */
(() => {
  'use strict';
  if (typeof answer !== 'function') return;
  const previousAnswer = answer;

  function canonicalIndicator(question) {
    return String(question ?? '')
      // In either interface language, climate is the available average-temperature
      // indicator; English "temperature" must not default to production in PT.
      .replace(/\b(?:clima|climate|temperature|temperatures)\b/giu, 'temperatura')
      // Rain/chuva and precipitation refer to the same rainfall dataset.
      .replace(/\b(?:chuva|chuvas|rain|rains|rainfall|precipitation)\b/giu, 'precipitação')
      // "Como foi a ...?" is another way to ask "Qual foi a ...?".
      // Do not normalize the displayed farmer message, only the analytical input.
      .replace(/^\s*como\s+foi\s+(?:a|o)\s+/iu, 'Qual foi a ');
  }

  answer = function answerWithIndicatorSynonyms(question) {
    return previousAnswer(canonicalIndicator(question));
  };
})();