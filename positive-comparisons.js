/* Only compare positive, finite values. A zero reference must never produce Infinity%. */
(() => {
  'use strict';
  if (typeof compare !== 'function' || typeof subset !== 'function' || typeof agg !== 'function') return;

  const originalCompare = compare;
  compare = function comparePositiveValues(question, metricName, municipalities) {
    if (!Array.isArray(municipalities) || municipalities.length < 2) {
      return originalCompare(question, metricName, municipalities);
    }
    const rows = subset(question);
    const values = municipalities.slice(0, 2).map(name => {
      const matching = rows.filter(row => row.municipality === name);
      return { name, value: agg(matching, metricName) };
    });
    if (values.some(item => !Number.isFinite(item.value) || item.value <= 0)) {
      const invalid = values.filter(item => !Number.isFinite(item.value) || item.value <= 0);
      const names = invalid.map(item => esc(item.name)).join(' e ');
      return '<div class="error">Não é possível fazer uma comparação percentual com ' + names +
        ' nesse período: pelo menos um dos valores é zero ou não está disponível. ' +
        'Para comparar, escolha dois municípios com valores maiores que zero, ' +
        'ou altere o indicador ou o período.</div>';
    }
    return originalCompare(question, metricName, municipalities);
  };
})();
