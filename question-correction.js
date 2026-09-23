/* Repair supported municipal requests before the scope guard falls back to an error.
   No guessed city or year is ever submitted without the reader choosing it. */
(() => {
  'use strict';
  if (typeof answer !== 'function' || typeof state === 'undefined') return;
  const previousAnswer = answer;
  const normalize = value => String(value ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const isEnglish = () => window.SCIi18n?.get() === 'en';
  const metrics = [
    { name: 'production', pt: 'produção', en: 'production', terms: ['producao', 'produçao', 'production', 'produzida'] },
    { name: 'area', pt: 'área colhida', en: 'harvested area', terms: ['area colhida', 'area cultivada', 'harvested area'] },
    { name: 'productivity', pt: 'produtividade', en: 'yield', terms: ['produtividade', 'rendimento', 'productivity', 'yield'] },
    { name: 'precipitation', pt: 'precipitação', en: 'rainfall', terms: ['precipitacao', 'pluviosidade', 'chuva', 'rainfall', 'precipitation'] },
    { name: 'temperature', pt: 'temperatura média', en: 'average temperature', terms: ['temperatura', 'temperature', 'calor'] }
  ];
  const unsupported = /\b(?:futebol|jogo|jogos|partida|placar|football|soccer|game|match|score|populacao|population|habitantes|prefeito|mayor|eleicao|election|pib|gdp|renda|income|salario|salary|precos|prices|filme|movie|musica|music|crime|criminalidade|lottery|loteria)\b/;
  const intent = /\b(?:qual|quais|quanto|quantos|compare|comparar|comparacao|ranking|rank|top|maior|maiores|menor|menores|what|which|how|comparison|highest|lowest|largest|average|show|list)\b/;
  const compareIntent = /\b(?:compare|comparar|comparacao|comparison)\b/;
  const rankingIntent = /\b(?:ranking|rank|top|maiores|menores|municipios|municipio|municipalities|cities|highest|largest)\b/;
  const metricFor = question => metrics.find(item => item.terms.some(term =>
    new RegExp(`\\b${normalize(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(normalize(question))));
  let indexedRows = null;
  let cities = [];
  let availableYears = [];
  function index() {
    if (indexedRows === state.rows) return;
    indexedRows = state.rows;
    const map = new Map();
    for (const row of state.rows || []) {
      const name = String(row.municipality ?? '').trim();
      if (name && !map.has(normalize(name))) map.set(normalize(name), name);
    }
    cities = [...map].map(([key, name]) => ({ key, name }));
    availableYears = [...new Set((state.rows || []).map(row => Number(row.year)))]
      .filter(year => Number.isInteger(year) && year >= 1974 && year <= 2024)
      .sort((a, b) => b - a);
  }
  function distance(a, b, limit = 5) {
    if (Math.abs(a.length - b.length) > limit) return limit + 1;
    let row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const next = [i];
      let minimum = i;
      for (let j = 1; j <= b.length; j++) {
        next[j] = Math.min(next[j - 1] + 1, row[j] + 1,
          row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        minimum = Math.min(minimum, next[j]);
      }
      if (minimum > limit) return limit + 1;
      row = next;
    }
    return row[b.length];
  }
  function citySuggestions(fragment) {
    const key = normalize(fragment).replace(/\s*\([a-z]{2}\)$/, '');
    if (key.length < 4 || /\d/.test(key)) return [];
    const limit = Math.min(5, Math.max(2, Math.ceil(key.length * .43)));
    return cities.filter(city => Math.abs(city.key.length - key.length) <= limit &&
        (city.key[0] === key[0] || city.key.slice(0, 2) === key.slice(0, 2)))
      .map(city => ({ ...city, score: distance(key, city.key, limit) }))
      .filter(city => city.score <= limit && city.score / Math.max(key.length, city.key.length) <= .46)
      .sort((a, b) => a.score - b.score || a.key.length - b.key.length)
      .slice(0, 6);
  }
  function compareFragments(question) {
    const match = question.match(/\b(?:compare|comparar|comparacao|comparison)\b\s+(.+?)\s+(?:com|e|and|vs|versus)\s+(.+?)(?=\s+(?:em|in|entre|between|from|de)\s+\d{3,4}\b|[?!.]|$)/iu);
    if (!match) return [];
    const left = match[1].replace(/^.*\b(?:de|da|do|of)\s+/iu, '').trim();
    const right = match[2].trim();
    return [left, right].filter(Boolean);
  }
  function singleFragment(question) {
    const prefix = question.replace(/\s+(?:em|in|entre|between|from)\s+\d{3,4}\b[\s\S]*$/iu, '')
      .replace(/[?!.]\s*$/, '').trim();
    const prepositions = [...prefix.matchAll(/\b(?:em|in|de|of|for|para)\s+/giu)];
    const last = prepositions.at(-1);
    if (!last) return '';
    const fragment = prefix.slice(last.index + last[0].length).trim();
    return /^(?:cana|sugarcane|producao|production|chuva|rainfall|area|year|ano)$/i.test(normalize(fragment))
      ? '' : fragment;
  }
  function yearMistakes(question) {
    const result = [];
    for (const match of question.matchAll(/\b\d{3,4}\b/g)) {
      const token = match[0];
      const before = normalize(question.slice(0, match.index));
      const context = /\b(?:em|no|ano|de|entre|ate|a|in|year|from|between|to)\s*$/.test(before);
      if (!context) continue;
      const year = Number(token);
      if (token.length === 4 && year >= 1974 && year <= 2024) continue;
      // Do not confuse a ranked count or a production quantity with a year.
      if (token.length === 3 && !/\b(?:em|no|ano|in|year|entre|between|de|from)\s*$/.test(before)) continue;
      let preferred = token.length === 3 ? Number(token + '0') : year;
      if (!availableYears.includes(preferred)) preferred = availableYears.reduce((best, candidate) =>
        Math.abs(candidate - preferred) < Math.abs(best - preferred) ? candidate : best, availableYears[0]);
      result.push({ kind: 'year', fragment: token, choices: [preferred, ...availableYears.filter(y => y !== preferred)].map(String) });
    }
    return result;
  }
  function detect(question) {
    if (!state.ready || !state.rows?.length || question.length > 450) return null;
    index();
    const text = normalize(question);
    if (unsupported.test(text) || /\b(?:hoje|ontem|today|yesterday|tomorrow|amanha|now|agora)\b/.test(text)) return null;
    const comparing = compareIntent.test(text);
    const ranking = rankingIntent.test(text);
    const known = typeof places === 'function' ? places(question) : [];
    const metric = metricFor(question);
    const years = yearMistakes(question);
    const repairs = [];
    const supported = !!metric || comparing || ranking || known.length > 0 || /\brank\w*\b/.test(text);
    if (!supported || (!intent.test(text) && !/\brank\w*\b/.test(text))) return null;

    if (comparing) {
      const fragments = compareFragments(question);
      if (fragments.length === 2 && known.length < 2) {
        for (const [i, fragment] of fragments.entries()) {
          const key = normalize(fragment).replace(/\s*\([a-z]{2}\)$/, '');
          if (cities.some(city => city.key === key)) continue;
          if (i === 0 && key === 'ribeirao' && known.includes('Ribeirão Preto')) continue;
          const choices = citySuggestions(fragment);
          if (choices.length) repairs.push({ kind: 'city', fragment, choices: choices.map(item => item.name), slot: i + 1 });
        }
      }
    } else if (!ranking && known.length === 0 && metric) {
      const fragment = singleFragment(question);
      const choices = fragment ? citySuggestions(fragment) : [];
      if (fragment && choices.length) repairs.push({ kind: 'city', fragment, choices: choices.map(item => item.name), slot: 1 });
      else if (!fragment) repairs.push({ kind: 'location', fragment: '', choices: [], slot: 1 });
    }

    // A metric typo is correctable only when it resembles a supported indicator.
    if (!metric) {
      const words = [...question.matchAll(/[\p{L}]{5,}/gu)];
      let best = null;
      for (const match of words) {
        const token = normalize(match[0]);
        if (/^(?:municipio|municipios|cidade|cidades|piracicaba|ribeirao|compare|ranking|maiores|menores|which|municipality|municipalities)$/.test(token)) continue;
        for (const item of metrics) for (const alias of item.terms.filter(t => !t.includes(' '))) {
          const term = normalize(alias);
          const d = distance(token, term, 3);
          if (token[0] === term[0] && d <= 2 && d > 0 && (!best || d < best.distance))
            best = { kind: 'metric', fragment: match[0], choices: metrics.map(m => m.name), preferred: item.name, distance: d };
        }
      }
      if (best && (known.length || repairs.some(r => r.kind === 'city'))) repairs.push(best);
      else if (!comparing && !ranking && known.length === 1 && /^\s*(?:qual|what|which|how)\b/i.test(text)) {
        // A bare city request requires the reader to choose a metric explicitly.
        const rest = text.replace(/\b(?:qual|what|which|how|foi|e|a|o|the|was|is|em|in|de|of|for|ano)\b/g, ' ')
          .replace(/\b\d{3,4}\b/g, ' ').replace(/\s+/g, ' ').trim();
        if (rest.length < 40) repairs.push({ kind: 'metricMissing', fragment: '', choices: metrics.map(m => m.name), preferred: 'production' });
      } else if (/\brank\w*\b/.test(text) && !ranking) repairs.push({ kind: 'ranking', fragment: '', choices: metrics.map(m => m.name), preferred: 'production' });
    }
    repairs.push(...years);
    // Do not mask an unrelated question or guess when the misspelled city has
    // no plausible entry in the actual dataset.
    if (!repairs.length) return null;
    if (comparing && known.length < 2 && !repairs.some(r => r.kind === 'city')) return null;
    return { repairs, metric: metric?.name || 'production', known, comparing, ranking };
  }
  const strings = {
    pt: { title: 'Vamos corrigir sua pergunta', hint: 'Escolha as opções abaixo. Só farei a análise depois da sua confirmação.',
      metric: 'Indicador', city: 'Município', first: 'Primeiro município', second: 'Segundo município',
      year: 'Ano', choose: 'Selecione uma opção', search: 'Buscar outro município…',
      searchHint: 'Digite pelo menos duas letras para buscar na base.', apply: 'Analisar pergunta corrigida',
      missing: 'Escolha os campos indicados para continuar.', rank: 'Ranking dos municípios (sem cidade específica)' },
    en: { title: 'Let’s correct your question', hint: 'Select the options below. I will only analyze the corrected question after you confirm.',
      metric: 'Indicator', city: 'Municipality', first: 'First municipality', second: 'Second municipality',
      year: 'Year', choose: 'Choose an option', search: 'Search another municipality…',
      searchHint: 'Type at least two letters to search the dataset.', apply: 'Analyze corrected question',
      missing: 'Select the required fields to continue.', rank: 'Municipality ranking (no specific city)' }
  };
  function dropdown(repair, i, language) {
    const s = strings[language];
    const isCity = repair.kind === 'city' || repair.kind === 'location';
    const label = repair.kind === 'year' ? s.year : isCity
      ? (repair.slot === 2 ? s.second : repair.slot === 1 && repair.kind === 'city' ? s.first : s.city) : s.metric;
    const current = repair.preferred || '';
    const options = repair.choices.map(value => {
      const metricItem = metrics.find(m => m.name === value);
      const caption = metricItem ? metricItem[language] : value;
      return `<option value="${safe(value)}"${value === current ? ' selected' : ''}>${safe(caption)}</option>`;
    }).join('');
    const rank = repair.kind === 'location' ? `<option value="__rank__">${safe(s.rank)}</option>` : '';
    return `<label class="sci-repair-field"><span>${safe(label)}</span>` +
      `<select class="sci-repair-select" data-repair-index="${i}" aria-label="${safe(label)}">` +
      `<option value="">${safe(s.choose)}</option>${options}${rank}</select>` +
      (isCity ? `<input class="sci-repair-city-search" data-repair-index="${i}" type="search" autocomplete="off" placeholder="${safe(s.search)}" aria-label="${safe(s.search)}">` : '') +
      `</label>`;
  }
  function guidance(detection) {
    const language = isEnglish() ? 'en' : 'pt';
    const s = strings[language];
    return `<div class="error sci-repair-intro"><strong>${safe(s.title)}</strong><br>${safe(s.hint)}</div>` +
      `<div class="sci-scope-actions sci-repair-actions" data-sci-repair="1">` +
      detection.repairs.map((repair, i) => dropdown(repair, i, language)).join('') +
      `<p class="sci-repair-feedback" role="status" hidden></p>` +
      `<button type="button" class="sci-repair-apply">${safe(s.apply)}</button></div>`;
  }
  answer = function repairedAnswer(question) {
    const detection = detect(String(question ?? ''));
    return detection ? guidance(detection) : previousAnswer(question);
  };
  const conversation = document.querySelector('#conversation');
  function groupFor(element) { return element.closest('.sci-repair-actions'); }
  conversation?.addEventListener('input', event => {
    const input = event.target.closest('.sci-repair-city-search');
    if (!input || !conversation.contains(input)) return;
    const select = groupFor(input)?.querySelector(`.sci-repair-select[data-repair-index="${input.dataset.repairIndex}"]`);
    if (!select) return;
    const text = normalize(input.value);
    const matches = text.length >= 2 ? cities.filter(city => city.key.includes(text)).slice(0, 12) : [];
    const placeholder = strings[isEnglish() ? 'en' : 'pt'].choose;
    select.replaceChildren(new Option(placeholder, ''), ...matches.map(city => new Option(city.name, city.name)));
    if (select.dataset.kind === 'location') select.add(new Option(strings[isEnglish() ? 'en' : 'pt'].rank, '__rank__'));
  });
  conversation?.addEventListener('click', event => {
    const button = event.target.closest('.sci-repair-apply');
    if (!button || !conversation.contains(button)) return;
    const group = groupFor(button);
    const response = button.closest('.message.assistant');
    const user = response?.previousElementSibling;
    const original = user?.classList.contains('user') ? user.querySelector('.message-content p')?.textContent : '';
    const detection = original && detect(original);
    if (!detection || !group) return;
    const values = detection.repairs.map((repair, index) => ({
      repair, value: group.querySelector(`.sci-repair-select[data-repair-index="${index}"]`)?.value || ''
    }));
    const feedback = group.querySelector('.sci-repair-feedback');
    if (values.some(item => !item.value)) {
      feedback.hidden = false;
      feedback.textContent = strings[isEnglish() ? 'en' : 'pt'].missing;
      return;
    }
    let corrected = original;
    const metricSelected = values.find(item => ['metric', 'metricMissing', 'ranking'].includes(item.repair.kind));
    const metricName = metricSelected?.value || detection.metric;
    const metric = metrics.find(item => item.name === metricName) || metrics[0];
    const metricLabel = metric[isEnglish() ? 'en' : 'pt'];
    for (const { repair, value } of values) {
      if (repair.kind === 'city' || repair.kind === 'metric' || repair.kind === 'year')
        corrected = corrected.replace(repair.fragment, repair.kind === 'metric' ? metricLabel : value);
    }
    const location = values.find(item => item.repair.kind === 'location');
    if (location) {
      if (location.value === '__rank__') {
        corrected = isEnglish() ? `Which municipalities had the highest ${metricLabel}?`
          : `Quais municípios tiveram maior ${metricLabel}?`;
      } else {
        corrected = corrected.replace(/\s*[?.!]\s*$/, '');
        corrected += `${isEnglish() ? ' in ' : ' em '}${location.value}?`;
      }
    }
    if (values.some(item => item.repair.kind === 'metricMissing')) {
      const city = detection.known[0];
      if (city) corrected = isEnglish() ? `What was the ${metricLabel} in ${city}?`
        : `Qual foi a ${metricLabel} em ${city}?`;
    }
    if (values.some(item => item.repair.kind === 'ranking')) corrected = isEnglish()
      ? `Which 10 municipalities had the highest ${metricLabel}?`
      : `Quais são os 10 municípios com maior ${metricLabel}?`;
    const field = document.querySelector('#question');
    const form = document.querySelector('#question-form');
    if (!field || !form || field.disabled || form.querySelector('button[type="submit"]')?.disabled) return;
    field.value = corrected;
    form.requestSubmit();
  });
})();
