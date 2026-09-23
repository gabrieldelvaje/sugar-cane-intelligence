const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const URL = 'http://127.0.0.1:8765/';
const sampleRows = [
  { year: 2011, municipality: 'Piracicaba', uf: 'SP', production: 120, area: 4, productivity: 30, precipitation: 950, temperature: 19.71 },
  { year: 2011, municipality: 'Ribeirão Preto', uf: 'SP', production: 95, area: 5, productivity: 19, precipitation: 875, temperature: 20 },
  { year: 2024, municipality: 'Piracicaba', uf: 'SP', production: 140, area: 5, productivity: 28, precipitation: 1090, temperature: 21 },
  { year: 2024, municipality: 'Ribeirão Preto', uf: 'SP', production: 105, area: 5, productivity: 21, precipitation: 1040, temperature: 22 }
];

async function start(page, language = 'pt') {
  // Use a small, deterministic slice of the actual row schema to avoid a huge
  // network download and verify the real DOM, send handler and answer wrapper.
  await page.route('**/Bases/**', route => route.abort());
  await page.route('**/cdn.jsdelivr.net/**', route => route.abort());
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ rows, locale }) => {
    state.rows = rows;
    state.ready = true;
    document.querySelector('#loading-card').classList.remove('is-visible');
    window.SCIi18n.set(locale);
  }, { rows: sampleRows, locale: language });
}

async function ask(page, question) {
  await page.locator('#question').fill(question);
  await page.locator('#question-form button[type="submit"]').click();
  // The existing chat animates the user, typing dots and streamed response.
  await page.waitForFunction(() => {
    const send = document.querySelector('#question-form button[type="submit"]');
    return !send.disabled && !!document.querySelector('.chat-response:last-child');
  }, { timeout: 15000 });
  return page.locator('.chat-response').last();
}

async function switchLanguage(page, locale) {
  await page.locator('.sci-language-toggle').click();
  await page.locator(`.sci-language-menu [data-language="${locale}"]`).click();
  await page.waitForFunction(expected => window.SCIi18n.get() === expected, locale);
}

for (const locale of ['pt', 'en']) {
  test(`off-topic messages do not generate municipal results (${locale})`, async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    try {
      await start(page, locale);
      const greeting = await ask(page, locale === 'pt' ? 'Oi, tudo bem?' : 'Hi, how are you?');
      assert.match(await greeting.locator('.error').innerText(),
        locale === 'pt' ? /Não consigo responder/ : /I cannot answer/);
      assert.equal(await greeting.locator('.kpi, .data-table, .ranking-bar-chart').count(), 0);
      assert.equal(await greeting.locator('.sci-scope-example').count(), 2);
      assert.equal(await greeting.locator('.sci-scope-builder').count(), 1);
      assert.equal(await greeting.locator('.follow-up-suggestions').count(), 0);

      const game = await ask(page, locale === 'pt'
        ? 'Qual foi o resultado do jogo de ontem?'
        : 'What was the result of yesterday’s game?');
      assert.match(await game.locator('.error').innerText(),
        locale === 'pt' ? /Não consigo responder/ : /I cannot answer/);
      assert.equal(await game.locator('.kpi, .data-table, .ranking-bar-chart').count(), 0);

      const incomplete = await ask(page, locale === 'pt' ? 'Qual foi a precipitação?' : 'What was the rainfall?');
      assert.match(await incomplete.locator('.error').innerText(),
        locale === 'pt' ? /Não consigo gerar/ : /I cannot produce/);
      await incomplete.locator('.sci-scope-builder').click();
      await page.waitForFunction(() => document.body.classList.contains('question-builder-open'));
      await page.locator('#question-builder-panel .qb-close').click();
      await page.waitForFunction(() => !document.body.classList.contains('question-builder-open'));
    } finally {
      await browser.close();
    }
  });

  test(`legitimate municipal questions still get answers (${locale})`, async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
    try {
      await start(page, locale);
      const valid = await ask(page, locale === 'pt'
        ? 'Qual foi a temperatura média em Piracicaba em 2011?'
        : 'What was the average temperature in Piracicaba in 2011?');
      assert.equal(await valid.locator('.sci-scope-actions').count(), 0);
      assert.equal(await valid.locator('.error').count(), 0);
      assert.match(await valid.innerText(), locale === 'pt' ? /19,71/ : /19\.71/);
      assert.ok(await valid.locator('.kpi').count() > 0);
    } finally {
      await browser.close();
    }
  });
}

for (const viewport of [
  { label: 'mobile', width: 390, height: 844, isMobile: true },
  { label: 'desktop', width: 1366, height: 800, isMobile: false }
]) {
  test(`English scope warnings remain warnings after EN→PT→EN on ${viewport.label}`, async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.isMobile
    });
    try {
      await start(page, 'en');
      const greeting = await ask(page, 'Hi, how are you?');
      const game = await ask(page, 'What was the result of yesterday’s game?');
      const incomplete = await ask(page, 'What was the rainfall?');
      const warnings = [greeting, game, incomplete];
      for (const locale of ['pt', 'en', 'pt']) {
        await switchLanguage(page, locale);
        for (const [index, warning] of warnings.entries()) {
          const message = await warning.locator('.error').innerText();
          const expected = locale === 'pt'
            ? (index === 2 ? /Não consigo gerar uma análise confiável/ : /Não consigo responder a essa pergunta/)
            : (index === 2 ? /I cannot produce a reliable analysis/ : /I cannot answer that question/);
          assert.match(message, expected);
          assert.equal(await warning.locator('.sci-scope-actions').count(), 1);
          assert.equal(await warning.locator('.kpi, .data-table, .ranking-bar-chart').count(), 0);
          assert.equal(await warning.locator('.sci-scope-example').count(), 2);
          assert.equal(await warning.locator('.sci-scope-builder').count(), 1);
          assert.equal(await warning.locator('.follow-up-suggestions').count(), 0);
          assert.doesNotMatch(message, /leading municipality|município com maior produção/i);
        }
        assert.match(await greeting.locator('.sci-scope-builder').innerText(),
          locale === 'pt' ? /Montar minha pergunta/ : /Build my question/);
      }
      await greeting.locator('.sci-scope-builder').click();
      await page.waitForFunction(() => document.body.classList.contains('question-builder-open'));
    } finally {
      await browser.close();
    }
  });
}
