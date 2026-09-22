/* Guided question builder: reuse the existing animated question form. */
(() => {
  'use strict';
  const form = document.querySelector('#question-form');
  const input = document.querySelector('#question');
  const send = form?.querySelector('button[type="submit"]');
  if (!form || !input || !send || typeof state === 'undefined') return;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.id = 'question-builder-toggle';
  toggle.className = 'question-builder-toggle';
  toggle.title = 'Montar pergunta';
  toggle.setAttribute('aria-label', 'Montar pergunta escolhendo uma análise');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'question-builder-panel');
  toggle.innerHTML = '<svg viewBox="0 0 32 32" width="27" height="27" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18.5 20.7 4.8a2.5 2.5 0 0 1 3.5 3.5L10.5 22 5.5 23.5Z"/><path d="m18.8 6.7 3.5 3.5"/><circle cx="8" cy="28" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="28" r="1" fill="currentColor" stroke="none"/><circle cx="24" cy="28" r="1" fill="currentColor" stroke="none"/></svg>';
  input.before(toggle);

  const backdrop = document.createElement('div');
  backdrop.className = 'question-builder-backdrop';
  backdrop.hidden = true;
  const panel = document.createElement('section');
  panel.id = 'question-builder-panel';
  panel.className = 'question-builder-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Montar uma pergunta');
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = `
    <div class="qb-heading"><div><strong>Montar pergunta</strong><p>Escolha a análise e os dados que quer consultar.</p></div><button type="button" class="qb-close" aria-label="Fechar menu">×</button></div>
    <div class="qb-scroll">
      <div class="qb-action-group" role="group" aria-label="Tipo de análise">
        <button type="button" class="qb-action" data-action="leader" aria-pressed="true">Maior município</button>
        <button type="button" class="qb-action" data-action="ranking" aria-pressed="false">Ranking</button>
        <button type="button" class="qb-action" data-action="compare" aria-pressed="false">Comparar cidades</button>
        <button type="button" class="qb-action" data-action="city" aria-pressed="false">Consultar cidade</button>
      </div>
      <div class="qb-fields">
        <label class="qb-field"><span>Indicador</span><select id="qb-metric"><option value="produção">Produção de cana</option><option value="área colhida">Área colhida</option><option value="produtividade">Produtividade</option><option value="precipitação">Precipitação</option><option value="temperatura média">Temperatura média</option></select></label>
        <label class="qb-field" id="qb-count-field" hidden><span>Quantidade no ranking</span><select id="qb-count"><option value="5">Top 5</option><option value="10">Top 10</option><option value="20">Top 20</option></select></label>
        <label class="qb-field" id="qb-state-field"><span>Estado</span><select id="qb-state"><option value="">Brasil inteiro</option><option value="AL">Alagoas (AL)</option><option value="BA">Bahia (BA)</option><option value="GO">Goiás (GO)</option><option value="MA">Maranhão (MA)</option><option value="MG">Minas Gerais (MG)</option><option value="MS">Mato Grosso do Sul (MS)</option><option value="MT">Mato Grosso (MT)</option><option value="PA">Pará (PA)</option><option value="PB">Paraíba (PB)</option><option value="PE">Pernambuco (PE)</option><option value="PR">Paraná (PR)</option><option value="RJ">Rio de Janeiro (RJ)</option><option value="RN">Rio Grande do Norte (RN)</option><option value="RS">Rio Grande do Sul (RS)</option><option value="SC">Santa Catarina (SC)</option><option value="SE">Sergipe (SE)</option><option value="SP">São Paulo (SP)</option><option value="TO">Tocantins (TO)</option></select></label>
        <div class="qb-field qb-city-picker" id="qb-first-field" hidden><label for="qb-first"><span id="qb-first-label">Primeira cidade</span></label><input id="qb-first" type="text" autocomplete="off" placeholder="Busque uma cidade…" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="qb-first-results"><div class="qb-city-results" id="qb-first-results" role="listbox" hidden></div></div>
        <div class="qb-field qb-city-picker" id="qb-second-field" hidden><label for="qb-second"><span>Segunda cidade</span></label><input id="qb-second" type="text" autocomplete="off" placeholder="Busque outra cidade…" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="qb-second-results"><div class="qb-city-results" id="qb-second-results" role="listbox" hidden></div></div>
        <label class="qb-field" id="qb-period-field"><span>Período</span><select id="qb-period"><option value="all">Toda a série disponível</option><option value="year">Um ano</option><option value="range">Entre dois anos</option></select></label>
        <label class="qb-field" id="qb-year-field" hidden><span>Ano</span><select id="qb-year"></select></label>
        <label class="qb-field" id="qb-from-field" hidden><span>De</span><select id="qb-from"></select></label>
        <label class="qb-field" id="qb-to-field" hidden><span>Até</span><select id="qb-to"></select></label>
      </div>
    </div>
    <div class="qb-footer"><p id="qb-preview" class="qb-preview" aria-live="polite"></p><p id="qb-feedback" class="qb-feedback" role="status" hidden></p><button type="button" id="qb-submit" class="qb-submit">Enviar pergunta <span aria-hidden="true">↑</span></button></div>`;
  document.body.append(backdrop, panel);

  const $ = selector => panel.querySelector(selector);
  const actions = [...panel.querySelectorAll('.qb-action')];
  const metric = $('#qb-metric');
  const count = $('#qb-count');
  const uf = $('#qb-state');
  const period = $('#qb-period');
  const year = $('#qb-year');
  const from = $('#qb-from');
  const to = $('#qb-to');
  const firstInput = $('#qb-first');
  const secondInput = $('#qb-second');
  const feedback = $('#qb-feedback');
  const preview = $('#qb-preview');
  const submit = $('#qb-submit');
  let action = 'leader';
  let open = false;
  let cities = [];
  let indexedRows = null;
  const selected = { first: null, second: null };
  const stateLabels = Object.fromEntries([...uf.options].filter(option => option.value)
    .map(option => [option.value, option.textContent.replace(/ \([A-Z]{2}\)$/, '')]));
  const normalize = value => String(value ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  for (let y = 2024; y >= 1974; y--) {
    for (const select of [year, from, to]) {
      const option = document.createElement('option');
      option.value = String(y);
      option.textContent = String(y);
      select.append(option);
    }
  }
  year.value = '2024'; from.value = '2010'; to.value = '2024';

  function indexCities() {
    if (!state.ready || !state.rows?.length) return false;
    if (indexedRows === state.rows) return true;
    indexedRows = state.rows;
    const unique = new Map();
    for (const row of state.rows) {
      const name = String(row.municipality || '').trim();
      const code = String(row.uf || '').trim().toUpperCase();
      if (!name || !code) continue;
      const key = normalize(name);
      if (!unique.has(key)) unique.set(key, { name, uf: code, codes: new Set() });
      unique.get(key).codes.add(code);
    }
    // Names shared by different states are not uniquely resolved by the current chatbot.
    cities = [...unique.values()].filter(city => city.codes.size === 1 &&
      city.name.length > 3 && !normalize(city.name).includes('para') &&
      !['sao paulo', 'rio de janeiro', 'minas gerais', 'mato grosso', 'goias'].includes(normalize(city.name)))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return cities.length > 0;
  }

  function showFeedback(message) {
    feedback.textContent = message;
    feedback.hidden = !message;
  }
  function hideResults(slot) {
    const field = $(`#qb-${slot}-field`);
    field.querySelector('.qb-city-results').hidden = true;
    field.querySelector('input').setAttribute('aria-expanded', 'false');
  }
  function chooseCity(slot, city) {
    selected[slot] = city;
    $(`#qb-${slot}`).value = `${city.name} (${city.uf})`;
    hideResults(slot);
    showFeedback('');
    updatePreview();
  }
  function showResults(slot) {
    const field = $(`#qb-${slot}-field`);
    const search = field.querySelector('input');
    const results = field.querySelector('.qb-city-results');
    results.replaceChildren();
    if (!indexCities()) {
      const message = document.createElement('p');
      message.className = 'qb-empty';
      message.textContent = 'Aguarde o carregamento da base de municípios.';
      results.append(message);
      results.hidden = false;
      search.setAttribute('aria-expanded', 'true');
      return;
    }
    const query = normalize(search.value.replace(/\s*\([A-Z]{2}\)\s*$/, ''));
    if (!query) { hideResults(slot); return; }
    const matches = cities.filter(city => normalize(city.name).includes(query)).slice(0, 12);
    if (!matches.length) {
      const message = document.createElement('p');
      message.className = 'qb-empty';
      message.textContent = 'Nenhum município encontrado.';
      results.append(message);
    }
    for (const city of matches) {
      const option = document.createElement('button');
      option.type = 'button';
      option.setAttribute('role', 'option');
      option.textContent = `${city.name} (${city.uf})`;
      option.addEventListener('click', () => chooseCity(slot, city));
      results.append(option);
    }
    results.hidden = false;
    search.setAttribute('aria-expanded', 'true');
  }
  for (const slot of ['first', 'second']) {
    const search = $(`#qb-${slot}`);
    search.addEventListener('input', () => {
      selected[slot] = null;
      showFeedback('');
      showResults(slot);
      updatePreview();
    });
    search.addEventListener('focus', () => {
      if (!selected[slot]) showResults(slot);
    });
    search.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      const first = $(`#qb-${slot}-results button`);
      if (!first) return;
      event.preventDefault();
      first.click();
    });
  }

  function periodSuffix() {
    if (period.value === 'year') return ` em ${year.value}`;
    if (period.value === 'range') return ` entre ${from.value} e ${to.value}`;
    return '';
  }
  function buildQuestion() {
    const label = metric.value;
    const suffix = periodSuffix();
    if (period.value === 'range' && Number(from.value) > Number(to.value)) {
      return { error: 'O ano inicial precisa ser anterior ou igual ao ano final.' };
    }
    if (action === 'leader' || action === 'ranking') {
      const where = uf.value ? ` em ${stateLabels[uf.value]}` : '';
      return { text: action === 'leader'
        ? `Qual município teve maior ${label}${where}${suffix}?`
        : `Quais são os ${count.value} municípios com maior ${label}${where}${suffix}?` };
    }
    if (!selected.first) return { error: 'Selecione a primeira cidade na lista de resultados.' };
    const first = `${selected.first.name} (${selected.first.uf})`;
    if (action === 'city') return { text: `Qual foi a ${label} em ${first}${suffix}?` };
    if (!selected.second) return { error: 'Selecione a segunda cidade na lista de resultados.' };
    if (selected.first.name === selected.second.name) return { error: 'Escolha dois municípios diferentes.' };
    const second = `${selected.second.name} (${selected.second.uf})`;
    return { text: `Compare a ${label} de ${first} e ${second}${suffix}.` };
  }
  function updatePreview() {
    const result = buildQuestion();
    preview.textContent = result.text || 'A pergunta aparece aqui quando você completar os campos.';
  }
  function syncFields() {
    for (const button of actions) button.setAttribute('aria-pressed', String(button.dataset.action === action));
    $('#qb-count-field').hidden = action !== 'ranking';
    $('#qb-state-field').hidden = action !== 'ranking' && action !== 'leader';
    $('#qb-first-field').hidden = action !== 'compare' && action !== 'city';
    $('#qb-second-field').hidden = action !== 'compare';
    $('#qb-first-label').textContent = action === 'city' ? 'Município' : 'Primeira cidade';
    $('#qb-year-field').hidden = period.value !== 'year';
    $('#qb-from-field').hidden = period.value !== 'range';
    $('#qb-to-field').hidden = period.value !== 'range';
    hideResults('first'); hideResults('second');
    showFeedback('');
    updatePreview();
  }
  for (const button of actions) button.addEventListener('click', () => {
    action = button.dataset.action;
    syncFields();
  });
  for (const select of [metric, count, uf, period, year, from, to]) {
    select.addEventListener('change', syncFields);
  }

  function setOpen(next, restoreFocus = true) {
    if (open === next) return;
    if (next && send.disabled) return;
    open = next;
    backdrop.hidden = !next;
    document.body.classList.toggle('question-builder-open', next);
    form.classList.toggle('question-builder-active', next);
    panel.setAttribute('aria-hidden', String(!next));
    toggle.setAttribute('aria-expanded', String(next));
    toggle.title = next ? 'Fechar o menu de perguntas' : 'Montar pergunta';
    hideResults('first'); hideResults('second');
    if (next) {
      if (document.activeElement === input) input.blur();
      indexCities();
      updatePreview();
      actions.find(button => button.dataset.action === action)?.focus({ preventScroll: true });
    } else if (restoreFocus) toggle.focus({ preventScroll: true });
  }
  toggle.addEventListener('click', () => setOpen(!open));
  backdrop.addEventListener('click', () => setOpen(false));
  $('.qb-close').addEventListener('click', () => setOpen(false));
  panel.addEventListener('click', event => {
    if (!event.target.closest('.qb-city-picker')) {
      hideResults('first'); hideResults('second');
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  });
  form.addEventListener('submit', () => setOpen(false, false), true);
  document.querySelector('#new-chat')?.addEventListener('click', () => setOpen(false, false), true);
  submit.addEventListener('click', () => {
    if (!state.ready) {
      showFeedback('Aguarde a base de dados terminar de carregar.');
      return;
    }
    const result = buildQuestion();
    if (result.error) { showFeedback(result.error); return; }
    if (action === 'compare' && typeof places === 'function') {
      const recognized = places(result.text);
      if (recognized.length !== 2 || !recognized.includes(selected.first.name) ||
          !recognized.includes(selected.second.name)) {
        showFeedback('Não consegui identificar essa dupla de municípios. Escolha outros na lista.');
        return;
      }
    }
    input.value = result.text;
    setOpen(false, false);
    form.requestSubmit();
  });
  syncFields();
})();
