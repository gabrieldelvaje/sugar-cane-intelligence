const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const URL = 'http://127.0.0.1:8765/';

async function geometry(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('#question-builder-panel');
    const stage = document.querySelector('.qb-slide-viewport');
    const form = document.querySelector('#question-form');
    if (!panel || !stage || !form) throw new Error('Builder stage is missing');
    const p = panel.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    const f = form.getBoundingClientRect();
    return {
      stageBottom: s.bottom, formTop: f.top,
      panelTop: p.top, panelBottom: p.bottom, panelWidth: p.width,
      panelHeight: p.height, open: document.body.classList.contains('question-builder-open'),
      animation: getComputedStyle(panel).animationName,
      stageOverflow: getComputedStyle(stage).overflow,
      stagePosition: getComputedStyle(stage).position,
      panelPosition: getComputedStyle(panel).position,
      panelVisibility: getComputedStyle(panel).visibility
    };
  });
}

for (const viewport of [
  { label: 'desktop', width: 1366, height: 800, isMobile: false },
  { label: 'mobile', width: 390, height: 844, isMobile: true }
]) {
  test(`builder emerges from behind the composer on ${viewport.label}`, async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile,
      hasTouch: viewport.isMobile,
      reducedMotion: 'no-preference'
    });
    const page = await context.newPage();
    try {
      // Builder geometry does not depend on fetching the large CSV or a CDN.
      await page.route('**/Bases/**', route => route.abort());
      await page.route('**/cdn.jsdelivr.net/**', route => route.abort());
      await page.goto(URL, { waitUntil: 'domcontentloaded' });
      const toggle = page.locator('#question-builder-toggle');
      await toggle.waitFor();
      await page.evaluate(() => { document.querySelector('#question-form button[type="submit"]').disabled = false; });
      const idle = await geometry(page);
      assert.equal(idle.stageOverflow, 'hidden');
      assert.equal(idle.stagePosition, 'fixed');
      assert.equal(idle.panelPosition, 'absolute');
      assert.ok(Math.abs(idle.stageBottom - idle.formTop) <= 2,
        `stage should end at the composer: ${JSON.stringify(idle)}`);
      assert.ok(idle.panelTop >= idle.stageBottom - 2, 'closed panel must be completely clipped');

      await toggle.click();
      const opening = await geometry(page);
      assert.equal(opening.open, true);
      assert.equal(opening.animation, 'qb-panel-open-two-stage');
      assert.ok(opening.panelTop > -opening.panelHeight, 'opening panel has a real position');
      await page.waitForTimeout(680);
      const fullyOpen = await geometry(page);
      assert.ok(fullyOpen.panelTop < fullyOpen.stageBottom - 40, 'panel rose into view');
      assert.ok(Math.abs(fullyOpen.panelBottom - (fullyOpen.formTop - 8)) <= 3,
        `panel must finish 8px above composer: ${JSON.stringify(fullyOpen)}`);
      assert.equal(fullyOpen.panelVisibility, 'visible');

      await toggle.click();
      const closing = await geometry(page);
      assert.equal(closing.animation, 'qb-panel-close-two-stage');
      await page.waitForTimeout(110);
      const midClose = await geometry(page);
      assert.ok(midClose.panelBottom > fullyOpen.panelBottom + 10,
        `panel must descend rather than disappear: ${JSON.stringify(midClose)}`);
      await page.waitForTimeout(550);
      const closed = await geometry(page);
      assert.equal(closed.open, false);
      assert.equal(closed.panelVisibility, 'hidden');
      assert.ok(closed.panelTop >= closed.stageBottom - 2,
        `panel must be hidden behind composer again: ${JSON.stringify(closed)}`);
    } finally {
      await context.close();
      await browser.close();
    }
  });
}
