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
async function start(page, language = 'pt') {
  await page.route('**/Bases/**', route => route.abort());
  await page.route('**/cdn.jsdelivr.net/**', route => route.abort());
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ data, locale }) => {
    state.rows = data;
    state.ready = true;
    document.querySelector('#loading-card').classList.remove('is-visible');
    window.SCIi18n.set(locale);
  }, { data: rows, locale: language });
}
async function ask(page, question) {
  const count = await page.locator('.chat-response').count();
  await page.locator('#question').fill(question);
  await page.locator('#question-form button[type="submit"]').click();
  await page.waitForFunction(expected => {
    const send = document.querySelector('#question-form button[type="submit"]');
    return !send.disabled && document.querySelectorAll('.chat-response').length > expected;
  }, count, { timeout: 20000 });
  return page.locator('.chat-response').nth(count);
}

test('correct city spellings in the same comparison, only after reader confirms', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  try {
    await start(page);
    const warning = await ask(page, 'Compare Aroracuara com Pirossacaba em 2024');
    assert.equal(await warning.locator('.sci-repair-actions').count(), 1);
    assert.equal(await warning.locator('.data-table, .ranking-bar-chart').count(), 0);
    assert.equal(await page.locator('.conversation .message.user').count(), 1, 'no guess is submitted automatically');
    const selects = warning.locator('.sci-repair-select');
    assert.equal(await selects.count(), 2);
    assert.ok(await selects.nth(0).locator('option[value="Araraquara"]').count());
    assert.ok(await selects.nth(1).locator('option[value="Piracicaba"]').count());
    await selects.nth(0).selectOption('Araraquara');
    await selects.nth(1).selectOption('Piracicaba');
    await warning.locator('.sci-repair-apply').click();
    await page.waitForFunction(() => document.querySelectorAll('.chat-response').length === 2 &&
      !document.querySelector('#question-form button[type="submit"]').disabled, null, { timeout: 20000 });
    assert.match(await page.locator('.message.user').last().innerText(), /Compare Araraquara com Piracicaba em 2024/);
    const result = page.locator('.chat-response').last();
    assert.equal(await result.locator('.sci-repair-actions, .sci-scope-actions, .error').count(), 0);
    assert.equal(await result.locator('.data-table tbody tr').count(), 2);
  } finally { await browser.close(); }
});

test('missing location, indicator typo and an incomplete year have separate dropdowns', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
  try {
    await start(page);
    const missingCity = await ask(page, 'Qual a precipitação?');
    assert.equal(await missingCity.locator('.sci-repair-actions').count(), 1);
    assert.equal(await missingCity.locator('.sci-repair-select').count(), 2);
    await missingCity.locator('.sci-repair-city-search').fill('Piraci');
    const location = missingCity.locator('.sci-repair-select[data-repair-kind="location"]');
    assert.ok(await location.locator('option[value="Piracicaba"]').count());
    await location.selectOption('Piracicaba');
    await missingCity.locator('.sci-repair-apply').click();
    await page.waitForFunction(() => document.querySelectorAll('.chat-response').length === 2 &&
      !document.querySelector('#question-form button[type="submit"]').disabled, null, { timeout: 20000 });
    assert.equal(await page.locator('.chat-response').last().locator('.error, .sci-repair-actions').count(), 0);
    assert.match(await page.locator('.message.user').last().innerText(), /precipitação em Piracicaba/);

    const typo = await ask(page, 'Qual a preciptacao em Piracicaba em 2024?');
    const metric = typo.locator('.sci-repair-select[data-repair-kind="metric"]');
    assert.equal(await metric.count(), 1);
    await metric.selectOption('precipitation');
    await typo.locator('.sci-repair-apply').click();
    await page.waitForFunction(() => document.querySelectorAll('.chat-response').length === 4 &&
      !document.querySelector('#question-form button[type="submit"]').disabled, null, { timeout: 20000 });
    assert.equal(await page.locator('.chat-response').last().locator('.error, .sci-repair-actions').count(), 0);

    const invalidYear = await ask(page, 'Qual a precipitação em Piracicaba em 200?');
    const year = invalidYear.locator('.sci-repair-select[data-repair-kind="year"]');
    assert.equal(await year.count(), 1);
    assert.ok(await year.locator('option[value="2000"]').count());
    await year.selectOption('2000');
    await invalidYear.locator('.sci-repair-apply').click();
    await page.waitForFunction(() => document.querySelectorAll('.chat-response').length === 6 &&
      !document.querySelector('#question-form button[type="submit"]').disabled, null, { timeout: 20000 });
    assert.match(await page.locator('.message.user').last().innerText(), /em 2000/);
    assert.equal(await page.locator('.chat-response').last().locator('.error, .sci-repair-actions').count(), 0);
  } finally { await browser.close(); }
});

test('real off-topic warnings and valid implicit production stay unchanged in either language', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  try {
    await start(page, 'en');
    const unrelated = await ask(page, 'What was the result of yesterday’s football game?');
    assert.match(await unrelated.locator('.error').innerText(), /I cannot answer/);
    assert.equal(await unrelated.locator('.sci-repair-actions').count(), 0);
    const valid = await ask(page, 'Compare Araraquara and Piracicaba in 2024');
    assert.equal(await valid.locator('.sci-repair-actions, .error').count(), 0);
    assert.equal(await valid.locator('.data-table tbody tr').count(), 2);
    const typo = await ask(page, 'Compare Aroracuara and Pirossacaba in 2024');
    assert.equal(await typo.locator('.sci-repair-actions').count(), 1);
    await page.locator('.sci-language-toggle').click();
    await page.waitForFunction(() => window.SCIi18n.get() === 'pt');
    assert.match(await typo.locator('.error').innerText(), /Vamos corrigir sua pergunta/);
    assert.equal(await typo.locator('.sci-repair-select').count(), 2);
    await page.locator('.sci-language-toggle').click();
    await page.waitForFunction(() => window.SCIi18n.get() === 'en');
    assert.match(await typo.locator('.error').innerText(), /correct your question/);
    assert.equal(await typo.locator('.sci-repair-select').count(), 2);
  } finally { await browser.close(); }
});
