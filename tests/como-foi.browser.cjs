const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const URL = 'http://127.0.0.1:8765/';
const cities = ['Piracicaba', 'Araraquara', 'Campinas', 'Limeira', 'Americana',
  'Sorocaba', 'Indaiatuba', 'Paulínia', 'Jundiaí', 'Bauru', 'Rio Claro', 'Botucatu'];
const rows = cities.flatMap((municipality, i) => [2010, 2020, 2024].map(year => ({
  municipality, uf: 'SP', year, production: 100 + i, area: 20 + i,
  productivity: 5 + i, precipitation: 900 + i, temperature: 20 + i / 10
})));

async function start(page) {
  await page.route('**/Bases/**', route => route.abort());
  await page.route('**/cdn.jsdelivr.net/**', route => route.abort());
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(data => {
    state.rows = data;
    state.ready = true;
    document.querySelector('#loading-card').classList.remove('is-visible');
    window.SCIi18n.set('pt');
  }, rows);
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

test('Como foi is a supported opening for a valid temperature question', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await start(page);
    const response = await ask(page, 'Como foi a temperatura em Piracicaba em 2020?');
    assert.equal(await response.locator('.error, .sci-repair-actions').count(), 0);
    assert.match(await response.locator('.answer').innerText(), /°C/);
  } finally { await browser.close(); }
});

test('Como foi keeps a mistyped indicator in the correction flow', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await start(page);
    const response = await ask(page, 'Como foi a temperatyra em Piracicaba em 2020?');
    assert.equal(await response.locator('.sci-repair-actions').count(), 1);
    assert.match(await response.locator('.sci-repair-diagnosis').innerText(), /temperatyra/i);
  } finally { await browser.close(); }
});

test('Como foi suggestions translate to What was without losing the Portuguese original', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await start(page);
    const translated = await page.evaluate(() => {
      const original = 'Como foi a temperatura em Piracicaba em 2020?';
      return {
        english: window.SCIi18n.toEnglishQuestion(original),
        portuguese: window.SCIi18n.toPortugueseQuestion(original)
      };
    });
    assert.equal(translated.english, 'What was the temperatura in Piracicaba in 2020?'.replace('temperatura', 'temperature'));
    assert.equal(translated.portuguese, 'Como foi a temperatura em Piracicaba em 2020?');
  } finally { await browser.close(); }
});
