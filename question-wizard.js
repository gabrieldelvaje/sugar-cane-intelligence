/* Progressive question builder; keeps the existing menu, SVG states and animated chat submit. */
(() => {
  'use strict';
  const panel = document.querySelector('#question-builder-panel');
  const toggle = document.querySelector('#question-builder-toggle');
  const form = document.querySelector('#question-form');
  const input = document.querySelector('#question');
  const send = form?.querySelector('button[type="submit"]');
  if (!panel || !toggle || !form || !input || !send || typeof state === 'undefined') return;

  const choices = [
    ['leader', 'Maior município', 'Mostrar o município com o maior valor'],
    ['ranking', 'Ranking', 'Listar os 5, 10 ou 20 primeiros'],
    ['compare', 'Comparar cidades', 'Confrontar dois municípios'],
    ['city', 'Consultar cidade', 'Ver os dados de um município']
  ];
  const metrics = [
    ['produção', 'Produção de cana'], ['área colhida', 'Área colhida'],
    ['produtividade', 'Produtividade'], ['precipitação', 'Precipitação'],
    ['temperatura média', 'Temperatura média']
  ];
  const states = [...panel.querySelectorAll('#qb-state option')]
    .map(option => ({ uf: option.value, label: option.textContent.replace(/ \([A-Z]{2}\)$/, '') }));
  const selection = { action: '', metric: '', first: null, second: null, uf: '', period: 'all', year: '2024', from: '2010', to: '2024', count: '5' };
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const steps = () => ['action', 'metric', ...(selection.action === 'compare' ? ['first', 'second'] : selection.action === 'city' ? ['first'] : ['state']), 'period', 'review'];
  let step = 0;
  let cachedRows = null;
  let municipalities = [];
  let changing = false;

  const wizard = document.createElement('div');
  wizard.className = 'qb-wizard';
  wizard.innerHTML = '<div class="qb-wizard-progress" aria-live="polite"></div><div class="qb-wizard-view" aria-live="polite"></div><p class="qb-wizard-feedback" role="status" hidden></p><div class="qb-wizard-nav"><button type="button" class="qb-wizard-back">Voltar</button><button type="button" class="qb-wizard-next">Avançar</button></div>';
  panel.querySelector('.qb-heading').after(wizard);
  const progress = wizard.querySelector('.qb-wizard-progress');
  const view = wizard.querySelector('.qb-wizard-view');
  const feedback = wizard.querySelector('.qb-wizard-feedback');
  const back = wizard.querySelector('.qb-wizard-back');
  const next = wizard.querySelector('.qb-wizard-next');

  function warn(text = '') { feedback.textContent = text; feedback.hidden = !text; }
  function cityIndex() {
    if (!state.ready || !state.rows?.length) return false;
    if (cachedRows === state.rows) return municipalities.length > 0;
    cachedRows = state.rows;
    const unique = new Map();
    for (const row of state.rows) {
      const name = String(row.municipality || '').trim();
      const uf = String(row.uf || '').trim().toUpperCase();
      if (!name || !uf) continue;
      const key = normalize(name);
      if (!unique.has(key)) unique.set(key, { name, uf, codes: new Set() });
      unique.get(key).codes.add(uf);
    }
    municipalities = [...unique.values()]
      .filter(city => city.codes.size === 1 && city.name.length > 3 &&
        !normalize(city.name).includes('para') &&
        !['sao paulo', 'rio de janeiro', 'minas gerais', 'mato grosso', 'goias'].includes(normalize(city.name)))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return municipalities.length > 0;
  }
  function chooseButton(text, onClick, description = '', selected = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'qb-wizard-choice';
    button.setAttribute('aria-pressed', String(selected));
    const title = document.createElement('strong');
    title.textContent = text;
    button.append(title);
    if (description) {
      const caption = document.createElement('small');
      caption.textContent = description;
      button.append(caption);
    }
    button.addEventListener('click', onClick);
    return button;
  }
  function labeledSelect(label, values, current, onChange) {
    const wrap = document.createElement('label');
    wrap.className = 'qb-wizard-field';
    const title = document.createElement('span');
    title.textContent = label;
    const select = document.createElement('select');
    for (const [value, text] of values) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      select.append(option);
    }
    select.value = current;
    select.addEventListener('change', () => { onChange(select.value); warn(); });
    wrap.append(title, select);
    return wrap;
  }
  function periodText() {
    if (selection.period === 'year') return ` em ${selection.year}`;
    if (selection.period === 'range') return ` entre ${selection.from} e ${selection.to}`;
    return '';
  }
  function question() {
    const metric = selection.metric;
    const suffix = periodText();
    if (selection.action === 'leader' || selection.action === 'ranking') {
      const where = selection.uf ? ` em ${states.find(s => s.uf === selection.uf)?.label || ''}` : '';
      return selection.action === 'leader'
        ? `Qual município teve maior ${metric}${where}${suffix}?`
        : `Quais são os ${selection.count} municípios com maior ${metric}${where}${suffix}?`;
    }
    if (!selection.first) return '';
    const first = `${selection.first.name} (${selection.first.uf})`;
    if (selection.action === 'city') return `Qual foi a ${metric} em ${first}${suffix}?`;
    if (!selection.second) return '';
    return `Compare a ${metric} de ${first} e ${selection.second.name} (${selection.second.uf})${suffix}.`;
  }
  function validate(key) {
    if (key === 'action' && !selection.action) return 'Selecione o tipo de análise.';
    if (key === 'metric' && !selection.metric) return 'Selecione um indicador.';
    if (key === 'first' && !selection.first) return 'Escolha um município na lista.';
    if (key === 'second' && !selection.second) return 'Escolha o segundo município na lista.';
    if (key === 'period' && selection.period === 'range' && Number(selection.from) > Number(selection.to)) return 'O ano inicial deve ser anterior ou igual ao final.';
    if (key === 'review' && (!state.ready || send.disabled)) return 'Aguarde a base carregar ou a resposta atual terminar.';
    if (key === 'review' && selection.action === 'compare' && typeof places === 'function') {
      const matched = places(question());
      if (matched.length !== 2 || !matched.includes(selection.first.name) || !matched.includes(selection.second.name)) return 'Não consegui identificar essa dupla. Volte e escolha outros municípios.';
    }
    return '';
  }
  function citySearch(key) {
    const wrapper = document.createElement('div');
    wrapper.className = 'qb-wizard-city';
    const search = document.createElement('input');
    search.type = 'search';
    search.autocomplete = 'off';
    search.placeholder = 'Digite o nome de um município…';
    search.setAttribute('aria-label', key === 'first' ? 'Buscar município' : 'Buscar segundo município');
    const results = document.createElement('div');
    results.className = 'qb-wizard-results';
    const chosen = selection[key];
    search.value = chosen ? `${chosen.name} (${chosen.uf})` : '';
    function findMatches() {
      results.replaceChildren();
      if (!cityIndex()) { results.textContent = 'Aguarde a base de municípios carregar.'; return; }
      const term = normalize(search.value.replace(/\s*\([A-Z]{2}\)\s*$/, ''));
      if (!term) return;
      const matches = municipalities.filter(city => normalize(city.name).includes(term) &&
        (key !== 'second' || city.name !== selection.first?.name)).slice(0, 10);
      if (!matches.length) { results.textContent = 'Nenhum município encontrado.'; return; }
      for (const city of matches) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `${city.name} (${city.uf})`;
        button.addEventListener('click', () => { selection[key] = city; advance(); });
        results.append(button);
      }
    }
    search.addEventListener('input', () => { selection[key] = null; warn(); findMatches(); });
    search.addEventListener('focus', () => { if (!selection[key]) findMatches(); });
    search.addEventListener('keydown', event => {
      if (event.key === 'Enter' && results.querySelector('button')) {
        event.preventDefault(); results.querySelector('button').click();
      }
    });
    wrapper.append(search, results);
    return wrapper;
  }
  function draw() {
    warn();
    const keys = steps();
    step = Math.min(step, keys.length - 1);
    const key = keys[step];
    progress.textContent = `Etapa ${step + 1} de ${keys.length}`;
    view.replaceChildren();
    view.classList.remove('qb-wizard-view-enter');
    void view.offsetWidth;
    view.classList.add('qb-wizard-view-enter');
    const heading = document.createElement('h3');
    const captions = { action: 'O que você quer fazer?', metric: 'Qual indicador?', first: selection.action === 'compare' ? 'Primeiro município' : 'Qual município?', second: 'Segundo município', state: 'Onde pesquisar?', period: 'Qual período?', review: 'Confira sua pergunta' };
    heading.textContent = captions[key];
    view.append(heading);
    if (key === 'action') {
      const group = document.createElement('div'); group.className = 'qb-wizard-choices';
      for (const [value, label, caption] of choices) group.append(chooseButton(label, () => { selection.action = value; selection.first = null; selection.second = null; selection.uf = ''; advance(); }, caption, selection.action === value));
      view.append(group);
    } else if (key === 'metric') {
      const group = document.createElement('div'); group.className = 'qb-wizard-choices';
      for (const [value, label] of metrics) group.append(chooseButton(label, () => { selection.metric = value; advance(); }, '', selection.metric === value));
      view.append(group);
    } else if (key === 'first' || key === 'second') {
      const note = document.createElement('p'); note.className = 'qb-wizard-note';
      note.textContent = key === 'second' && selection.first ? `Comparar com ${selection.first.name} (${selection.first.uf}).` : 'Busque e selecione uma cidade da base de dados.';
      view.append(note, citySearch(key));
    } else if (key === 'state') {
      const group = document.createElement('div'); group.className = 'qb-wizard-choices qb-wizard-states';
      for (const item of states) group.append(chooseButton(item.label + (item.uf ? ` (${item.uf})` : ''), () => { selection.uf = item.uf; advance(); }, '', selection.uf === item.uf));
      view.append(group);
      if (selection.action === 'ranking') view.append(labeledSelect('Quantidade', [['5', 'Top 5'], ['10', 'Top 10'], ['20', 'Top 20']], selection.count, value => { selection.count = value; }));
    } else if (key === 'period') {
      const group = document.createElement('div'); group.className = 'qb-wizard-choices qb-wizard-periods';
      for (const [value, label] of [['all', 'Toda a série disponível'], ['year', 'Um ano'], ['range', 'Entre dois anos']]) group.append(chooseButton(label, () => { selection.period = value; draw(); }, '', selection.period === value));
      view.append(group);
      const available = state.ready ? [...new Set(state.rows.map(row => Number(row.year)).filter(y => y >= 1974 && y <= 2024))].sort((a, b) => b - a) : Array.from({ length: 51 }, (_, index) => 2024 - index);
      const options = available.map(y => [String(y), String(y)]);
      if (selection.period === 'year') view.append(labeledSelect('Ano', options, selection.year, value => { selection.year = value; }));
      if (selection.period === 'range') {
        const dates = document.createElement('div'); dates.className = 'qb-wizard-date-pair';
        dates.append(labeledSelect('De', options, selection.from, value => { selection.from = value; }), labeledSelect('Até', options, selection.to, value => { selection.to = value; }));
        view.append(dates);
      }
    } else {
      const summary = document.createElement('p'); summary.className = 'qb-wizard-summary';
      summary.textContent = question();
      const note = document.createElement('p'); note.className = 'qb-wizard-note';
      note.textContent = 'A pergunta será enviada ao chat com a animação normal.';
      view.append(summary, note);
    }
    back.textContent = step === 0 ? 'Fechar' : 'Voltar';
    next.textContent = key === 'review' ? 'Enviar pergunta ↑' : 'Avançar →';
    next.disabled = key === 'review' && send.disabled;
    if (panel.getAttribute('aria-hidden') === 'false') {
      const focus = view.querySelector('input') || view.querySelector('button') || view.querySelector('select');
      focus?.focus({ preventScroll: true });
    }
  }
  function transition(nextStep) {
    if (changing) return;
    changing = true;
    const finish = () => { step = nextStep; changing = false; draw(); };
    if (view.animate && panel.getAttribute('aria-hidden') === 'false') {
      const animation = view.animate([{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(-16px)' }], { duration: 120, easing: 'ease-in', fill: 'forwards' });
      animation.finished.then(finish, finish);
    } else finish();
  }
  function advance() {
    if (changing) return;
    const error = validate(steps()[step]);
    if (error) { warn(error); return; }
    if (steps()[step] === 'review') {
      const built = question();
      if (!built) { warn('Complete os campos antes de enviar.'); return; }
      input.value = built;
      toggle.click(); // Close the original panel and restore the existing animated send flow.
      form.requestSubmit();
      return;
    }
    transition(step + 1);
  }
  back.addEventListener('click', () => { if (step === 0) toggle.click(); else transition(step - 1); });
  next.addEventListener('click', advance);
  toggle.addEventListener('click', () => {
    if (toggle.getAttribute('aria-expanded') === 'true') {
      step = 0;
      changing = false;
      requestAnimationFrame(draw); // The old builder initially focuses its now-hidden controls.
    }
  });
  document.querySelector('#new-chat')?.addEventListener('click', () => { step = 0; changing = false; }, true);
  draw();
})();