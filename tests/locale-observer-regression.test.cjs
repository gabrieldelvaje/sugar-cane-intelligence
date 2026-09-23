const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const source = file => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test('English follow-ups settle with their state abbreviation instead of locking the chat', async t => {
  const dom = new JSDOM(`<!doctype html><html lang="pt-BR"><body>
    <header class="topbar"><div class="brand-copy"><strong>Sugar Cane Intelligence</strong><span>Desenvolvido por Gabriel Delvaje</span></div>
      <button id="new-chat" title="Novo chat"></button><button id="theme-toggle" title="Alternar tema"></button></header>
    <section id="home-hero"><h1>O que você quer saber sobre a cana?</h1>
      <p>Consulte produção, área, produtividade, temperatura, chuva, municípios e períodos.</p>
      <div id="suggestions"><button>Qual foi a produtividade em Volta Redonda em 2008?</button></div></section>
    <div id="loading-card"><strong>Carregando base integrada</strong></div>
    <main id="conversation"></main>
    <form id="question-form"><button id="question-builder-toggle" type="button" title="Montar pergunta"></button>
      <input id="question" placeholder="Pergunte sobre produção, clima ou municípios...">
      <button type="submit" aria-label="Enviar pergunta"></button></form>
    <section id="question-builder-panel"><div class="qb-heading"><strong>Montar pergunta</strong></div></section>
    </body></html>`, { url: 'https://example.org', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  const doc = w.document;
  w.requestAnimationFrame = callback => w.setTimeout(() => callback(Date.now()), 0);
  w.state = { ready: true, rows: [{ year: 2008, municipality: 'Volta Redonda', uf: 'RJ', productivity: 70 }] };
  w.info = { productivity: { label: 'Produtividade', unit: 't/ha', agg: 'mean' } };
  w.metric = () => 'productivity';
  w.years = () => ({ f: 2008, t: 2008 });
  w.subset = () => w.state.rows;
  w.places = question => question.includes('Volta Redonda') ? ['Volta Redonda'] : [];
  w.agg = rows => rows[0]?.productivity ?? null;
  w.answer = () => '<p class="answer">A produtividade em Volta Redonda (RJ), no ano de 2008, foi de 70,00 t/ha.</p>';
  for (const file of [
    'suggestion-state-labels.js', 'locale-answers.js',
    'locale-state-bridge.js', 'locale-ui-dictionary.js',
    'locale-ui-stable.js', 'locale-followups.js'
  ]) w.eval(source(file));

  const toggle = doc.querySelector('.sci-language-toggle');
  assert.equal(toggle.textContent, 'PT');
  assert.equal(doc.querySelector('.sci-language-menu'), null);
  toggle.click();
  assert.equal(toggle.textContent, 'EN');
  const group = doc.createElement('div');
  group.className = 'follow-up-suggestions';
  group.innerHTML = '<p class="follow-up-label">Você também pode perguntar</p>' +
    '<button type="button">Qual foi a produtividade em Volta Redonda em 2008?</button>';
  doc.querySelector('#conversation').append(group);

  let mutations = 0;
  const observer = new w.MutationObserver(records => { mutations += records.length; });
  observer.observe(group, { childList: true, subtree: true, characterData: true });
  await pause(120);
  const en = group.querySelector('button').textContent;
  assert.match(en, /^What was the yield /);
  assert.match(en, /Volta Redonda \(RJ\)/);
  assert.equal(group.querySelector('.follow-up-label').textContent, 'You can also ask');
  const settledAt = mutations;
  await pause(100);
  assert.equal(mutations, settledAt, 'text keeps being rewritten after it should have settled');
  assert.equal(doc.querySelector('#question-form button[type="submit"]').disabled, false);
  toggle.click();
  assert.equal(toggle.textContent, 'PT');
  await pause(50);
  assert.match(group.querySelector('button').textContent, /^Qual foi a produtividade /);
  assert.match(group.querySelector('button').textContent, /Volta Redonda \(RJ\)/);
  observer.disconnect();
});
