/* Line charts for historical municipality series.
   Point-in-time queries keep the single-year response without a chart. */
(() => {
  'use strict';
  if (typeof city !== 'function' || typeof compare !== 'function' ||
      typeof subset !== 'function' || typeof years !== 'function' ||
      typeof agg !== 'function' || typeof info === 'undefined' ||
      typeof esc !== 'function' || typeof fmt !== 'function') return;

  const originalCity = city;
  const originalCompare = compare;
  const normalize = text => String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  function wantsHistoricalChart(question) {
    const period = years(question);
    const exactYear = Number.isInteger(period.f) && period.f === period.t;
    if (exactYear) return false;

    const text = normalize(question);
    const explicitlyHistorical =
      /\b(?:serie historica|historico|historica|evolucao|ao longo do tempo|trajetoria|tendencia)\b/.test(text);
    const range = Number.isInteger(period.f) && Number.isInteger(period.t) && period.f !== period.t;
    const openRange = (Number.isInteger(period.f) && !Number.isInteger(period.t)) ||
      (!Number.isInteger(period.f) && Number.isInteger(period.t));
    const noYear = !Number.isInteger(period.f) && !Number.isInteger(period.t);

    return explicitlyHistorical || range || openRange || noYear;
  }

  function decimals(metricName) {
    return ['temperature', 'productivity'].includes(metricName) ? 2 : 0;
  }

  function yearlySeries(rows, metricName, municipality) {
    const matching = rows.filter(row =>
      row.municipality === municipality && Number.isFinite(row[metricName])
    );
    const groupedYears = new Map();

    matching.forEach(row => {
      if (!groupedYears.has(row.year)) groupedYears.set(row.year, []);
      groupedYears.get(row.year).push(row);
    });

    return {
      name: municipality,
      uf: matching[0]?.uf || '',
      points: [...groupedYears.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([year, yearRows]) => ({
          year: Number(year),
          value: agg(yearRows, metricName)
        }))
        .filter(point => Number.isFinite(point.value))
    };
  }

  function lineChart(series, metricName) {
    const available = series.filter(item => item.points.length >= 2);
    if (!available.length) return '';

    const width = 760;
    const height = 280;
    const pad = { top: 20, right: 24, bottom: 42, left: 62 };
    const allPoints = available.flatMap(item => item.points);
    const allYears = [...new Set(allPoints.map(point => point.year))].sort((a, b) => a - b);
    const allValues = allPoints.map(point => point.value);

    const minYear = Math.min(...allYears);
    const maxYear = Math.max(...allYears);
    if (!Number.isFinite(minYear) || !Number.isFinite(maxYear) || minYear === maxYear) return '';

    let minValue = Math.min(...allValues);
    let maxValue = Math.max(...allValues);
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return '';

    if (minValue === maxValue) {
      const margin = minValue === 0 ? 1 : Math.abs(minValue) * .08;
      minValue -= margin;
      maxValue += margin;
    } else {
      const margin = (maxValue - minValue) * .06;
      minValue -= margin;
      maxValue += margin;
    }

    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    const x = year => pad.left + ((year - minYear) / (maxYear - minYear)) * plotWidth;
    const y = value => pad.top + (1 - ((value - minValue) / (maxValue - minValue))) * plotHeight;
    const palette = ['var(--brand)', '#6574d9'];

    const yTicks = Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4;
      return {
        value: maxValue - (maxValue - minValue) * ratio,
        y: pad.top + plotHeight * ratio
      };
    });

    const xStep = allYears.length <= 7 ? 1 : Math.ceil(allYears.length / 7);
    const xTicks = allYears.filter((_, index) =>
      index % xStep === 0 || index === allYears.length - 1
    );

    const grid = yTicks.map(tick =>
      '<line class="grid" x1="' + pad.left + '" y1="' + tick.y.toFixed(2) +
      '" x2="' + (width - pad.right) + '" y2="' + tick.y.toFixed(2) + '"></line>'
    ).join('');

    const yLabels = yTicks.map(tick =>
      '<text class="axis" x="' + (pad.left - 10) + '" y="' + (tick.y + 4).toFixed(2) +
      '" text-anchor="end">' + esc(fmt(tick.value, decimals(metricName))) + '</text>'
    ).join('');

    const xLabels = xTicks.map(year =>
      '<text class="axis" x="' + x(year).toFixed(2) + '" y="' + (height - 12) +
      '" text-anchor="middle">' + year + '</text>'
    ).join('');

    const lines = available.map((item, index) => {
      const color = palette[index % palette.length];
      const path = item.points.map((point, pointIndex) =>
        (pointIndex ? 'L ' : 'M ') + x(point.year).toFixed(2) + ' ' + y(point.value).toFixed(2)
      ).join(' ');
      const seriesLabel = item.uf ? item.name + ' (' + item.uf + ')' : item.name;
      const dots = item.points.map(point =>
        '<circle class="historical-point" cx="' + x(point.year).toFixed(2) + '" cy="' +
        y(point.value).toFixed(2) + '" r="4.25" tabindex="0" role="button" ' +
        'aria-label="' + esc(seriesLabel + ', ' + point.year + ': ' +
        fmt(point.value, decimals(metricName)) + ' ' + info[metricName].unit) + '" ' +
        'data-series="' + esc(seriesLabel) + '" data-year="' + point.year +
        '" data-value="' + esc(fmt(point.value, decimals(metricName)) + ' ' +
        info[metricName].unit) + '" style="fill:' + color + '"></circle>'
      ).join('');
      return '<path d="' + path + '" fill="none" style="stroke:' + color +
        '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>' + dots;
    }).join('');

    const legend = available.map((item, index) => {
      const color = palette[index % palette.length];
      const label = item.uf ? item.name + ' (' + item.uf + ')' : item.name;
      return '<span style="margin-right:16px;white-space:nowrap"><i style="background:' +
        color + '"></i>' + esc(label) + '</span>';
    }).join('');

    const label = info[metricName]?.label || 'Indicador';
    return '<div class="chart historical-line-chart">' +
      '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Série histórica de ' +
      esc(label.toLowerCase()) + '">' + grid + lines + yLabels + xLabels + '</svg>' +
      '<div class="legend"><strong>' + esc(label) + ' por ano</strong> — ' + legend + '</div>' +
      '</div>';
  }


  function installTooltip() {
    if (document.querySelector('.historical-chart-tooltip')) return;
    const tooltip = document.createElement('div');
    tooltip.className = 'historical-chart-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    document.body.append(tooltip);

    let hideTimer;

    function fill(point) {
      tooltip.replaceChildren();
      const name = document.createElement('strong');
      name.textContent = point.dataset.series || '';
      const detail = document.createElement('span');
      detail.textContent = (point.dataset.year || '') + ' · ' + (point.dataset.value || '');
      tooltip.append(name, detail);
    }

    function place(clientX, clientY) {
      tooltip.hidden = false;
      const margin = 12;
      const box = tooltip.getBoundingClientRect();
      let left = clientX + 14;
      let top = clientY - box.height - 14;
      if (left + box.width > innerWidth - margin) left = clientX - box.width - 14;
      if (left < margin) left = margin;
      if (top < margin) top = clientY + 14;
      if (top + box.height > innerHeight - margin) top = innerHeight - box.height - margin;
      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
    }

    function show(point, clientX, clientY) {
      clearTimeout(hideTimer);
      fill(point);
      place(clientX, clientY);
      point.classList.add('is-tooltip-active');
    }

    function hide(point) {
      point?.classList.remove('is-tooltip-active');
      tooltip.hidden = true;
    }

    document.addEventListener('pointerover', event => {
      const point = event.target.closest?.('.historical-point');
      if (!point) return;
      show(point, event.clientX, event.clientY);
    });

    document.addEventListener('pointermove', event => {
      const point = event.target.closest?.('.historical-point');
      if (!point || tooltip.hidden) return;
      place(event.clientX, event.clientY);
    });

    document.addEventListener('pointerout', event => {
      const point = event.target.closest?.('.historical-point');
      if (!point) return;
      hide(point);
    });

    document.addEventListener('focusin', event => {
      const point = event.target.closest?.('.historical-point');
      if (!point) return;
      const box = point.getBoundingClientRect();
      show(point, box.left + box.width / 2, box.top);
    });

    document.addEventListener('focusout', event => {
      const point = event.target.closest?.('.historical-point');
      if (point) hide(point);
    });

    document.addEventListener('pointerdown', event => {
      const point = event.target.closest?.('.historical-point');
      if (!point || event.pointerType === 'mouse') return;
      show(point, event.clientX, event.clientY);
      hideTimer = setTimeout(() => hide(point), 2200);
    });
  }

  city = function cityWithHistoricalChart(question, metricName, municipality) {
    const html = originalCity(question, metricName, municipality);
    if (!wantsHistoricalChart(question) || /class="error"/.test(html)) return html;

    const series = yearlySeries(subset(question), metricName, municipality);
    const chart = lineChart([series], metricName);
    return chart ? html + chart : html;
  };

  compare = function compareWithHistoricalChart(question, metricName, municipalities) {
    const html = originalCompare(question, metricName, municipalities);
    if (!wantsHistoricalChart(question) || /class="error"/.test(html) ||
        !Array.isArray(municipalities) || municipalities.length < 2) return html;

    const rows = subset(question);
    const series = municipalities.slice(0, 2).map(name =>
      yearlySeries(rows, metricName, name)
    );
    const chart = lineChart(series, metricName);
    return chart ? html + chart : html;
  };

  installTooltip();
})();
