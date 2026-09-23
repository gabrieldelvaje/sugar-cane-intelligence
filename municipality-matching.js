/* Prevent a municipality from matching inside another word (e.g. Vera in "tiveram").
   Keep the existing answer(), ranking, data and chat animation pipeline unchanged. */
(() => {
  'use strict';

  const words = value => norm(value).replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  let loadedRows = null;
  let names = [];

  places = function matchedMunicipalities(question) {
    if (state.rows !== loadedRows) {
      loadedRows = state.rows;
      names = [...new Set(state.rows.map(row => row.municipality))]
        .map(name => ({ name, text: words(name) }))
        .filter(entry => entry.text.length > 3);
    }

    const text = words(question);
    // Questions asking which municipalities lead a ranking are not about a
    // particular city, even if a city shares a name with the state mentioned.
    const isRanking = (/\b(?:qual|quais)\b.{0,60}\b(?:municipio|municipios|cidade|cidades)\b/
      .test(text) || /\b(?:ranking|top|maiores|menores)\b/.test(text));
    const isComparison = /\b(?:compare|comparar|comparacao|versus|vs)\b/.test(text);
    if (isRanking && !isComparison) return [];

    const padded = ` ${text} `;
    const matches = names.filter(entry => padded.includes(` ${entry.text} `));

    // In a two-city comparison, "Ribeirão e Piracicaba" is a common short
    // form of Ribeirão Preto. Only expand a standalone "Ribeirão" before a
    // separator, never another complete municipality such as Ribeirão Grande.
    if (isComparison && /\bribeirao(?=\s+(?:e|com|and|vs|versus)\b|\s*[,?]|$)/.test(text)) {
      const ribeiraoPreto = names.find(entry => entry.text === 'ribeirao preto');
      if (ribeiraoPreto && !matches.some(entry => entry.text === ribeiraoPreto.text))
        matches.push(ribeiraoPreto);
    }

    matches.sort((a, b) => b.text.length - a.text.length);
    return matches.filter((entry, index) => !matches.slice(0, index).some(
      longer => ` ${longer.text} `.includes(` ${entry.text} `)
    )).slice(0, 2).map(entry => entry.name);
  };
})();
