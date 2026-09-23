/* Bilingual questions and data-aware answer rendering. The existing analysis,
   charts and animated response pipeline remain the single source of truth. */
(() => {
  'use strict';
  const storageKey = 'sci-language';
  let language = localStorage.getItem(storageKey) === 'en' ? 'en' : 'pt';
  const labels = {
    production: 'sugarcane production',
    area: 'harvested area',
    productivity: 'yield',
    precipitation: 'rainfall',
    temperature: 'average temperature'
  };
  const ptLabels = {
    production: 'produção', area: 'área colhida',
    productivity: 'produtividade', precipitation: 'precipitação',
    temperature: 'temperatura média'
  };
  const states = [
    'Mato Grosso do Sul', 'Rio Grande do Norte', 'Rio Grande do Sul',
    'Rio de Janeiro', 'Santa Catarina', 'Minas Gerais', 'Mato Grosso',
    'São Paulo', 'Maranhão', 'Pernambuco', 'Alagoas', 'Paraíba',
    'Paraná', 'Tocantins', 'Sergipe', 'Goiás', 'Bahia', 'Pará'
  ];
  const clean = text => String(text ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const htmlEscape = text => String(text ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
  const numberEn = (value, digits = 0) => new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits, maximumFractionDigits: digits
  }).format(value);
  const measureEn = (value, key) => numberEn(value,
    ['temperature', 'productivity'].includes(key) ? 2 : 0) + ' ' + info[key].unit;

  function numberTextEn(value) {
    // Convert only Brazilian-formatted measurements, not ungrouped year labels.
    return String(value ?? '').replace(/-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+,\d+/g, text => {
      const numeric = Number(text.replace(/\./g, '').replace(',', '.'));
      const fractional = text.includes(',') ? text.split(',')[1].length : 0;
      return Number.isFinite(numeric) ? numberEn(numeric, fractional) : text;
    });
  }

  function englishMetric(text) {
    return String(text)
      .replace(/produção de cana/gi, 'sugarcane production')
      .replace(/temperatura média/gi, 'average temperature')
      .replace(/área colhida/gi, 'harvested area')
      .replace(/produtividade/gi, 'yield')
      .replace(/precipitação/gi, 'rainfall')
      .replace(/produção/gi, 'sugarcane production');
  }

  function questionInEnglish(question) {
    const original = String(question ?? '').trim();
    if (!/^(?:qual|quais|compare a)\b/i.test(original)) return original;
    let result = englishMetric(original)
      .replace(/^Quais são os (\d+) municípios com maior /i,
        'Which $1 municipalities had the highest ')
      .replace(/^Qual município teve maior /i,
        'Which municipality had the highest ')
      .replace(/^Qual foi a /i, 'What was the ')
      .replace(/^Compare a /i, 'Compare ');
    if (/^Compare /i.test(result)) {
      result = result.replace(/\s+de\s+/i, ' in ')
        .replace(/\s+e\s+(?=[A-ZÀ-Ý])/u, ' and ');
    }
    return result.replace(/\s+entre\s+(\d{4})\s+e\s+(\d{4})/gi, ' from $1 to $2')
      .replace(/\s+em\s+/gi, ' in ');
  }

  function questionInPortuguese(question) {
    const raw = String(question ?? '').trim();
    if (/^(?:qual|quais|compare a|comparar a)\b/i.test(raw)) return raw;
    const normalized = clean(raw);
    let key = 'production';
    if (/temperature|temperatura|\bheat\b/.test(normalized)) key = 'temperature';
    else if (/rainfall|precipitation|rain|precipitacao|chuva/.test(normalized)) key = 'precipitation';
    else if (/harvested area|cultivated area|\barea\b|colhida/.test(normalized)) key = 'area';
    else if (/\byield\b|productivity|produtividade/.test(normalized)) key = 'productivity';
    const metricName = ptLabels[key];
    const dates = [...raw.matchAll(/\b(?:19\d{2}|20\d{2})\b/g)].map(match => +match[0]);
    const period = dates.length >= 2
      ? ` entre ${Math.min(...dates)} e ${Math.max(...dates)}`
      : dates.length ? ` em ${dates[0]}` : '';
    const names = typeof places === 'function' ? places(raw) : [];
    const compareRequested = /\b(?:compare|comparison|versus|\bvs\b|difference between)\b/i.test(raw);
    if (compareRequested && names.length === 2) {
      return `Compare a ${metricName} de ${names[0]} e ${names[1]}${period}.`;
    }
    const topMatch = normalized.match(/\btop\s*(\d{1,2})\b|\b(\d{1,2})\s+(?:municipalities|cities|producers|places)\b|\bwhich\s+(\d{1,2})\s+municipalities\b/);
    const amount = topMatch ? +(topMatch[1] || topMatch[2] || topMatch[3]) : 0;
    const listRequested = !!amount || /\b(?:ranking|ranked|rank|list|show the top|highest \d+)\b/.test(normalized);
    if (!listRequested && names.length === 1 &&
        !/\b(?:which municipality|which city|what municipality|what city|who leads|biggest producer|largest producer)\b/.test(normalized)) {
      const uf = raw.match(/\(([A-Z]{2})\)/)?.[1];
      const cityName = names[0] + (uf ? ` (${uf})` : '');
      return `Qual foi a ${metricName} em ${cityName}${period}?`;
    }
    const stateName = states.find(name => {
      const match = clean(raw).match(new RegExp(`(?:^|\\b)(?:in|of|em|no|na|de|do|da)\\s+(?:the\\s+state\\s+of\\s+)?${clean(name)}(?=\\s|[?.,!]|$)`));
      return !!match;
    });
    const where = stateName ? ` em ${stateName}` : '';
    return amount
      ? `Quais são os ${Math.min(amount, 20)} municípios com maior ${metricName}${where}${period}?`
      : `Qual município teve maior ${metricName}${where}${period}?`;
  }

  function errorEn(text) {
    const input = String(text ?? '').trim();
    if (/^Não encontrei dados de /i.test(input)) {
      return input.replace(/^Não encontrei dados de /i, 'No ')
        .replace(/ para /i, ' data was found for ')
        .replace(/ em (\d{4})\.$/i, ' in $1.');
    }
    if (/^Não encontrei dados para esse recorte/i.test(input)) return 'No data was found for these filters.';
    if (/^Não encontrei dados para /i.test(input))
      return input.replace(/^Não encontrei dados para /i, 'No data was found for ');
    if (/^Encontrei apenas um município/i.test(input))
      return 'Only one municipality was identified. Please enter both full municipality names to compare them.';
    if (/^O valor de /i.test(input))
      return input.replace(/^O valor de /i, 'The value for ')
        .replace(/ é zero nesse recorte\. Não é possível calcular uma variação percentual usando zero como referência\.$/i,
          ' is zero for these filters. A percentage change cannot be calculated using zero as the baseline.');
    if (/^Um dos municípios /i.test(input))
      return input.replace(/^Um dos municípios /i, 'One of the municipalities ')
        .replace(/ não tem valor positivo disponível nesse recorte\.$/i,
          ' has no positive value available for these filters.');
    if (/^Não encontrei dois municípios/i.test(input))
      return 'I could not find two municipalities with positive values for another comparison using these filters.';
    if (/^A base ainda está carregando/i.test(input))
      return 'The dataset is still loading. Please try again in a few seconds.';
    if (/^Não consegui analisar esta pergunta:/i.test(input))
      return 'I could not analyze this question: ' + input.replace(/^Não consegui analisar esta pergunta:\s*/i, '');
    return englishMetric(input);
  }

  function translateChartAndMetrics(root, key) {
    const old = info[key].label;
    const nice = labels[key];
    root.querySelectorAll('.kpi:not(.historical-trend-kpi) strong, .data-table td.number, .ranking-bar-value, .historical-point')
      .forEach(element => {
        if (element.matches('.historical-point')) {
          if (element.dataset.value) element.dataset.value = numberTextEn(element.dataset.value);
          if (element.hasAttribute('aria-label')) {
            element.setAttribute('aria-label', numberTextEn(element.getAttribute('aria-label')));
          }
        } else element.textContent = numberTextEn(element.textContent);
      });
    root.querySelectorAll('.data-table th').forEach(cell => {
      if (cell.textContent.trim() === 'Município') cell.textContent = 'Municipality';
      else if (cell.textContent.trim() === 'Tendência') cell.textContent = 'Trend';
      else if (cell.textContent.trim() === old) cell.textContent = nice[0].toUpperCase() + nice.slice(1);
    });
    root.querySelectorAll('.kpi span').forEach(span => {
      const text = span.textContent.trim();
      if (text === 'Média histórica') span.textContent = 'Historical average';
      else if (text === 'Maior valor') span.textContent = 'Highest value';
      else if (text === 'Último ano') span.textContent = 'Latest year';
      else if (text === 'Tendência') span.textContent = 'Trend';
      else if (text.startsWith(old + ' em ')) span.textContent = nice[0].toUpperCase() + nice.slice(1) + ' in ' + text.slice(old.length + 4);
    });
    root.querySelectorAll('.ranking-chart-heading').forEach(header => {
      const metric = header.querySelector('strong');
      const caption = header.querySelector('span');
      if (metric) metric.textContent = nice[0].toUpperCase() + nice.slice(1);
      if (caption) caption.textContent = 'Municipality ranking';
    });
    root.querySelectorAll('.ranking-bar-track').forEach(track => {
      if (track.hasAttribute('aria-label'))
        track.setAttribute('aria-label', numberTextEn(track.getAttribute('aria-label')));
    });
    root.querySelectorAll('.historical-line-chart').forEach(chart => {
      const legend = chart.querySelector('.legend strong');
      if (legend) legend.textContent = nice[0].toUpperCase() + nice.slice(1) + ' by year';
      const trendLabel = chart.querySelector('.historical-trend-label');
      if (trendLabel) trendLabel.textContent = 'Linear trend';
      const svg = chart.querySelector('svg');
      if (svg) svg.setAttribute('aria-label', 'Historical series of ' + nice);
      chart.querySelectorAll('svg text.axis[text-anchor="end"]').forEach(label => {
        label.textContent = numberTextEn(label.textContent);
      });
    });
    root.querySelectorAll('.historical-trend-value').forEach(value => {
      const direction = value.dataset.trend;
      value.textContent = direction === 'up' ? '↗ Rising'
        : direction === 'down' ? '↘ Declining' : '→ Stable';
    });
  }

  function responseInEnglish(html, questionPt) {
    if (typeof html !== 'string' || !state.ready) return html;
    const fragment = document.createElement('div');
    fragment.innerHTML = html;
    const key = metric(questionPt);
    const topic = labels[key];
    const date = years(questionPt);
    const rows = subset(questionPt);
    const cities = places(questionPt);
    const error = fragment.querySelector('.error');
    if (error) {
      error.textContent = errorEn(error.textContent);
      fragment.querySelectorAll('.answer').forEach(item => { item.textContent = errorEn(item.textContent); });
      fragment.querySelectorAll('.positive-comparison-retry .follow-up-label').forEach(item => {
        item.textContent = 'Try a comparison with values greater than zero:';
      });
      fragment.querySelectorAll('.positive-comparison-suggestion').forEach(button => {
        button.textContent = questionInEnglish(button.textContent);
      });
      return fragment.innerHTML;
    }

    const paragraph = fragment.querySelector('.answer');
    const periodText = date.f && date.t
      ? (date.f === date.t ? `in ${date.f}` : `from ${date.f} to ${date.t}`)
      : 'across the available historical series';
    const place = name => {
      const row = rows.find(item => item.municipality === name);
      return name + (row?.uf ? ` (${row.uf})` : '');
    };
    const bold = value => `<strong>${htmlEscape(value)}</strong>`;
    let sentence = '';
    const isComparison = /^Compare a\s/i.test(questionPt) && cities.length >= 2;
    const isCity = !isComparison && cities.length === 1 && /^Qual foi a\s/i.test(questionPt);

    if (isComparison) {
      const entries = cities.map(name => ({ name, value: agg(rows.filter(row => row.municipality === name), key) }))
        .filter(item => Number.isFinite(item.value)).sort((a, b) => b.value - a.value);
      if (entries.length === 2 && entries[1].value > 0) {
        const percent = (entries[0].value / entries[1].value - 1) * 100;
        sentence = `Comparing ${bold(topic)} ${periodText}, ${bold(place(entries[0].name))} ` +
          `recorded ${bold(measureEn(entries[0].value, key))}, ` +
          `${bold(numberEn(percent, 2) + '%')} higher than ${bold(place(entries[1].name))}.`;
      }
    } else if (isCity) {
      const values = rows.filter(row => row.municipality === cities[0] && Number.isFinite(row[key]))
        .sort((a, b) => a.year - b.year);
      if (values.length) {
        if (date.f && date.f === date.t) {
          const value = agg(values, key);
          sentence = `The ${bold(topic)} in ${bold(place(cities[0]))} in ${bold(date.f)} ` +
            `was ${bold(measureEn(value, key))}.`;
        } else {
          const peak = [...values].sort((a, b) => b[key] - a[key])[0];
          const latest = values[values.length - 1];
          sentence = `For ${bold(topic)} in ${bold(place(cities[0]))}, ` +
            `the highest recorded value was ${bold(measureEn(peak[key], key))} in ${bold(peak.year)}. ` +
            `The latest available year is ${bold(latest.year)}, at ${bold(measureEn(latest[key], key))}.`;
        }
      }
    } else {
      const first = grouped(rows, key)[0];
      const shown = fragment.querySelector('.ranking-bar-name, .data-table tbody td:nth-child(2), .kpis .kpi span');
      const isLeader = !fragment.querySelector('.ranking-bar-chart, .data-table') && !!fragment.querySelector('.kpis');
      const visibleName = shown?.textContent?.trim() || (first ? place(first.n) : '');
      const name = visibleName.replace(/\s*\([A-Z]{2}\)$/, '');
      const leading = grouped(rows, key).find(item => item.n === name) || first;
      if (leading) {
        const summary = date.f && date.f === date.t ? 'the observed value'
          : info[key].agg === 'sum' ? 'cumulative production'
          : info[key].agg === 'max' ? 'the highest observed value' : 'the historical average';
        sentence = isLeader
          ? `For ${bold(topic)} ${periodText}, the leading municipality is ` +
            `${bold(place(leading.n))}, at ${bold(measureEn(leading.v, key))}.`
          : `The leading municipality for ${bold(topic)} is ${bold(place(leading.n))}, ` +
            `at ${bold(measureEn(leading.v, key))}. This ranking uses ${bold(summary)} ${periodText}.`;
      }
    }
    if (paragraph && sentence) paragraph.innerHTML = sentence;
    translateChartAndMetrics(fragment, key);
    return fragment.innerHTML;
  }

  if (typeof answer === 'function') {
    const originalAnswer = answer;
    answer = function localizedAnswer(question) {
      if (language !== 'en') return originalAnswer(question);
      const questionPt = questionInPortuguese(question);
      return responseInEnglish(originalAnswer(questionPt), questionPt);
    };
  }

  window.SCIi18n = Object.freeze({
    get: () => language,
    set: next => {
      language = next === 'en' ? 'en' : 'pt';
      localStorage.setItem(storageKey, language);
      document.documentElement.lang = language === 'en' ? 'en' : 'pt-BR';
      document.documentElement.dataset.language = language;
    },
    toEnglishQuestion: questionInEnglish,
    toPortugueseQuestion: questionInPortuguese,
    englishResponse: responseInEnglish
  });
  document.documentElement.lang = language === 'en' ? 'en' : 'pt-BR';
  document.documentElement.dataset.language = language;
})();