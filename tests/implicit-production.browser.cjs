const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const URL = 'http://127.0.0.1:8765/';
const rows = [
  { year: 2011, municipality: 'Piracicaba', uf: 'SP', production: 120, area: 4, productivity: 30, precipitation: 950, temperature: 19.71 },
  { year: 2011, municipality: 'Ribeirão Preto', uf: 'SP', production: 95, area: 5, productivity: 19, precipitation: 875, temperature: 20 },
  { year: 2024, municipality: 'Piracicaba', uf: 'SP', production: 140, area: 5, productivity: 28, precipitation: 1090, temperature: 21 },
  { year: 2024, municipality: 'Ribeirão Preto', uf: 'SP', production: 105, area: 5, productivity: 21, precipitation: 1040, temperature: 22 },
  { year: 2024, municipality: 'Araras', uf: 'SP', production: 90, area: 4, productivity: 22.5, precipitation: 990, temperature: 21 },
  { year: 2024, municipality: 'Limeira', uf: 'SP', production: 85, area: 4, productivity: 21.25, precipitation: 990, temperature: 21 },
  { year: 2024, municipality: 'Campinas', uf: 'SP', production: 75, area: 4, productivity: 18.75, precipitation: 990, temperature: 21 },
  { year: 2024, municipality: 'Americana', uf: 'SP', production: 65, area: 4, productivity: 16.25, precipitation: 990, temperature: 21 }
];

async function start(page, locale) {
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
  const index = await page.locator('.chat-response').count();
  await page.locator('#question').fill(question);
  await page.locator('#question-form button[type="submit"]').click();
  const response = page.locator('.chat-response').nth(index);
  await page.waitForFunction(expected => {
    const send = document.querySelector('#question-form button[type="submit"]');
    return !send.disabled && document.querySelectorAll('.chat-response').length > expected;
  }, index, { timeout: 20000 });
  return response;
}

async function switchLanguage(page, locale) {
  await page.locator('.sci-language-toggle').click();
  await page.locator(`.sci-language-menu [data-language="${locale}"]`).click();
  await page.waitForFunction(expected => window.SCIi18n.get() === expected, locale);
}

for (const locale of ['pt', 'en']) {
  test(`implicit production rankings/comparisons and unrelated-topic warnings (${locale})`, async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
    try {
      await start(page, locale);
      const comparison = await ask(page, locale === 'pt'
        ? 'Compare Ribeirão e Piracicaba em 2024'
        : 'Compare Ribeirao and Piracicaba in 2024');
      assert.equal(await comparison.locator('.error, .sci-scope-actions').count(), 0);
      assert.match(await comparison.innerText(), /Piracicaba/);
      assert.match(await comparison.innerText(), /Ribeirão Preto/);
      assert.match(await comparison.innerText(), locale === 'pt' ? /[Pp]rodução/ : /production/i);
      assert.equal(await comparison.locator('.data-table tbody tr').count(), 2);

      const ranking = await ask(page, locale === 'pt'
        ? 'Quais cinco maiores municípios em 2024?'
        : 'Which five largest municipalities in 2024?');
      assert.equal(await ranking.locator('.error, .sci-scope-actions').count(), 0);
      assert.equal(await ranking.locator('.ranking-bar-row').count(), 5);
      assert.match(await ranking.innerText(), locale === 'pt' ? /[Pp]rodução/ : /production/i);

      const unrelated = await ask(page, locale === 'pt'
        ? 'Compare Ribeirão e Piracicaba por população'
        : 'Compare Ribeirao and Piracicaba by population');
      assert.match(await unrelated.locator('.error').innerText(),
        locale === 'pt' ? /Não consigo responder/ : /I cannot answer/);
      assert.equal(await unrelated.locator('.ranking-bar-chart, .data-table, .kpi').count(), 0);

      const incomplete = await ask(page, locale === 'pt'
        ? 'Qual foi a precipitação?'
        : 'What was the rainfall?');
      assert.match(await incomplete.locator('.error').innerText(),
        locale === 'pt' ? /Não consigo gerar/ : /I cannot produce/);
    } finally {
      await browser.close();
    }
  });
}

test('English implicit queries keep their intent during EN→PT→EN→PT', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  try {
    await start(page, 'en');
    const comparison = await ask(page, 'Compare Ribeirao and Piracicaba in 2024');
    const ranking = await ask(page, 'Which five largest municipalities in 2024?');
    for (const locale of ['pt', 'en', 'pt']) {
      await switchLanguage(page, locale);
      assert.equal(await comparison.locator('.error, .sci-scope-actions').count(), 0);
      assert.equal(await comparison.locator('.data-table tbody tr').count(), 2);
      assert.match(await comparison.innerText(), /Ribeirão Preto/);
      assert.equal(await ranking.locator('.error, .sci-scope-actions').count(), 0);
      assert.equal(await ranking.locator('.ranking-bar-row').count(), 5);
      assert.match(await ranking.innerText(), locale === 'pt' ? /[Pp]rodução/ : /production/i);
    }
  } finally {
    await browser.close();
  }
});
