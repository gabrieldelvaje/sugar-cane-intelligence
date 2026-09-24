const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const URL = 'http://127.0.0.1:8765/';
const rows = [2010, 2015, 2020, 2024].flatMap((year, index) => [
  { year, municipality: 'Piracicaba', uf: 'SP', production: 100 + index * 10, area: 10, productivity: 10, precipitation: 900 + index * 30, temperature: 20 + index * .2 },
  { year, municipality: 'Ribeirão Preto', uf: 'SP', production: 150 - index * 10, area: 12, productivity: 12, precipitation: 1000 - index * 30, temperature: 22 - index * .2 }
]);

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
  await page.locator('#question').fill(question);
  await page.locator('#question-form button[type="submit"]').click();
  await page.locator('.chat-response').last().waitFor({ state: 'attached' });
  return page.locator('.chat-response').last();
}

async function checkOrder(page, question, sections) {
  const response = await ask(page, question);
  for (let i = 0; i < sections.length; i++) {
    await response.locator(sections[i]).first().waitFor({ state: 'visible', timeout: 20000 });
    for (let later = i + 1; later < sections.length; later++) {
      const next = response.locator(sections[later]).first();
      if (await next.count()) {
        assert.equal(await next.isVisible(), false,
          `${sections[later]} appeared before ${sections[i]} finished`);
      }
    }
  }
  await page.waitForFunction(() => {
    const group = document.querySelector('.chat-response:last-of-type .follow-up-suggestions');
    return !!group && getComputedStyle(group).display !== 'none' && getComputedStyle(group).visibility === 'visible';
  }, null, { timeout: 20000 });
  assert.equal(await response.locator('.chat-deferred').count(), 0);
}

test('comparison reveals KPI group, table, line chart and follow-ups one at a time', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
  try {
    await start(page);
    await checkOrder(page, 'Compare a produção de Piracicaba e Ribeirão Preto entre 2010 e 2024.',
      ['.kpis', '.table-wrap', '.historical-line-chart', '.follow-up-suggestions']);
  } finally { await browser.close(); }
});

test('single-city series reveals cards, chart and suggestions in that order', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  try {
    await start(page);
    await checkOrder(page, 'Qual foi a precipitação em Piracicaba entre 2010 e 2024?',
      ['.kpis', '.historical-line-chart', '.follow-up-suggestions']);
  } finally { await browser.close(); }
});

test('rankings reveal KPI group, table and chart before follow-ups', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
  try {
    await start(page);
    await checkOrder(page, 'Quais são os 2 municípios com maior produção em 2024?',
      ['.kpis', '.table-wrap', '.follow-up-suggestions']);
  } finally { await browser.close(); }
});
