/* One searchable dropdown per correction: suggestions and search share a menu.
   The existing hidden select remains the source of truth for submitting repairs. */
(() => {
  'use strict';
  const conversation = document.querySelector('#conversation');
  if (!conversation) return;
  const normalize = value => String(value ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const words = {
    pt: { choose: 'Selecione uma opção', searchCity: 'Buscar município…',
      searchMetric: 'Buscar indicador…', searchYear: 'Buscar ano…', empty: 'Nenhuma opção encontrada.' },
    en: { choose: 'Choose an option', searchCity: 'Search municipalities…',
      searchMetric: 'Search indicators…', searchYear: 'Search years…', empty: 'No matching options.' }
  };
  const language = () => window.SCIi18n?.get() === 'en' ? 'en' : 'pt';
  let sourceRows = null;
  let cityNames = [];
  let current = null;
  function allCities() {
    if (typeof state === 'undefined' || !state.rows) return cityNames;
    if (sourceRows !== state.rows) {
      sourceRows = state.rows;
      const unique = new Map();
      for (const row of state.rows) {
        const name = String(row.municipality ?? '').trim();
        if (name && !unique.has(normalize(name))) unique.set(normalize(name), name);
      }
      cityNames = [...unique.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }
    return cityNames;
  }
  function closeMenu() {
    if (!current) return;
    const { trigger, menu, box } = current;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    box.classList.remove('sci-combobox-open', 'sci-combobox-above');
    current = null;
  }
  function convert(select) {
    const field = select.closest('.sci-repair-field');
    if (!field || select.dataset.comboboxReady) return;
    select.dataset.comboboxReady = 'true';
    // Avoid nesting a button inside the old label, which would focus the hidden select.
    const wrapper = document.createElement('div');
    wrapper.className = field.className;
    while (field.firstChild) wrapper.append(field.firstChild);
    field.replaceWith(wrapper);
    wrapper.querySelector('.sci-repair-city-search')?.remove();
    const kind = select.dataset.repairKind;
    const city = kind === 'city' || kind === 'location';
    const initial = [...select.options].filter(option => option.value)
      .map(option => ({ value: option.value, text: option.textContent }));
    const box = document.createElement('div');
    box.className = 'sci-repair-combobox';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'sci-repair-combobox-trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', wrapper.querySelector('span')?.textContent || '');
    const label = document.createElement('span');
    label.className = 'sci-repair-combobox-value';
    const arrow = document.createElement('span');
    arrow.className = 'sci-repair-combobox-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '⌄';
    trigger.append(label, arrow);
    const menu = document.createElement('div');
    menu.className = 'sci-repair-combobox-menu';
    menu.hidden = true;
    menu.id = `sci-repair-combobox-${Math.random().toString(36).slice(2, 10)}`;
    trigger.setAttribute('aria-controls', menu.id);
    const searchWrap = document.createElement('div');
    searchWrap.className = 'sci-repair-combobox-search-wrap';
    const lens = document.createElement('span');
    lens.className = 'sci-repair-combobox-lens';
    lens.setAttribute('aria-hidden', 'true');
    lens.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.8" cy="10.8" r="6.5"></circle><path d="m16 16 4 4"></path></svg>';
    const search = document.createElement('input');
    search.type = 'search';
    search.autocomplete = 'off';
    search.className = 'sci-repair-combobox-search';
    search.setAttribute('aria-label', city ? words[language()].searchCity : kind === 'year' ? words[language()].searchYear : words[language()].searchMetric);
    const results = document.createElement('div');
    results.className = 'sci-repair-combobox-results';
    results.setAttribute('role', 'listbox');
    results.id = `${menu.id}-results`;
    search.setAttribute('aria-controls', results.id);
    searchWrap.append(lens, search);
    menu.append(searchWrap, results);
    box.append(trigger, menu);
    select.hidden = true;
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    select.classList.add('sci-repair-native-select');
    select.after(box);

    function updateLabel() {
      const selected = [...select.options].find(option => option.value === select.value);
      label.textContent = selected?.value ? selected.textContent : words[language()].choose;
      trigger.classList.toggle('has-value', Boolean(select.value));
    }
    function options(term) {
      const query = normalize(term);
      let candidates;
      if (city) {
        const special = initial.filter(option => option.value === '__rank__');
        const suggestions = initial.filter(option => option.value !== '__rank__');
        const matched = allCities().filter(name => normalize(name).includes(query));
        matched.sort((a, b) => {
          const pa = normalize(a).startsWith(query) ? 0 : 1;
          const pb = normalize(b).startsWith(query) ? 0 : 1;
          return pa - pb || a.localeCompare(b, 'pt-BR');
        });
        const matches = query ? matched.slice(0, 12).map(name => ({ value: name, text: name }))
          : [...suggestions, ...matched.map(name => ({ value: name, text: name }))];
        const seen = new Set();
        candidates = matches.filter(option => option.value && !seen.has(normalize(option.value)) && seen.add(normalize(option.value))).slice(0, 12);
        if (!query && special.length) candidates.unshift(...special);
      } else {
        candidates = initial.filter(option => normalize(option.text).includes(query) || normalize(option.value).includes(query));
      }
      return candidates;
    }
    function render() {
      const strings = words[language()];
      search.placeholder = city ? strings.searchCity : kind === 'year' ? strings.searchYear : strings.searchMetric;
      search.setAttribute('aria-label', search.placeholder);
      results.replaceChildren();
      const candidates = options(search.value);
      if (!candidates.length) {
        const empty = document.createElement('p');
        empty.className = 'sci-repair-combobox-empty';
        empty.textContent = strings.empty;
        results.append(empty);
        return;
      }
      for (const item of candidates) {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'sci-repair-combobox-option';
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(item.value === select.value));
        option.dataset.value = item.value;
        option.textContent = item.text;
        option.addEventListener('click', () => {
          if (![...select.options].some(native => native.value === item.value)) select.add(new Option(item.text, item.value));
          select.value = item.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          updateLabel();
          closeMenu();
          trigger.focus({ preventScroll: true });
        });
        results.append(option);
      }
    }
    function openMenu() {
      if (current?.box === box) { closeMenu(); return; }
      closeMenu();
      current = { box, trigger, menu };
      box.classList.add('sci-combobox-open');
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      const below = window.innerHeight - trigger.getBoundingClientRect().bottom;
      if (below < 290 && trigger.getBoundingClientRect().top > below) box.classList.add('sci-combobox-above');
      search.value = '';
      render();
      search.focus({ preventScroll: true });
    }
    trigger.addEventListener('click', openMenu);
    trigger.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); if (!current || current.box !== box) openMenu();
      } else if (event.key === 'Escape') closeMenu();
    });
    search.addEventListener('input', render);
    search.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closeMenu(); trigger.focus({ preventScroll: true }); }
      else if (event.key === 'Enter') {
        const first = results.querySelector('.sci-repair-combobox-option');
        if (first) { event.preventDefault(); first.click(); }
      } else if (event.key === 'ArrowDown') {
        event.preventDefault(); results.querySelector('.sci-repair-combobox-option')?.focus();
      }
    });
    results.addEventListener('keydown', event => {
      const focused = document.activeElement;
      if (event.key === 'Escape') { closeMenu(); trigger.focus({ preventScroll: true }); }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const items = [...results.querySelectorAll('.sci-repair-combobox-option')];
        const index = items.indexOf(focused);
        items[Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
      }
    });
    select.addEventListener('change', updateLabel);
    updateLabel();
  }
  function upgrade() {
    conversation.querySelectorAll('.sci-repair-actions:not([data-sci-combobox-ready])').forEach(group => {
      group.dataset.sciComboboxReady = 'true';
      group.querySelectorAll('.sci-repair-select').forEach(convert);
    });
  }
  const observer = new MutationObserver(upgrade);
  observer.observe(conversation, { childList: true, subtree: true });
  document.addEventListener('pointerdown', event => {
    if (current && !current.box.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && current) closeMenu();
  });
  upgrade();
})();