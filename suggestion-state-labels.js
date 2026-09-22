/* Show the municipality's UF on opening, follow-up and comparison-retry pills.
   Suggestions still run through the existing animated form submission. */
(() => {
  'use strict';
  const initial = document.querySelector('#suggestions');
  const conversation = document.querySelector('#conversation');
  const form = document.querySelector('#question-form');
  const input = document.querySelector('#question');
  if (!initial || !conversation || !form || !input || typeof state === 'undefined') return;

  const normalized = value => String(value).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const cityStates = new Map();
  let indexedRows = null;

  function ready() {
    if (!state.ready || !state.rows?.length || typeof places !== 'function') return false;
    if (indexedRows !== state.rows) {
      indexedRows = state.rows;
      cityStates.clear();
      for (const row of state.rows) {
        const name = normalized(row.municipality);
        const uf = String(row.uf || '').trim().toUpperCase();
        if (!name || !/^[A-Z]{2}$/.test(uf)) continue;
        if (!cityStates.has(name)) cityStates.set(name, new Set());
        cityStates.get(name).add(uf);
      }
    }
    return true;
  }

  function withState(text, municipality, uf) {
    let from = 0;
    while (from < text.length) {
      const at = text.indexOf(municipality, from);
      if (at < 0) break;
      const end = at + municipality.length;
      const before = text[at - 1] || '';
      const after = text[end] || '';
      if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after) &&
          !/^\s*\([A-Z]{2}\)/.test(text.slice(end))) {
        text = text.slice(0, end) + ` (${uf})` + text.slice(end);
        from = end + uf.length + 3;
      } else {
        from = end;
      }
    }
    return text;
  }

  function label(button) {
    const original = button.textContent || '';
    let updated = original;
    for (const name of places(original)) {
      const options = cityStates.get(normalized(name));
      // Do not invent a UF if the same municipality name occurs in different states.
      if (options?.size === 1) updated = withState(updated, name, [...options][0]);
    }
    if (updated === original) return;
    button.textContent = updated;
    if (button.matches('.positive-comparison-suggestion')) {
      button.dataset.question = updated;
    }
  }

  function refresh() {
    if (!ready()) return;
    initial.querySelectorAll('button').forEach(label);
    conversation.querySelectorAll('.follow-up-suggestions button').forEach(label);
  }

  // The random-question script replaces button text after the database loads;
  // observe that change so even freshly generated questions receive the UF.
  const observer = new MutationObserver(refresh);
  observer.observe(initial, { childList: true, subtree: true, characterData: true });
  observer.observe(conversation, { childList: true, subtree: true, characterData: true });
  refresh();

  // The older follow-up handler retains its original question in a closure.
  // Submit the text currently shown on the pill so the sent message includes UF.
  conversation.addEventListener('click', event => {
    const button = event.target.closest('.follow-up-suggestions button');
    if (!button || !conversation.contains(button) || button.disabled ||
        form.querySelector('button[type="submit"]')?.disabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = button.textContent.trim();
    form.requestSubmit();
  }, true);
})();
