const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const URL = 'http://127.0.0.1:8765/';
const rows = [
  { year: 2020, municipality: 'Piracicaba', uf: 'SP', production: 1100, area: 6, productivity: 25, precipitation: 980, temperature: 21.37 },
  { year: 2024, municipality: 'Piracicaba', uf: 'SP', production: 1300, area: 7, productivity: 26, precipitation: 1040, temperature: 22.14 }
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
  await page.waitForFunction(expected =>
    document.querySelectorAll('.chat-response').length > expected &&
    !document.querySelector('#question-form button[type="submit"]').disabled,
  count, { timeout: 20000 });
  return page.locator('.chat-response').nth(count);
}

for (const [question, expected] of [
  ['Qual foi a temperature em piracicaba', '°C'],
  ['Qual foi a temperatura em Piracicaba em 2020?', '°C'],
  ['Qual foi o clima em Piracicaba em 2020?', '°C'],
  ['Qual foi a chuva de Piracicaba em 2020?', 'mm'],
  ['Qual foi a precipitação em Piracicaba em 2020?', 'mm'],
  ['Qual foi o clima de Piracicaba em 2020?', '°C'],
  ['Como foi a temperatura em Piracicaba em 2020?', '°C'],
  ['Como foi a chuva de Piracicaba em 2020?', 'mm']
]) {
  test(`supported indicator alias: ${question}`, async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    try {
      await start(page);
      const response = await ask(page, question);
      assert.equal(await response.locator('.error, .sci-repair-actions').count(), 0);
      const result = await response.locator('.answer').innerText();
      assert.match(result, new RegExp(expected === '°C' ? '°C' : 'mm'));
      assert.doesNotMatch(result, /produção em Piracicaba|production in Piracicaba/i);
      assert.match(await page.locator('.message.user').last().innerText(), new RegExp(question.replace(/[?]/g, '\\?'), 'i'));
    } finally {
      await browser.close();
    }
  });
}

test('a genuinely misspelled temperature indicator offers correction instead of a production answer', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await start(page);
    const response = await ask(page, 'Qual foi a tempertura em Piracicaba em 2020?');
    assert.equal(await response.locator('.sci-repair-actions').count(), 1);
    assert.match(await response.locator('.sci-repair-diagnosis').innerText(), /indicador/i);
    const select = response.locator('.sci-repair-combobox').first();
    await select.locator('.sci-repair-combobox-trigger').click();
    assert.ok(await select.locator('.sci-repair-combobox-option').filter({ hasText: 'temperatura média' }).count());
  } finally {
    await browser.close();
  }
});

for (const misspelling of ['temperatyra', 'temperatira']) {
  test(`como foi with ${misspelling} offers a correction then returns temperature`, async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    try {
      await start(page);
      const original = `como foi a ${misspelling} de piracicaba?`;
      const response = await ask(page, original);
      assert.equal(await response.locator('.sci-repair-actions').count(), 1);
      assert.match(await response.locator('.sci-repair-diagnosis').innerText(), new RegExp(misspelling, 'i'));
      const box = response.locator('.sci-repair-combobox').first();
      await box.locator('.sci-repair-combobox-trigger').click();
      await box.locator('.sci-repair-combobox-option').filter({ hasText: 'temperatura média' }).click();
      await response.locator('.sci-repair-apply').click();
      const result = page.locator('.chat-response').last();
      await page.waitForFunction(() =>
        document.querySelectorAll('.chat-response').length >= 2 &&
        !document.querySelector('#question-form button[type="submit"]').disabled,
      null, { timeout: 20000 });
      assert.equal(await result.locator('.error, .sci-repair-actions').count(), 0);
      assert.match(await result.innerText(), /°C/);
      assert.match(await page.locator('.message.user').first().innerText(), new RegExp(original.replace(/[?]/g, '\\?'), 'i'));
    } finally {
      await browser.close();
    }
  });
}

for (const [question, unit] of [
  ['What was the climate in Piracicaba in 2020?', '°C'],
  ['What was the rain in Piracicaba in 2020?', 'mm']
]) {
  test(`English synonym: ${question}`, async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
      await start(page, 'en');
      const response = await ask(page, question);
      assert.equal(await response.locator('.error, .sci-repair-actions').count(), 0);
      assert.match(await response.innerText(), new RegExp(unit));
    } finally {
      await browser.close(); }
  });
}
