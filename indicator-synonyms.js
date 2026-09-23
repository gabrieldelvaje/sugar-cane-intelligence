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
      // Rain/ch​uva and precipitation refer to the same rainfall dataset.
      .replace(/\b(?:chuva|chuvas|rain|rains|rainfall|precipitation)\b/giu, 'precipitação');
  }

  answer = function answerWithIndicatorSynonyms(question) {
    return previousAnswer(canonicalIndicator(question));
  };
})();
