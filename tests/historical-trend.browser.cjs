const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const URL = 'http://127.0.0.1:8765/';
const rows = [
  { year: 2010, municipality: 'Piracicaba', uf: 'SP', production: 100, area: 10, productivity: 10, precipitation: 900, temperature: 20.0 },
  { year: 2015, municipality: 'Piracicaba', uf: 'SP', production: 120, area: 11, productivity: 11, precipitation: 950, temperature: 20.4 },
  { year: 2020, municipality: 'Piracicaba', uf: 'SP', production: 140, area: 12, productivity: 12, precipitation: 1000, temperature: 20.8 },
  { year: 2024, municipality: 'Piracicaba', uf: 'SP', production: 160, area: 13, productivity: 13, precipitation: 1050, temperature: 21.1 },

  { year: 2010, municipality: 'Ribeirão Preto', uf: 'SP', production: 180, area: 15, productivity: 12, precipitation: 1100, temperature: 22.0 },
  { year: 2015, municipality: 'Ribeirão Preto', uf: 'SP', production: 160, area: 14, productivity: 11, precipitation: 1060, temperature: 22.1 },
  { year: 2020, municipality: 'Ribeirão Preto', uf: 'SP', production: 130, area: 13, productivity: 10, precipitation: 1010, temperature: 22.2 },
  { year: 2024, municipality: 'Ribeirão Preto', uf: 'SP', production: 100, area: 12, productivity: 9, precipitation: 970, temperature: 22.3 }
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
    const send = document.querySelector('#question-form button[type="submit"]');
    return !send.disabled && document.querySelectorAll('.chat-response').length > expected;
  }, count, { timeout: 20000 });
  return page.locator('.chat-response').nth(count);
}

test('historical comparison adds dashed regressions and a trend column for each municipality', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
  try {
    await start(page);
    const response = await ask(page,
      'Compare a produção de Piracicaba e Ribeirão Preto entre 2010 e 2024.');

    assert.equal(await response.locator('.historical-line-chart').count(), 1);
    assert.equal(await response.locator('.historical-trend-line').count(), 2);
    assert.equal(await response.locator('.historical-observed-line').count(), 2);

    const trendLines = response.locator('.historical-trend-line');
    for (let i = 0; i < 2; i++) {
      const dash = await trendLines.nth(i).evaluate(node => getComputedStyle(node).strokeDasharray);
      assert.notEqual(dash, 'none');
    }

    const headers = await response.locator('.data-table thead th').allInnerTexts();
    assert.equal(headers.at(-1), 'Tendência');

    const rowsText = response.locator('.data-table tbody tr');
    assert.equal(await rowsText.count(), 2);
    const trends = {};
    for (let i = 0; i < 2; i++) {
      const row = rowsText.nth(i);
      const city = await row.locator('td').nth(1).innerText();
      trends[city] = await row.locator('.historical-trend-value').innerText();
    }
    assert.match(trends.Piracicaba, /Ascensão/);
    assert.match(trends['Ribeirão Preto'], /Queda/);
  } finally {
    await browser.close();
  }
});

test('single-city historical series adds a trend KPI using the same regression', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
  try {
    await start(page);
    const response = await ask(page,
      'Qual foi a precipitação em Piracicaba entre 2010 e 2024?');

    assert.equal(await response.locator('.historical-trend-line').count(), 1);
    assert.equal(await response.locator('.historical-trend-kpi').count(), 1);
    assert.equal(await response.locator('.historical-trend-kpi > span').innerText(), 'Tendência');
    assert.match(await response.locator('.historical-trend-kpi .historical-trend-value').innerText(), /Ascensão/);
    assert.match(await response.locator('.historical-trend-label').innerText(), /Tendência linear/);
  } finally {
    await browser.close();
  }
});

test('historical trend labels are translated in English answers', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
  try {
    await start(page, 'en');
    const response = await ask(page,
      'Compare production in Piracicaba and Ribeirão Preto from 2010 to 2024.');

    const headers = await response.locator('.data-table thead th').allInnerTexts();
    assert.equal(headers.at(-1), 'Trend');
    assert.equal(await response.locator('.historical-trend-line').count(), 2);
    const trendText = await response.locator('.historical-trend-value').allInnerTexts();
    assert.ok(trendText.some(text => /Rising/.test(text)));
    assert.ok(trendText.some(text => /Declining/.test(text)));
    assert.match(await response.locator('.historical-trend-label').innerText(), /Linear trend/);
  } finally {
    await browser.close();
  }
});
