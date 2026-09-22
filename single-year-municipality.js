/* A municipality question about one specific year is a point-in-time lookup,
   not a request to find the peak or the latest year in a historical series. */
(() => {
  'use strict';
  if (typeof city !== 'function' || typeof years !== 'function' ||
      typeof subset !== 'function' || typeof agg !== 'function' ||
      typeof info === 'undefined') return;

  const originalCity = city;

  city = function cityForRequestedYear(question, metricName, municipality) {
    const { f, t } = years(question);
    if (!Number.isInteger(f) || f !== t) {
      return originalCity(question, metricName, municipality);
    }

    // Honor the state abbreviation when the question specifies one, e.g. (PE).
    const requestedUF = String(question).match(/\(([A-Z]{2})\)/)?.[1];
    const rows = subset(question).filter(row =>
      row.municipality === municipality &&
      (!requestedUF || String(row.uf).toUpperCase() === requestedUF) &&
      Number.isFinite(row[metricName])
    );
    const placeLabel = municipality + (requestedUF ? ` (${requestedUF})` :
      rows[0]?.uf ? ` (${rows[0].uf})` : '');
    if (!rows.length) {
      return `<div class="error">Não encontrei dados de ${esc(info[metricName].label.toLowerCase())} para ${esc(placeLabel)} em ${f}.</div>`;
    }

    const value = agg(rows, metricName);
    const measure = fmetric(value, metricName);
    const label = info[metricName].label;
    return `<p class="answer">A <strong>${esc(label.toLowerCase())}</strong> em <strong>${esc(placeLabel)}</strong>, no ano de <strong>${f}</strong>, foi de <strong>${measure}</strong>.</p>` +
      `<div class="kpis"><div class="kpi"><span>${esc(label)} em ${f}</span><strong>${measure}</strong></div></div>`;
  };
})();
