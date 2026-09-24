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
    // Capture the instant each section truly becomes visible. The original
    // controller clears all hidden classes in one batch; the staged controller
    // intercepts that batch and restores them before browser paint.
    window.__stageEvents = [];
    new MutationObserver(records => {
      for (const record of records) {
        const node = record.target;
        if (!record.oldValue?.split(/\s+/).includes('chat-deferred') ||
            node.classList.contains('chat-deferred')) continue;
        const type = node.matches('.kpis') ? 'cards'
          : node.matches('.table-wrap') ? 'table'
          : node.matches('.chart') ? 'chart'
          : node.matches('.follow-up-suggestions') ? 'suggestions' : null;
        if (type) window.__stageEvents.push({ type, time: performance.now() });
      }
    }).observe(document.querySelector('#conversation'), {
      subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true
    });
  }, rows);
}

async function checkOrder(page, question, expected) {
  await page.locator('#question').fill(question);
  await page.locator('#question-form button[type="submit"]').click();
  await page.waitForFunction(length => window.__stageEvents.length >= length,
    expected.length, { timeout: 20000 });
  const events = await page.evaluate(() => window.__stageEvents);
  const types = events.map(event => event.type);
  assert.deepEqual(types, expected, `Unexpected reveal order: ${types.join(' → ')}`);
  for (let i = 1; i < events.length; i++) {
    const gap = events[i].time - events[i - 1].time;
    assert.ok(gap >= 180,
      `${events[i].type} appeared only ${Math.round(gap)}ms after ${events[i - 1].type}`);
  }
  const response = page.locator('.chat-response').last();
  assert.equal(await response.locator('.chat-deferred').count(), 0);
  assert.equal(await response.locator('.follow-up-suggestions').isVisible(), true);
}

test('comparison reveals KPI group, table, line chart and follow-ups one at a time', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
  try {
    await start(page);
    await checkOrder(page, 'Compare a produção de Piracicaba e Ribeirão Preto entre 2010 e 2024.',
      ['cards', 'table', 'chart', 'suggestions']);
  } finally { await browser.close(); }
});

test('single-city series reveals cards, chart and suggestions in that order', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  try {
    await start(page);
    await checkOrder(page, 'Qual foi a precipitação em Piracicaba entre 2010 e 2024?',
      ['cards', 'chart', 'suggestions']);
  } finally { await browser.close(); }
});

test('a chart-only ranking reveals its bar chart before follow-up suggestions', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
  try {
    await start(page);
    await checkOrder(page, 'Quais são os 2 municípios com maior produção em 2024?',
      ['chart', 'suggestions']);
  } finally { await browser.close(); }
});
