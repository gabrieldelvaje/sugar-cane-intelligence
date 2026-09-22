/* Horizontal bar chart for explicit ranking answers.
   Singular leader questions remain card-only. */
(() => {
  'use strict';
  if (typeof rank !== 'function' || typeof info === 'undefined') return;

  const originalRank = rank;

  function numericValue(text) {
    const cleaned = String(text ?? '')
      .replace(/\s+/g, ' ')
      .match(/-?[\d.]+(?:,\d+)?/)?.[0];
    if (!cleaned) return null;
    const value = Number(cleaned.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(value) ? value : null;
  }

  function rowsFromTable(fragment) {
    return [...fragment.querySelectorAll('.data-table tbody tr')]
      .map(row => {
        const cells = [...row.querySelectorAll('td')];
        if (cells.length < 4) return null;
        const valueLabel = cells[3].textContent.trim();
        const value = numericValue(valueLabel);
        if (!Number.isFinite(value)) return null;
        return {
          position: cells[0].textContent.trim(),
          municipality: cells[1].textContent.trim(),
          uf: cells[2].textContent.trim(),
          value,
          valueLabel
        };
      })
      .filter(Boolean);
  }

  function buildChart(rows, metricName) {
    if (rows.length < 2) return '';

    const maxValue = Math.max(...rows.map(row => row.value));
    if (!Number.isFinite(maxValue)) return '';

    const metricLabel = info[metricName]?.label || 'Indicador';

    return '<div class="chart ranking-bar-chart">' +
      '<div class="ranking-chart-heading">' +
        '<strong>' + esc(metricLabel) + '</strong>' +
        '<span>Ranking dos municípios</span>' +
      '</div>' +
      '<div class="ranking-bars">' +
        rows.map((row, index) => {
          const isLeader = index === 0;
          const percent = maxValue > 0 ? Math.max(1.5, (row.value / maxValue) * 100) : 1.5;
          const place = row.municipality + (row.uf ? ' (' + row.uf + ')' : '');
          return '<div class="ranking-bar-row' + (isLeader ? ' is-leader' : '') + '">' +
            '<div class="ranking-bar-meta">' +
              '<span class="ranking-bar-rank">#' + esc(row.position) + '</span>' +
              '<span class="ranking-bar-name">' + esc(place) + '</span>' +
              '<strong class="ranking-bar-value">' + esc(row.valueLabel) + '</strong>' +
            '</div>' +
            '<div class="ranking-bar-track" role="img" aria-label="' +
              esc(place + ': ' + row.valueLabel) + '">' +
              '<div class="ranking-bar-fill' + (isLeader ? ' is-leader' : '') +
                '" style="width:' + percent.toFixed(2) + '%"></div>' +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>' +
    '</div>';
  }

  rank = function rankWithHorizontalBars(question, metricName) {
    const html = originalRank(question, metricName);
    if (typeof html !== 'string' || /class="error"/.test(html)) return html;

    const fragment = document.createElement('div');
    fragment.innerHTML = html;
    const tableWrap = fragment.querySelector('.table-wrap');
    if (!tableWrap) return html;

    const rows = rowsFromTable(fragment);
    const chart = buildChart(rows, metricName);
    if (!chart) return html;

    tableWrap.insertAdjacentHTML('beforebegin', chart);
    tableWrap.remove();
    return fragment.innerHTML;
  };
})();
