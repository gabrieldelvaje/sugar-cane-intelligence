const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8765/';
const rows = [
  { year: 2000, municipality: 'Piracicaba', uf: 'SP', production: 120, area: 4, productivity: 30, precipitation: 950, temperature: 19.71 },
  { year: 2000, municipality: 'Araraquara', uf: 'SP', production: 95, area: 5, productivity: 19, precipitation: 875, temperature: 20 },
  { year: 2024, municipality: 'Piracicaba', uf: 'SP', production: 140, area: 5, productivity: 28, precipitation: 1090, temperature: 21 },
  { year: 2024, municipality: 'Araraquara', uf: 'SP', production: 105, area: 5, productivity: 21, precipitation: 1040, temperature: 22 },
  { year: 2024, municipality: 'Ribeirão Preto', uf: 'SP', production: 90, area: 4, productivity: 22.5, precipitation: 990, temperature: 21 }
];
async function start(page, locale = 'pt') {
  await page.route('**/Bases/**', route => route.abort());
  await page.route('**/cdn.jsdelivr.net/**', route => route.abort());
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ data, language }) => {
    state.rows = data;
    state.ready = true;
    document.querySelector('#loading-card').classList.remove('is-visible');
    window.SCIi18n.set(language);
  }, { data: rows, language: locale });
}
async function ask(page, question) {
  const count = await page.locator('.chat-response').count();
  await page.locator('#question').fill(question);
  await page.locator('#question-form button[type="submit"]').click();
  await page.waitForFunction(expected => {
    const button = document.querySelector('#question-form button[type="submit"]');
    return !button.disabled && document.querySelectorAll('.chat-response').length > expected;
  }, count, { timeout: 20000 });
  return page.locator('.chat-response').nth(count);
}
async function choose(repair, index, search, value) {
  const box = repair.locator('.sci-repair-combobox').nth(index);
  await box.locator('.sci-repair-combobox-trigger').click();
  assert.equal(await box.locator('.sci-repair-combobox-search').isVisible(), true, 'search is inside the same open dropdown');
  if (search) await box.locator('.sci-repair-combobox-search').fill(search);
  const option = box.locator('.sci-repair-combobox-option').filter({ hasText: value }).first();
  await option.click();
  assert.equal(await box.locator('.sci-repair-combobox-trigger').innerText(), value);
  assert.equal(await box.locator('.sci-repair-combobox-menu').isVisible(), false);
}

test('two misspelled cities use exactly two searchable dropdowns, not four separate fields', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  try {
    await start(page);
    const repair = await ask(page, 'Compare Aroracuara com Pirossacaba em 2024');
    assert.equal(await repair.locator('.sci-repair-combobox').count(), 2);
    assert.equal(await repair.locator('.sci-repair-city-search').count(), 0, 'the redundant standalone search was removed');
    assert.equal(await repair.locator('.sci-repair-combobox-menu:visible').count(), 0);
    assert.equal(await page.locator('.conversation .message.user').count(), 1);
    await choose(repair, 0, 'Arara', 'Araraquara');
    await choose(repair, 1, 'Piraci', 'Piracicaba');
    assert.equal(await page.locator('.conversation .message.user').count(), 1, 'never submit without confirmation');
    await repair.locator('.sci-repair-apply').click();
    await page.waitForFunction(() => document.querySelectorAll('.chat-response').length === 2 &&
      !document.querySelector('#question-form button[type="submit"]').disabled, null, { timeout: 20000 });
    assert.match(await page.locator('.message.user').last().innerText(), /Compare Araraquara com Piracicaba em 2024/);
    assert.equal(await page.locator('.chat-response').last().locator('.data-table tbody tr').count(), 2);
  } finally { await browser.close(); }
});

test('city list includes ranked suggestions, searchable other cities, and ranking choice inside one menu', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
  try {
    await start(page);
    const repair = await ask(page, 'Qual a precipitação?');
    assert.equal(await repair.locator('.sci-repair-combobox').count(), 2);
    assert.equal(await repair.locator('.sci-repair-city-search').count(), 0);
    const place = repair.locator('.sci-repair-combobox').first();
    await place.locator('.sci-repair-combobox-trigger').click();
    assert.ok(await place.locator('.sci-repair-combobox-option').filter({ hasText: /Ranking dos municípios/ }).count());
    assert.ok(await place.locator('.sci-repair-combobox-option').filter({ hasText: 'Piracicaba' }).count());
    await place.locator('.sci-repair-combobox-search').fill('ribei');
    assert.ok(await place.locator('.sci-repair-combobox-option').filter({ hasText: 'Ribeirão Preto' }).count());
    await place.locator('.sci-repair-combobox-option').filter({ hasText: 'Ribeirão Preto' }).click();
    await choose(repair, 1, 'preci', 'precipitação');
    await repair.locator('.sci-repair-apply').click();
    await page.waitForFunction(() => document.querySelectorAll('.chat-response').length === 2 &&
      !document.querySelector('#question-form button[type="submit"]').disabled, null, { timeout: 20000 });
    assert.match(await page.locator('.message.user').last().innerText(), /precipitação em Ribeirão Preto/);
    assert.equal(await page.locator('.chat-response').last().locator('.error').count(), 0);
  } finally { await browser.close(); }
});

test('metric typo and incomplete year each use one searchable menu', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
  try {
    await start(page);
    const typo = await ask(page, 'Qual a preciptacao em Piracicaba em 2024?');
    assert.equal(await typo.locator('.sci-repair-combobox').count(), 1);
    await choose(typo, 0, 'preci', 'precipitação');
    await typo.locator('.sci-repair-apply').click();
    await page.waitForFunction(() => document.querySelectorAll('.chat-response').length === 2 &&
      !document.querySelector('#question-form button[type="submit"]').disabled, null, { timeout: 20000 });
    assert.equal(await page.locator('.chat-response').last().locator('.error').count(), 0);

    const invalidYear = await ask(page, 'Qual a precipitação em Piracicaba em 200?');
    assert.equal(await invalidYear.locator('.sci-repair-combobox').count(), 1);
    await choose(invalidYear, 0, '2000', '2000');
    await invalidYear.locator('.sci-repair-apply').click();
    await page.waitForFunction(() => document.querySelectorAll('.chat-response').length === 4 &&
      !document.querySelector('#question-form button[type="submit"]').disabled, null, { timeout: 20000 });
    assert.match(await page.locator('.message.user').last().innerText(), /em 2000/);
    assert.equal(await page.locator('.chat-response').last().locator('.error').count(), 0);
  } finally { await browser.close(); }
});

test('dropdowns reappear translated after switching locale and off-topic questions stay errors', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  try {
    await start(page, 'en');
    const unrelated = await ask(page, 'What was the result of yesterday’s football game?');
    assert.match(await unrelated.locator('.error').innerText(), /I cannot answer/);
    assert.equal(await unrelated.locator('.sci-repair-combobox').count(), 0);
    const repair = await ask(page, 'Compare Aroracuara and Pirossacaba in 2024');
    assert.equal(await repair.locator('.sci-repair-combobox').count(), 2);
    await page.locator('.sci-language-toggle').click();
    await page.waitForFunction(() => window.SCIi18n.get() === 'pt');
    assert.match(await repair.locator('.error').innerText(), /Vamos corrigir sua pergunta/);
    assert.equal(await repair.locator('.sci-repair-combobox').count(), 2);
    await repair.locator('.sci-repair-combobox-trigger').first().click();
    assert.match(await repair.locator('.sci-repair-combobox-search').first().getAttribute('placeholder'), /Buscar município/);
    await page.locator('.sci-language-toggle').click();
    await page.waitForFunction(() => window.SCIi18n.get() === 'en');
    assert.match(await repair.locator('.error').innerText(), /correct your question/);
    assert.equal(await repair.locator('.sci-repair-combobox').count(), 2);
    assert.equal(await repair.locator('.sci-repair-city-search').count(), 0);
  } finally { await browser.close(); }
});
