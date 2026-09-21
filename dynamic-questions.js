/* Generate clickable suggestions using municipalities, states, metrics and years
   in the loaded dataset. Comparison suggestions require two positive results. */
(() => {
  'use strict';
  const conversation = document.querySelector('#conversation');
  const initial = document.querySelector('#suggestions');
  const form = document.querySelector('#question-form');
  const input = document.querySelector('#question');
  const hero = document.querySelector('#home-hero');
  if (!conversation || !initial || !form || !input || !hero || typeof state === 'undefined') return;

  const metrics = [
    ['production', 'produção'], ['area', 'área colhida'],
    ['productivity', 'produtividade'], ['precipitation', 'precipitação'],
    ['temperature', 'temperatura média']
  ];
  const states = [
    ['SP', 'São Paulo'], ['MG', 'Minas Gerais'], ['GO', 'Goiás'],
    ['PR', 'Paraná'], ['MT', 'Mato Grosso'], ['PE', 'Pernambuco'],
    ['AL', 'Alagoas'], ['BA', 'Bahia'], ['RJ', 'Rio de Janeiro']
  ];
  const pick = values => values[Math.floor(Math.random() * values.length)];
  const normName = value => String(value).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const randomYear = (from, to) => from + Math.floor(Math.random() * (to - from + 1));
  const shuffle = values => {
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  };
  const stateNames = states.map(([, label]) => normName(label));
  const index = new Map();
  const nameStates = new Map();
  let indexedRows = null;
  let previousQuestions = [];
  const key = (metric, year, uf) => `${metric}|${year}|${uf}`;

  function buildIndex() {
    if (!state.ready || !state.rows?.length) return false;
    if (indexedRows === state.rows) return true;
    indexedRows = state.rows;
    index.clear();
    nameStates.clear();
    const allowed = new Set(states.map(([uf]) => uf));
    for (const row of state.rows) {
      const uf = String(row.uf || '').trim().toUpperCase();
      const year = Number(row.year);
      if (!allowed.has(uf) || year < 2000 || year > 2024) continue;
      const name = String(row.municipality || '').trim();
      if (!name) continue;
      const normalized = normName(name);
      if (!nameStates.has(normalized)) nameStates.set(normalized, new Set());
      nameStates.get(normalized).add(uf);
      for (const [metric] of metrics) {
        if (!Number.isFinite(row[metric])) continue;
        const id = key(metric, year, uf);
        if (!index.has(id)) index.set(id, new Set());
        index.get(id).add(name);
      }
    }
    return index.size > 0;
  }

  function unambiguousCity(name) {
    const normalized = normName(name);
    return normalized.length > 4 && nameStates.get(normalized)?.size === 1 &&
      !stateNames.some(stateName => normalized.includes(stateName)) &&
      // The existing state parser treats the substring "para" as Pará.
      !normalized.includes('para');
  }

  // Aggregate exactly as the chatbot does: production=sum, area=max,
  // productivity/precipitation/temperature=mean. A positive individual row
  // does not by itself guarantee a positive aggregate across a chosen period.
  function positiveComparisonCities(metric, uf, from, to) {
    const summary = new Map();
    for (const row of state.rows) {
      if (String(row.uf).trim().toUpperCase() !== uf ||
          row.year < from || row.year > to || !Number.isFinite(row[metric])) continue;
      const name = row.municipality;
      let item = summary.get(name);
      if (!item) {
        item = { sum: 0, count: 0, max: -Infinity, years: new Set() };
        summary.set(name, item);
      }
      item.sum += row[metric];
      item.count++;
      item.max = Math.max(item.max, row[metric]);
      item.years.add(row.year);
    }
    const aggregateType = info[metric].agg;
    return shuffle([...summary].filter(([name, item]) => {
      const value = aggregateType === 'sum' ? item.sum
        : aggregateType === 'max' ? item.max : item.sum / item.count;
      return item.years.size >= 2 && Number.isFinite(value) && value > 0 &&
        unambiguousCity(name);
    }).map(([name]) => name));
  }

  function makeQuestion(type) {
    const [metric, label] = pick(metrics);
    const [uf, stateLabel] = pick(states);

    if (type === 'national') {
      const available = [];
      for (let year = 2000; year <= 2024; year++) {
        let municipalities = 0;
        for (const [code] of states) municipalities += index.get(key(metric, year, code))?.size || 0;
        if (municipalities >= 10) available.push(year);
      }
      if (!available.length) return null;
      return `Qual município teve maior ${label} em ${pick(available)}?`;
    }

    if (type === 'state') {
      const available = [];
      for (let year = 2000; year <= 2024; year++) {
        const count = index.get(key(metric, year, uf))?.size || 0;
        if (count >= 5) available.push({ year, count });
      }
      if (!available.length) return null;
      const { year, count } = pick(available);
      const amount = pick(count >= 10 ? [5, 10] : [5]);
      return `Quais são os ${amount} municípios com maior ${label} em ${stateLabel} em ${year}?`;
    }

    if (type === 'city') {
      const available = [];
      for (let year = 2000; year <= 2024; year++) {
        const cities = [...(index.get(key(metric, year, uf)) || [])].filter(unambiguousCity);
        if (cities.length) available.push({ year, cities });
      }
      if (!available.length) return null;
      const { year, cities } = pick(available);
      const city = pick(cities);
      const question = `Qual foi a ${label} em ${city} em ${year}?`;
      return typeof places !== 'function' || places(question).includes(city) ? question : null;
    }

    if (type === 'compare') {
      const [from, to] = Math.random() < .4
        ? pick([[2000, 2020], [2010, 2024]])
        : (() => { const start = randomYear(2000, 2018); return [start, randomYear(start + 3, 2024)]; })();
      const cities = positiveComparisonCities(metric, uf, from, to);
      if (cities.length < 2) return null;
      const first = cities[0];
      for (const second of cities.slice(1, 30)) {
        const question = `Compare a ${label} de ${first} e ${second} entre ${from} e ${to}.`;
        // Ensure the municipality parser will actually compare this exact pair.
        if (typeof places !== 'function') return question;
        const matched = places(question);
        if (matched.length === 2 && matched.includes(first) && matched.includes(second)) return question;
      }
    }
    return null;
  }

  function generate(count, asked = '') {
    if (!buildIndex()) return [];
    const excluded = new Set([...previousQuestions, asked].map(normName));
    const result = [];
    const kinds = shuffle(['compare', 'city', 'state', 'national']);
    for (let attempt = 0; result.length < count && attempt < 100; attempt++) {
      const type = kinds[attempt % kinds.length];
      const question = makeQuestion(type);
      if (!question || excluded.has(normName(question))) continue;
      excluded.add(normName(question));
      result.push(question);
    }
    if (result.length === count) previousQuestions = result.slice();
    return result;
  }

  function submitSuggested(question) {
    if (form.querySelector('button[type="submit"]')?.disabled) return;
    input.value = question;
    form.requestSubmit();
  }

  function enhanceGroup(group) {
    if (group.dataset.randomized === 'true') return;
    group.dataset.randomized = 'true';
    const buttons = [...group.querySelectorAll('button')];
    if (buttons.length !== 2) return;
    const asked = group.closest('.message')?.previousElementSibling?.querySelector('.message-content')?.textContent || '';
    const questions = generate(2, asked);
    if (questions.length !== 2) return;
    buttons.forEach((old, i) => {
      const button = old.cloneNode(false);
      button.textContent = questions[i];
      button.type = 'button';
      button.addEventListener('click', () => submitSuggested(questions[i]));
      old.replaceWith(button);
    });
  }

  new MutationObserver(() => {
    for (const group of conversation.querySelectorAll('.follow-up-suggestions:not([data-randomized])')) {
      enhanceGroup(group);
    }
  }).observe(conversation, { childList: true, subtree: true });

  let checks = 0;
  function refreshOpening() {
    if (hero.hidden) return;
    if (!state.ready) {
      if (++checks < 150) window.setTimeout(refreshOpening, 200);
      return;
    }
    const questions = generate(4);
    if (questions.length === 4) {
      [...initial.querySelectorAll('button')].slice(0, 4).forEach((button, i) => {
        button.textContent = questions[i];
      });
    }
  }
  refreshOpening();
  document.querySelector('#new-chat')?.addEventListener('click', () => {
    previousQuestions = [];
    if (state.ready) window.requestAnimationFrame(refreshOpening);
  });
})();
