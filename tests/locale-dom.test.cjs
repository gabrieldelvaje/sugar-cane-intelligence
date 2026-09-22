const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = file => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function createPage() {
  const dom = new JSDOM(`<!doctype html><html lang="pt-BR"><body>
    <header class="topbar">
      <div class="brand-copy"><strong>Sugar Cane Intelligence</strong><span>Desenvolvido por Gabriel Delvaje</span></div>
      <button id="new-chat" title="Novo chat" aria-label="Novo chat"></button>
      <button id="theme-toggle" title="Alternar tema" aria-label="Alternar tema"></button>
    </header>
    <main><section id="home-hero"><h1>O que você quer saber sobre a cana?</h1>
      <p>Consulte produção, área, produtividade, temperatura, chuva, municípios e períodos.</p>
      <div id="suggestions"><button>Qual município teve maior produção?</button></div></section>
      <div id="loading-card"><strong>Carregando base integrada</strong></div>
      <div id="conversation"></div></main>
    <form id="question-form"><button id="question-builder-toggle" type="button" title="Montar pergunta" aria-label="Montar pergunta escolhendo uma análise"></button>
      <input id="question" placeholder="Pergunte sobre produção, clima ou municípios...">
      <button type="submit" aria-label="Enviar pergunta"></button></form>
    <section id="question-builder-panel"><div class="qb-heading"><strong>Montar pergunta</strong>
      <p>Escolha a análise e os dados que quer consultar.</p></div>
      <div class="qb-wizard"><div class="qb-wizard-view"><h3>O que você quer fazer?</h3></div></div></section>
    </body></html>`, {
    url: 'https://example.org', runScripts: 'outside-only'
  });
  const w = dom.window;
  w.state = { ready: true, rows: [{ year: 2011, municipality: 'Bragança Paulista', uf: 'SP', temperature: 19.71 }] };
  w.info = { temperature: { label: 'Temperatura média', agg: 'mean', unit: '°C' } };
  w.metric = () => 'temperature';
  w.years = () => ({ f: 2011, t: 2011 });
  w.subset = () => w.state.rows;
  w.places = question => question.includes('Bragança Paulista') ? ['Bragança Paulista'] : [];
  w.agg = rows => rows.length ? rows[0].temperature : null;
  w.answer = () => '<p class="answer">A temperatura média em Bragança Paulista (SP), no ano de 2011, foi de 19,71 °C.</p>' +
    '<div class="kpis"><div class="kpi"><span>Temperatura média em 2011</span><strong>19,71 °C</strong></div></div>';
  for (const file of ['locale-answers.js', 'locale-ui.js', 'locale-followups.js']) {
    w.eval(source(file));
  }
  return dom;
}

test('the selector localizes the site, wizard, and an actual answer result', async t => {
  const dom = createPage();
  t.after(() => dom.window.close());
  const w = dom.window;
  const doc = w.document;
  assert.equal(doc.querySelector('.sci-language-current').textContent, 'PT');
  const toggle = doc.querySelector('.sci-language-toggle');
  toggle.click();
  assert.equal(doc.querySelector('.sci-language-menu').hidden, false);
  doc.querySelector('[data-language="en"]').click();
  await tick();
  assert.equal(doc.documentElement.lang, 'en');
  assert.equal(doc.querySelector('.sci-language-current').textContent, 'EN');
  assert.equal(doc.querySelector('#home-hero h1').textContent,
    'What would you like to know about sugarcane?');
  assert.equal(doc.querySelector('#question-builder-panel h3').textContent,
    'What would you like to do?');
  assert.equal(doc.querySelector('#question').placeholder,
    'Ask about production, climate, or municipalities…');
  const english = w.answer('What was the average temperature in Bragança Paulista (SP) in 2011?');
  assert.match(english, /The <strong>average temperature<\/strong>/);
  assert.match(english, /19\.71 °C/);
  assert.doesNotMatch(english, /temperatura média|19,71|foi de/i);
  doc.querySelector('[data-language="pt"]').click();
  await tick();
  assert.equal(doc.querySelector('#home-hero h1').textContent,
    'O que você quer saber sobre a cana?');
  assert.equal(doc.querySelector('.sci-language-current').textContent, 'PT');
});

test('follow-up questions inserted after a response follow the selected language', async t => {
  const dom = createPage();
  t.after(() => dom.window.close());
  const doc = dom.window.document;
  doc.querySelector('[data-language="en"]').click();
  const group = doc.createElement('div');
  group.className = 'follow-up-suggestions';
  group.innerHTML = '<p class="follow-up-label">Você também pode perguntar</p>' +
    '<button type="button">Qual foi a temperatura média em Bragança Paulista (SP) em 2011?</button>';
  doc.querySelector('#conversation').append(group);
  await tick();
  await tick();
  assert.equal(group.querySelector('.follow-up-label').textContent, 'You can also ask');
  assert.equal(group.querySelector('button').textContent,
    'What was the average temperature in Bragança Paulista (SP) in 2011?');
  doc.querySelector('[data-language="pt"]').click();
  await tick();
  assert.equal(group.querySelector('.follow-up-label').textContent, 'Você também pode perguntar');
  assert.equal(group.querySelector('button').textContent,
    'Qual foi a temperatura média em Bragança Paulista (SP) em 2011?');
});
