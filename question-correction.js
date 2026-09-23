/* Guided repairs for supported questions. The dataset supplies municipality and year choices.
   Never silently reinterpret a typo as a production ranking or select a city for the user. */
(() => {
  'use strict';
  if (typeof answer !== 'function' || typeof state === 'undefined') return;
  const previousAnswer = answer;
  const norm = value => String(value ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const html = value => String(value ?? '').replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const en = () => window.SCIi18n?.get() === 'en';
  const metrics = [
    { id: 'production', pt: 'produção', en: 'production', terms: ['produção', 'producao', 'production', 'produziu', 'produced'] },
    { id: 'area', pt: 'área colhida', en: 'harvested area', terms: ['área colhida', 'area colhida', 'area cultivada', 'harvested area'] },
    { id: 'productivity', pt: 'produtividade', en: 'yield', terms: ['produtividade', 'rendimento', 'productivity', 'yield'] },
    { id: 'precipitation', pt: 'precipitação', en: 'rainfall', terms: ['precipitação', 'precipitacao', 'pluviosidade', 'chuva', 'rainfall', 'precipitation'] },
    { id: 'temperature', pt: 'temperatura média', en: 'average temperature', terms: ['temperatura', 'temperature', 'calor'] }
  ];
  const unsupported = /\b(?:futebol|jogos?|partida|placar|football|soccer|games?|matches?|scores?|populacao|population|habitantes|prefeito|mayor|eleicao|election|pib|gdp|renda|income|salario|salary|precos|prices|filme|movie|musica|music|crime|criminalidade|lottery|loteria|turismo|tourism|historia|history)\b/;
  const intent = /\b(?:qual|quais|quanto|quantos|compare|comparar|comparacao|ranking|rank|top|maior|maiores|menor|menores|what|which|how|comparison|highest|lowest|largest|average|show|list)\b/;
  const compareIntent = /\b(?:compare|comparar|comparacao|comparison)\b/;
  const rankIntent = /\b(?:ranking|rank|top|maiores|menores|municipios?|cidades?|municipalities|cities|highest|largest)\b/;
  const hasTerm = (text, term) => ` ${text.replace(/[^a-z0-9]+/g, ' ')} `.includes(` ${norm(term).replace(/[^a-z0-9]+/g, ' ')} `);
  const metricFor = question => {
    const text = norm(question);
    return metrics.find(metric => metric.terms.some(term => hasTerm(text, term)));
  };
  let cachedRows = null;
  let cities = [];
  let years = [];
  function index() {
    if (cachedRows === state.rows) return;
    cachedRows = state.rows;
    const unique = new Map();
    for (const row of state.rows || []) {
      const name = String(row.municipality || '').trim();
      if (name && !unique.has(norm(name))) unique.set(norm(name), name);
    }
    cities = [...unique].map(([key, name]) => ({ key, name }));
    years = [...new Set(state.rows.map(row => Number(row.year)))]
      .filter(year => Number.isInteger(year) && year >= 1974 && year <= 2024)
      .sort((a, b) => b - a);
  }
  function editDistance(a, b, limit = 5) {
    if (Math.abs(a.length - b.length) > limit) return limit + 1;
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const current = [i];
      let lowest = i;
      for (let j = 1; j <= b.length; j++) {
        current[j] = Math.min(current[j - 1] + 1, previous[j] + 1,
          previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        lowest = Math.min(lowest, current[j]);
      }
      if (lowest > limit) return limit + 1;
      previous = current;
    }
    return previous[b.length];
  }
  function closestCities(fragment) {
    const name = norm(fragment).replace(/\s*\([a-z]{2}\)$/, '');
    if (name.length < 4 || /\d/.test(name)) return [];
    const limit = Math.min(5, Math.max(2, Math.ceil(name.length * .43)));
    return cities.filter(city => Math.abs(city.key.length - name.length) <= limit && city.key[0] === name[0])
      .map(city => ({ ...city, distance: editDistance(name, city.key, limit) }))
      .filter(city => city.distance <= limit && city.distance / Math.max(name.length, city.key.length) <= .46)
      .sort((a, b) => a.distance - b.distance || a.key.length - b.key.length)
      .slice(0, 6).map(city => city.name);
  }
  function comparisonParts(question) {
    const match = question.match(/\b(?:compare|comparar|comparacao|comparison)\b\s+(.+?)\s+(?:com|e|and|vs|versus)\s+(.+?)(?=\s+(?:em|in|entre|between|from|de)\s+\d{3,4}\b|[?!.]|$)/iu);
    if (!match) return [];
    return [match[1].replace(/^.*\b(?:de|da|do|of)\s+/iu, '').trim(), match[2].trim()].filter(Boolean);
  }
  function singlePlace(question) {
    const prefix = question.replace(/\s+(?:em|in|entre|between|from)\s+\d{3,4}\b[\s\S]*$/iu, '')
      .replace(/[?!.]\s*$/, '').trim();
    const matches = [...prefix.matchAll(/\b(?:em|in|de|of|for|para)\s+/giu)];
    const last = matches.at(-1);
    if (!last) return '';
    const part = prefix.slice(last.index + last[0].length).trim();
    return /^(?:cana|sugarcane|producao|production|chuva|rainfall|area|year|ano)$/i.test(norm(part)) ? '' : part;
  }
  function incorrectYears(question) {
    const result = [];
    // Treat a normal four-digit year outside 1974–2024 as a coverage issue.
    // Short/long numeric forms are probable typing mistakes instead.
    for (const match of question.matchAll(/\b\d{2,5}\b/g)) {
      const before = norm(question.slice(0, match.index));
      if (!/\b(?:em|no|ano|de|entre|ate|a|in|year|from|between|to)\s*$/.test(before)) continue;
      if (/^\s*mil\b/i.test(question.slice(match.index + match[0].length))) continue;
      const original = match[0];
      const year = Number(original);
      if (original.length === 4 && year >= 1974 && year <= 2024) continue;

      const issue = original.length === 4 ? 'range' : 'typo';
      let suggested = year;

      if (issue === 'typo') {
        if (original.length === 3) suggested = Number(original + '0');
        else if (original.length === 5 && original.endsWith('0')) suggested = Number(original.slice(0, -1));
        else if (original.length === 2) suggested = Number(original + '00');
      }

      if (!years.includes(suggested)) suggested = years.reduce((best, candidate) =>
        Math.abs(candidate - suggested) < Math.abs(best - suggested) ? candidate : best, years[0]);

      result.push({
        kind: 'year',
        issue,
        original,
        values: [suggested, ...years.filter(value => value !== suggested)].map(String)
      });
    }

    // Also recognize natural-language "20 mil" as a malformed year when it
    // appears in a year position.
    for (const match of question.matchAll(/\b20\s+mil\b/giu)) {
      const before = norm(question.slice(0, match.index));
      if (!/\b(?:em|no|ano|de|entre|ate|a|in|year|from|between|to)\s*$/.test(before)) continue;
      if (result.some(item => item.original === match[0])) continue;
      const suggested = years.includes(2000) ? 2000 : years.reduce((best, candidate) =>
        Math.abs(candidate - 2000) < Math.abs(best - 2000) ? candidate : best, years[0]);
      result.push({
        kind: 'year',
        issue: 'typo',
        original: match[0],
        values: [suggested, ...years.filter(value => value !== suggested)].map(String)
      });
    }
    return result;
  }
  function metricTypo(question) {
    let closest = null;
    for (const word of question.matchAll(/[\p{L}]{6,}/gu)) {
      const input = norm(word[0]);
      for (const metric of metrics) for (const alias of metric.terms) {
        const target = norm(alias);
        if (target.includes(' ') || target[0] !== input[0]) continue;
        const d = editDistance(input, target, 2);
        if (d > 0 && d <= 2 && (!closest || d < closest.distance))
          closest = { kind: 'metric', original: word[0], values: metrics.map(m => m.id), preferred: metric.id, distance: d };
      }
    }
    return closest;
  }
  function detect(question) {
    if (!state.ready || !state.rows?.length || question.length > 450 || !years.length && !(index(), years.length)) return null;
    index();
    const text = norm(question);
    if (unsupported.test(text) || /\b(?:hoje|ontem|amanha|today|yesterday|tomorrow|now|agora|live)\b/.test(text)) return null;
    const comparing = compareIntent.test(text);
    const ranking = rankIntent.test(text);
    const matched = typeof places === 'function' ? places(question) : [];
    const metric = metricFor(question);
    const repairs = [];
    if ((!intent.test(text) && !/\brank\w*\b/.test(text)) ||
        !(metric || comparing || ranking || matched.length || /\brank\w*\b/.test(text))) return null;

    if (comparing && matched.length < 2) {
      const parts = comparisonParts(question);
      for (const [slot, part] of parts.entries()) {
        const key = norm(part).replace(/\s*\([a-z]{2}\)$/, '');
        if (cities.some(city => city.key === key) || (key === 'ribeirao' && matched.includes('Ribeirão Preto'))) continue;
        const options = closestCities(part);
        if (options.length) repairs.push({ kind: 'city', original: part, values: options, slot: slot + 1 });
      }
    } else if (!comparing && !ranking && !matched.length && metric) {
      const part = singlePlace(question);
      if (part) {
        const options = closestCities(part);
        if (options.length) repairs.push({ kind: 'city', original: part, values: options, slot: 1 });
      } else {
        repairs.push({ kind: 'location', original: '', values: [], slot: 1 });
        repairs.push({ kind: 'metricChoice', original: '', values: metrics.map(m => m.id), preferred: metric.id });
      }
    }

    if (!metric) {
      const typo = metricTypo(question);
      if (typo && (matched.length || repairs.some(r => r.kind === 'city'))) repairs.push(typo);
      else if (!comparing && !ranking && matched.length === 1) {
        // Only a bare city question qualifies. "What is the history of X?"
        // must retain the out-of-topic warning, not default to production.
        const remaining = norm(question).replace(norm(matched[0]), ' ')
          .replace(/\b(?:qual|quais|what|which|how|foi|e|a|o|the|was|is|em|in|de|of|for|ano|year)\b/g, ' ')
          .replace(/\b\d{3,4}\b/g, ' ').replace(/[^a-z]+/g, ' ').trim();
        if (!remaining) repairs.push({ kind: 'metricMissing', original: '', values: metrics.map(m => m.id), preferred: 'production' });
      } else if (!comparing && /\brank\w*\b/.test(text) && !ranking)
        repairs.push({ kind: 'ranking', original: '', values: metrics.map(m => m.id), preferred: 'production' });
    }
    repairs.push(...incorrectYears(question));
    // Do not display year-only repairs on an unrecognized, off-topic comparison.
    if (comparing && matched.length < 2 && !repairs.some(repair => repair.kind === 'city')) return null;
    return repairs.length ? { repairs, metric: metric?.id || 'production', matched } : null;
  }
  const copy = {
    pt: { title: 'Vamos corrigir sua pergunta', hint: 'Escolha as opções abaixo. Só farei a análise depois da sua confirmação.',
      metric: 'Indicador', city: 'Município', first: 'Primeiro município', second: 'Segundo município', year: 'Ano',
      choose: 'Selecione uma opção', search: 'Buscar outro município…', submit: 'Analisar pergunta corrigida',
      required: 'Selecione os campos indicados para continuar.', rank: 'Ranking dos municípios (sem cidade específica)',
      firstProblem: 'primeiro município', secondProblem: 'segundo município',
      cityTypo: 'Parece haver um erro de digitação.',
      bothCities: 'Não consegui identificar os dois municípios informados. Parece haver erros de digitação.',
      metricTypo: 'O indicador informado parece ter um erro de digitação.',
      yearProblem: 'O ano informado não corresponde a um ano válido da base.',
      yearRange: 'O ano informado está fora da cobertura da base. Os dados disponíveis compreendem o período de 1974 a 2024.',
      yearTypo: 'O valor informado parece ser um ano digitado incorretamente.',
      missingLocation: 'Falta informar qual município você quer analisar.',
      missingMetric: 'Não consegui identificar qual indicador você quer analisar.',
      confirmMetric: 'Confirme também o indicador antes de continuar.',
      fallbackProblem: 'Encontrei uma parte da pergunta que precisa ser corrigida.',
      yearHelp: 'Escolha um ano disponível no menu ou experimente uma destas opções:',
      yearExample1: 'Qual município teve maior produção de cana em 2024?',
      yearExample2: 'Qual foi a precipitação em Piracicaba em 2000?',
      builder: 'Montar minha pergunta' },
    en: { title: 'Let’s correct your question', hint: 'Choose the options below. I will only analyze the corrected question after you confirm.',
      metric: 'Indicator', city: 'Municipality', first: 'First municipality', second: 'Second municipality', year: 'Year',
      choose: 'Choose an option', search: 'Search another municipality…', submit: 'Analyze corrected question',
      required: 'Choose the required fields to continue.', rank: 'Municipality ranking (no specific city)',
      firstProblem: 'first municipality', secondProblem: 'second municipality',
      cityTypo: 'There may be a typo.',
      bothCities: 'I could not identify either municipality. There may be typos in both names.',
      metricTypo: 'The indicator appears to contain a typo.',
      yearProblem: 'The year does not match a valid year in the dataset.',
      yearRange: 'The year is outside the dataset coverage. Available data covers 1974 to 2024.',
      yearTypo: 'The value looks like a mistyped year.',
      missingLocation: 'The municipality to analyze is missing.',
      missingMetric: 'I could not identify which indicator you want to analyze.',
      confirmMetric: 'Please also confirm the indicator before continuing.',
      fallbackProblem: 'I found a part of the question that needs to be corrected.',
      yearHelp: 'Choose an available year from the menu or try one of these options:',
      yearExample1: 'Which municipality had the highest sugarcane production in 2024?',
      yearExample2: 'What was the rainfall in Piracicaba in 2000?',
      builder: 'Build my question' }
  };
  function diagnosis(detection, language) {
    const s = copy[language];
    const repairs = detection.repairs;
    const cityRepairs = repairs.filter(repair => repair.kind === 'city');
    const pieces = [];

    if (cityRepairs.length >= 2) pieces.push(s.bothCities);
    else if (cityRepairs.length === 1) {
      const repair = cityRepairs[0];
      const position = repair.slot === 2 ? s.secondProblem : s.firstProblem;
      const quoted = repair.original ? ` “${repair.original}”` : '';
      pieces.push(language === 'en'
        ? `I could not identify the ${position}${quoted}. ${s.cityTypo}`
        : `Não consegui identificar o ${position}${quoted}. ${s.cityTypo}`);
    }

    const metricRepair = repairs.find(repair => repair.kind === 'metric');
    if (metricRepair) {
      const quoted = metricRepair.original ? ` “${metricRepair.original}”` : '';
      pieces.push(language === 'en'
        ? `${s.metricTypo}${quoted ? ` Check${quoted}.` : ''}`
        : `${s.metricTypo}${quoted ? ` Revise${quoted}.` : ''}`);
    }

    const yearRepair = repairs.find(repair => repair.kind === 'year');
    if (yearRepair) {
      const quoted = yearRepair.original ? ` “${yearRepair.original}”` : '';
      if (yearRepair.issue === 'range') {
        pieces.push(language === 'en'
          ? `${s.yearRange}${quoted ? ` You entered${quoted}.` : ''}`
          : `${s.yearRange}${quoted ? ` Você informou${quoted}.` : ''}`);
      } else if (yearRepair.issue === 'typo') {
        pieces.push(language === 'en'
          ? `${s.yearTypo}${quoted ? ` I found${quoted}.` : ''}`
          : `${s.yearTypo}${quoted ? ` Encontrei${quoted}.` : ''}`);
      } else {
        pieces.push(language === 'en'
          ? `${s.yearProblem}${quoted ? ` I found${quoted}.` : ''}`
          : `${s.yearProblem}${quoted ? ` Encontrei${quoted}.` : ''}`);
      }
    }

    if (repairs.some(repair => repair.kind === 'location')) pieces.push(s.missingLocation);
    if (repairs.some(repair => ['metricMissing', 'ranking'].includes(repair.kind))) pieces.push(s.missingMetric);
    if (repairs.some(repair => repair.kind === 'metricChoice') &&
        !repairs.some(repair => ['metric', 'metricMissing', 'ranking'].includes(repair.kind))) {
      pieces.push(s.confirmMetric);
    }

    return pieces.join(' ') || s.fallbackProblem;
  }

  function field(repair, index, language) {
    const s = copy[language];
    const city = ['city', 'location'].includes(repair.kind);
    const label = repair.kind === 'year' ? s.year : city
      ? repair.slot === 2 ? s.second : repair.kind === 'city' ? s.first : s.city : s.metric;
    const options = repair.values.map(value => {
      const found = metrics.find(metric => metric.id === value);
      return `<option value="${html(value)}"${value === repair.preferred ? ' selected' : ''}>${html(found ? found[language] : value)}</option>`;
    }).join('');
    return `<label class="sci-repair-field"><span>${html(label)}</span>` +
      `<select class="sci-repair-select" data-repair-index="${index}" data-repair-kind="${repair.kind}" aria-label="${html(label)}">` +
      `<option value="">${html(s.choose)}</option>${options}` +
      (repair.kind === 'location' ? `<option value="__rank__">${html(s.rank)}</option>` : '') + '</select>' +
      (city ? `<input type="search" class="sci-repair-city-search" data-repair-index="${index}" autocomplete="off" placeholder="${html(s.search)}" aria-label="${html(s.search)}">` : '') + '</label>';
  }
  function guidance(detection) {
    const language = en() ? 'en' : 'pt';
    const s = copy[language];
    // An exact class="error" allows the existing streaming controller to
    // suppress unrelated follow-up suggestions without changing that controller.
    const problem = diagnosis(detection, language);
    const hasYearRange = detection.repairs.some(repair => repair.kind === 'year' && repair.issue === 'range');
    const yearHelp = hasYearRange
      ? `<div class="sci-year-range-help"><p>${html(s.yearHelp)}</p>` +
        `<button type="button" class="sci-scope-example" data-sci-scope-example="${html(s.yearExample1)}">${html(s.yearExample1)}</button>` +
        `<button type="button" class="sci-scope-example" data-sci-scope-example="${html(s.yearExample2)}">${html(s.yearExample2)}</button>` +
        `<button type="button" class="sci-scope-builder">${html(s.builder)}</button></div>`
      : '';
    return `<div class="error"><div class="sci-repair-intro"><strong>${html(s.title)}</strong><br><span class="sci-repair-diagnosis">${html(problem)}</span><br>${html(s.hint)}</div></div>` +
      `<div class="sci-scope-actions sci-repair-actions">` +
      detection.repairs.map((repair, index) => field(repair, index, language)).join('') +
      '<p class="sci-repair-feedback" role="status" hidden></p>' +
      `<button type="button" class="sci-repair-apply">${html(s.submit)}</button>${yearHelp}</div>`;
  }
  answer = function correctedAnswer(question) {
    const candidate = detect(String(question ?? ''));
    return candidate ? guidance(candidate) : previousAnswer(question);
  };
  const conversation = document.querySelector('#conversation');
  conversation?.addEventListener('input', event => {
    const search = event.target.closest('.sci-repair-city-search');
    if (!search || !conversation.contains(search)) return;
    const group = search.closest('.sci-repair-actions');
    const select = group?.querySelector(`.sci-repair-select[data-repair-index="${search.dataset.repairIndex}"]`);
    if (!select) return;
    const term = norm(search.value);
    const found = term.length >= 2 ? cities.filter(city => city.key.includes(term)).slice(0, 12) : [];
    const language = en() ? 'en' : 'pt';
    select.replaceChildren(new Option(copy[language].choose, ''),
      ...found.map(city => new Option(city.name, city.name)));
    if (select.dataset.repairKind === 'location') select.add(new Option(copy[language].rank, '__rank__'));
  });
  conversation?.addEventListener('click', event => {
    const button = event.target.closest('.sci-repair-apply');
    if (!button || !conversation.contains(button)) return;
    const group = button.closest('.sci-repair-actions');
    const user = button.closest('.message.assistant')?.previousElementSibling;
    const original = user?.classList.contains('user') ? user.querySelector('.message-content p')?.textContent : '';
    const detection = original && detect(original);
    if (!group || !detection) return;
    const selected = detection.repairs.map((repair, index) => ({ repair,
      value: group.querySelector(`.sci-repair-select[data-repair-index="${index}"]`)?.value || '' }));
    if (selected.some(item => !item.value)) {
      const feedback = group.querySelector('.sci-repair-feedback');
      feedback.hidden = false;
      feedback.textContent = copy[en() ? 'en' : 'pt'].required;
      return;
    }
    const metricId = selected.find(item => ['metric', 'metricMissing', 'metricChoice', 'ranking'].includes(item.repair.kind))?.value || detection.metric;
    const chosenMetric = metrics.find(metric => metric.id === metricId) || metrics[0];
    const label = chosenMetric[en() ? 'en' : 'pt'];
    let corrected = original;
    for (const { repair, value } of selected) {
      if (['city', 'metric', 'year'].includes(repair.kind)) corrected = corrected.replace(repair.original,
        repair.kind === 'metric' ? label : value);
    }
    const location = selected.find(item => item.repair.kind === 'location');
    if (location) {
      if (location.value === '__rank__') corrected = en()
        ? `Which municipalities had the highest ${label}?`
        : `Quais municípios tiveram maior ${label}?`;
      else if (metricId !== detection.metric) corrected = en()
        ? `What was the ${label} in ${location.value}?`
        : `Qual foi a ${label} em ${location.value}?`;
      else corrected = corrected.replace(/\s*[?!.]\s*$/, '') + `${en() ? ' in ' : ' em '}${location.value}?`;
    }
    if (selected.some(item => item.repair.kind === 'metricMissing')) {
      const city = detection.matched[0];
      if (city) corrected = en() ? `What was the ${label} in ${city}?` : `Qual foi a ${label} em ${city}?`;
    }
    if (selected.some(item => item.repair.kind === 'ranking')) corrected = en()
      ? `Which 10 municipalities had the highest ${label}?`
      : `Quais são os 10 municípios com maior ${label}?`;
    const field = document.querySelector('#question');
    const form = document.querySelector('#question-form');
    if (!field || !form || field.disabled || form.querySelector('button[type="submit"]')?.disabled) return;
    field.value = corrected;
    form.requestSubmit();
  });
})();
