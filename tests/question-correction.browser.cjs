const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8765/';
const rows = [
  { year: 2000, municipality: 'Piracicaba', uf: 'SP', production: 120, area: 4, productivity: 30, precipitation: 950, temperature: 19.71 },
  { year: 2000, municipality: 'Araraquara', uf: 'SP', production: 95, area: 5, productivity: 19, precipitation: 875, temperature: 20 },
  { year: 2010, municipality: 'Piracicaba', uf: 'SP', production: 130, area: 5, productivity: 26, precipitation: 1010, temperature: 20.5 },
  { year: 2010, municipality: 'Araraquara', uf: 'SP', production: 100, area: 5, productivity: 20, precipitation: 930, temperature: 20.7 },
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
async function choose(repair, index, query, value) {
  const box = repair.locator('.sci-repair-combobox').nth(index);
  await box.locator('.sci-repair-combobox-trigger').click();
  assert.equal(await box.locator('.sci-repair-combobox-search').isVisible(), true);
  if (query) await box.locator('.sci-repair-combobox-search').fill(query);
  await box.locator('.sci-repair-combobox-option').filter({ hasText: value }).first().click();
  assert.equal(await box.locator('.sci-repair-combobox-value').innerText(), value);
  assert.equal(await box.locator('.sci-repair-combobox-menu').isVisible(), false);
}
async function waitForResponse(page, expected) {
  await page.waitForFunction(number => document.querySelectorAll('.chat-response').length === number &&
    !document.querySelector('#question-form button[type="submit"]').disabled,
  expected, { timeout: 20000 });
}

test('two misspelled cities require only two searchable dropdowns and explicit confirmation', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  try {
    await start(page);
    const repair = await ask(page, 'Compare Aroracuara com Pirossacaba em 2024');
    assert.equal(await repair.locator('.sci-repair-combobox').count(), 2);
    assert.match(await repair.locator('.sci-repair-diagnosis').innerText(), /dois municípios|both names/i);
    assert.equal(await repair.locator('.sci-repair-city-search').count(), 0);
    assert.equal(await repair.locator('.sci-repair-combobox-menu:visible').count(), 0);
    await choose(repair, 0, 'Arara', 'Araraquara');
    await choose(repair, 1, 'Piraci', 'Piracicaba');
    assert.equal(await page.locator('.conversation .message.user').count(), 1);
    await repair.locator('.sci-repair-apply').click();
    await waitForResponse(page, 2);
    assert.match(await page.locator('.message.user').last().innerText(), /Compare Araraquara com Piracicaba em 2024/);
    assert.equal(await page.locator('.chat-response').last().locator('.data-table tbody tr').count(), 2);
  } finally { await browser.close(); }
});


test('repair message points to the specific second municipality when only it is misspelled', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
  try {
    await start(page);
    const repair = await ask(page, 'Compare Araraquara com Pirossacaba em 2024');
    const diagnostic = await repair.locator('.sci-repair-diagnosis').innerText();
    assert.match(diagnostic, /segundo município/i);
    assert.match(diagnostic, /Pirossacaba/);
    assert.match(diagnostic, /erro de digitação/i);
    assert.equal(await repair.locator('.sci-repair-diagnosis strong').count(), 2);
    assert.equal(await repair.locator('.sci-repair-combobox').count(), 1);
    const cityBox = repair.locator('.sci-repair-combobox').first();
    await cityBox.locator('.sci-repair-combobox-trigger').click();
    const recommended = cityBox.locator('.sci-repair-combobox-option.is-recommended');
    assert.ok(await recommended.count() >= 1);
    assert.match(await recommended.first().innerText(), /Piracicaba/i);
  } finally { await browser.close(); }
});

test('one city dropdown offers similar places, full searchable index and the ranking choice', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
  try {
    await start(page);
    const repair = await ask(page, 'Qual a precipitação?');
    assert.equal(await repair.locator('.sci-repair-combobox').count(), 2);
    assert.equal(await repair.locator('.sci-repair-city-search').count(), 0);
    const box = repair.locator('.sci-repair-combobox').first();
    await box.locator('.sci-repair-combobox-trigger').click();
    const alignment = await box.evaluate(node => {
      const trigger = node.querySelector('.sci-repair-combobox-trigger').getBoundingClientRect();
      const arrow = node.querySelector('.sci-repair-combobox-arrow').getBoundingClientRect();
      const style = getComputedStyle(node.querySelector('.sci-repair-combobox-arrow'));
      return {
        delta: Math.abs((trigger.top + trigger.height / 2) - (arrow.top + arrow.height / 2)),
        transform: style.transform
      };
    });
    assert.ok(alignment.delta < 1.5, `chevron must be vertically centered; delta=${alignment.delta}`);
    assert.notEqual(alignment.transform, 'none', 'open chevron must rotate around its center');
    assert.ok(await box.locator('.sci-repair-combobox-option').filter({ hasText: /Ranking dos municípios/ }).count());
    assert.ok(await box.locator('.sci-repair-combobox-option').filter({ hasText: 'Piracicaba' }).count());
    await box.locator('.sci-repair-combobox-search').fill('ribei');
    await box.locator('.sci-repair-combobox-option').filter({ hasText: 'Ribeirão Preto' }).click();
    await choose(repair, 1, 'preci', 'precipitação');
    await repair.locator('.sci-repair-apply').click();
    await waitForResponse(page, 2);
    assert.match(await page.locator('.message.user').last().innerText(), /precipitação em Ribeirão Preto/);
    assert.equal(await page.locator('.chat-response').last().locator('.error').count(), 0);
  } finally { await browser.close(); }
});

test('metric typo and incomplete year each use a single searchable menu', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
  try {
    await start(page);
    const typo = await ask(page, 'Qual a preciptacao em Piracicaba em 2024?');
    assert.equal(await typo.locator('.sci-repair-combobox').count(), 1);
    await choose(typo, 0, 'preci', 'precipitação');
    await typo.locator('.sci-repair-apply').click();
    await waitForResponse(page, 2);
    assert.equal(await page.locator('.chat-response').last().locator('.error').count(), 0);
    const invalidYear = await ask(page, 'Qual a precipitação em Piracicaba em 200?');
    assert.equal(await invalidYear.locator('.sci-repair-combobox').count(), 1);
    await choose(invalidYear, 0, '2000', '2000');
    await invalidYear.locator('.sci-repair-apply').click();
    await waitForResponse(page, 4);
    assert.match(await page.locator('.message.user').last().innerText(), /em 2000/);
    assert.equal(await page.locator('.chat-response').last().locator('.error').count(), 0);
  } finally { await browser.close(); }
});


test('four-digit years outside coverage explain 1974–2024 and still offer a year selector plus help', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
  try {
    await start(page);
    for (const year of ['1970', '2026']) {
      const repair = await ask(page, `Qual a precipitação em Piracicaba em ${year}?`);
      const diagnostic = await repair.locator('.sci-repair-diagnosis').innerText();
      assert.match(diagnostic, /1974 a 2024/);
      assert.match(diagnostic, new RegExp(year));
      assert.equal(await repair.locator('.sci-repair-combobox').count(), 1);
      assert.equal(await repair.locator('.sci-year-range-help .sci-scope-example').count(), 2);
      assert.equal(await repair.locator('.sci-year-range-help .sci-scope-builder').count(), 1);
    }
  } finally { await browser.close(); }
});


test('year typo highlights the field, bad value and closest year without pill-shaped options', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
  try {
    await start(page);
    const repair = await ask(page, 'Qual a precipitação em Piracicaba em 201?');
    const bold = repair.locator('.sci-repair-diagnosis strong');
    assert.equal(await bold.count(), 2);
    assert.equal((await bold.nth(0).innerText()).toLowerCase(), 'ano');
    assert.equal(await bold.nth(1).innerText(), '201');
    const box = repair.locator('.sci-repair-combobox').first();
    await box.locator('.sci-repair-combobox-trigger').click();
    const first = box.locator('.sci-repair-combobox-option').first();
    assert.equal(await first.innerText(), '2010');
    assert.equal(await first.getAttribute('data-recommended'), 'true');
    const style = await first.evaluate(node => ({
      radius: getComputedStyle(node).borderRadius,
      background: getComputedStyle(node).backgroundColor
    }));
    assert.ok(style.radius === '0px' || style.radius === '0');
    assert.notEqual(style.background, 'rgba(0, 0, 0, 0)');
  } finally { await browser.close(); }
});

test('malformed year numbers are treated as typos while 1980 remains a valid in-range year', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
  try {
    await start(page);
    for (const malformed of ['200', '20000', '20 mil']) {
      const repair = await ask(page, `Qual a precipitação em Piracicaba em ${malformed}?`);
      assert.match(await repair.locator('.sci-repair-diagnosis').innerText(), /digitado incorretamente/i);
      assert.equal(await repair.locator('.sci-repair-combobox').count(), 1);
      assert.equal(await repair.locator('.sci-year-range-help').count(), 0);
    }
    const valid = await ask(page, 'Qual a precipitação em Piracicaba em 1980?');
    assert.equal(await valid.locator('.sci-repair-actions').count(), 0);
    assert.doesNotMatch(await valid.innerText(), /1974 a 2024|digitado incorretamente/i);
  } finally { await browser.close(); }
});

test('locale switch restores translated dropdowns while out-of-scope messages remain errors', async () => {
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
