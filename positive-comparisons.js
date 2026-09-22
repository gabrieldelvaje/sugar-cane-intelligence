/* Never report an infinite percentage. For zero-valued comparisons, offer a
   verified, clickable alternative with two positive values in the dataset. */
(() => {
  'use strict';
  if (typeof compare !== 'function' || typeof subset !== 'function' ||
      typeof agg !== 'function' || typeof grouped !== 'function' ||
      typeof places !== 'function' || typeof years !== 'function') return;

  const originalCompare = compare;
  const conversation = document.querySelector('#conversation');
  const form = document.querySelector('#question-form');
  const input = document.querySelector('#question');

  // The user's original choice takes priority: keep its metric, years and,
  // where possible, the municipality that has a positive observation.
  function validAlternative(question, metricName, names) {
    const recognized = places(question);
    if (recognized.length !== 2 || !names.every(name => recognized.includes(name))) return false;
    const selectedRows = subset(question);
    const values = names.map(name => agg(
      selectedRows.filter(row => row.municipality === name), metricName
    ));
    return values.every(value => Number.isFinite(value) && value > 0) &&
      Number.isFinite(Math.max(...values) / Math.min(...values));
  }

  function findAlternative(question, metricName, originalValues, selectedRows) {
    const { f, t } = years(question);
    const originalNames = new Set(originalValues.map(item => item.name));
    const preferred = originalValues.find(item => item.value > 0 && Number.isFinite(item.value));
    const label = info[metricName]?.label?.toLocaleLowerCase('pt-BR');
    if (!label) return null;

    const periods = [{ rows: selectedRows, suffix: f && t
      ? (f === t ? ` em ${f}` : ` entre ${f} e ${t}`) : '' }];
    // When that period has no second positive municipality, suggest another
    // period rather than presenting an unverified or zero-valued alternative.
    if (f || t) periods.push({
      rows: state.rows.filter(row => row.year >= 2010 && row.year <= 2024),
      suffix: ' entre 2010 e 2024'
    });

    for (const period of periods) {
      const candidates = grouped(period.rows, metricName)
        .filter(item => Number.isFinite(item.v) && item.v > 0 &&
          !originalNames.has(item.n) && item.n.trim().length > 3);
      if (!candidates.length) continue;
      // Prefer a municipality from the same state as the valid original.
      const ordered = candidates.sort((a, b) =>
        Number(b.u === preferred?.uf) - Number(a.u === preferred?.uf));
      const starters = preferred && period === periods[0]
        ? [preferred.name, ...ordered.map(item => item.n)]
        : ordered.map(item => item.n);
      for (const first of starters.slice(0, 30)) {
        for (const option of ordered.slice(0, 65)) {
          if (first === option.n || (originalNames.has(first) && originalNames.has(option.n))) continue;
          const suggestion = `Compare a ${label} de ${first} e ${option.n}${period.suffix}.`;
          if (validAlternative(suggestion, metricName, [first, option.n])) return suggestion;
        }
      }
    }
    return null;
  }

  compare = function comparePositiveValues(question, metricName, municipalities) {
    if (!Array.isArray(municipalities) || municipalities.length < 2) {
      return originalCompare(question, metricName, municipalities);
    }
    const rows = subset(question);
    const values = municipalities.slice(0, 2).map(name => {
      const matching = rows.filter(row => row.municipality === name);
      return { name, uf: matching[0]?.uf, value: agg(matching, metricName) };
    });
    if (values.every(item => Number.isFinite(item.value) && item.value > 0) &&
        Number.isFinite(Math.max(...values.map(item => item.value)) /
          Math.min(...values.map(item => item.value)))) {
      return originalCompare(question, metricName, municipalities);
    }

    const zeroNames = values.filter(item => item.value === 0).map(item => esc(item.name));
    const unavailable = values.filter(item => item.value === null ||
      !Number.isFinite(item.value) || item.value < 0).map(item => esc(item.name));
    const details = zeroNames.length
      ? `O valor de ${zeroNames.join(' e ')} é zero nesse recorte. Não é possível calcular uma variação percentual usando zero como referência.`
      : `Um dos municípios (${unavailable.join(' e ')}) não tem valor positivo disponível nesse recorte.`;
    const alternative = findAlternative(question, metricName, values, rows);
    const retry = alternative
      ? '<div class="follow-up-suggestions positive-comparison-retry" data-randomized="true" style="grid-template-columns:minmax(0,1fr)">' +
          '<p class="follow-up-label">Experimente uma comparação com valores maiores que zero:</p>' +
          '<button type="button" class="positive-comparison-suggestion" data-question="' + esc(alternative) + '">' +
          esc(alternative) + '</button></div>'
      : '<p class="answer">Não encontrei dois municípios com valores positivos para sugerir outra comparação nesse recorte.</p>';
    return '<div class="error">' + details + '</div>' + retry;
  };

  // Use the existing animated form submission, not the legacy instant-render ask().
  conversation?.addEventListener('click', event => {
    const button = event.target.closest('.positive-comparison-suggestion');
    if (!button || !conversation.contains(button) || !form || !input ||
        form.querySelector('button[type="submit"]')?.disabled) return;
    input.value = button.dataset.question;
    form.requestSubmit();
  });
})();
