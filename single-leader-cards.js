/* A singular 'which municipality leads?' question should show one main card,
   not a table of ten municipalities. Explicit top-N/ranking requests are unchanged. */
(() => {
  'use strict';
  if (typeof rank !== 'function' || typeof info === 'undefined') return;

  const originalRank = rank;
  const normalized = text => String(text ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function wantsOnlyLeader(question) {
    const text = normalized(question);
    const singular = /\b(?:qual|quem)\b/.test(text) &&
      /\b(?:maior|maiores|mais|lider|primeiro|primeira|menor|menores)\b/.test(text);
    const explicitlyRequestsList = /\b(?:quais|ranking|rankings|top|lista|liste|listar|listagem|relacao|tabela|primeiros|primeiras)\b/.test(text) ||
      /\b\d{1,2}\s+(?:maiores|menores|municipios|cidades|produtores|colocados)\b/.test(text) ||
      /\b(?:mostre|mostrar|exiba|exibir)\s+(?:os|as)\s+\d{1,2}\b/.test(text);
    return singular && !explicitlyRequestsList;
  }

  rank = function rankWithSingleLeader(question, metricName) {
    const html = originalRank(question, metricName);
    if (!wantsOnlyLeader(question)) return html;

    const fragment = document.createElement('div');
    fragment.innerHTML = html;
    const table = fragment.querySelector('.table-wrap');
    const mainCard = fragment.querySelector('.kpis');
    if (!table || !mainCard) return html; // Preserve errors and other responses.

    table.remove();
    fragment.querySelector('.answer')?.remove();
    const heading = fragment.querySelector('.result-title');
    if (heading && info[metricName]) {
      heading.textContent = 'Maior ' + info[metricName].label.toLowerCase();
    }
    return fragment.innerHTML;
  };
})();
