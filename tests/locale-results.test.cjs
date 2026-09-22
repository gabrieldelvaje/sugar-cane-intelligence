const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const code = fs.readFileSync(path.resolve(__dirname, '../locale-answers.js'), 'utf8');

function setup(html, rows, queryType) {
  const dom = new JSDOM('<!doctype html><html lang="pt-BR"><body></body></html>', {
    url: 'https://example.org', runScripts: 'outside-only'
  });
  const w = dom.window;
  w.state = { ready: true, rows };
  w.info = { production: { label: 'Produção', agg: 'sum', unit: 't' } };
  w.metric = () => 'production';
  w.years = question => {
    const dates = [...question.matchAll(/\b(?:19\d{2}|20\d{2})\b/g)].map(x => +x[0]);
    return dates.length > 1 ? { f: Math.min(...dates), t: Math.max(...dates) }
      : dates.length ? { f: dates[0], t: dates[0] } : {};
  };
  w.subset = () => rows;
  w.places = () => queryType === 'comparison' ? ['Ribeirão Preto', 'Piracicaba'] : [];
  w.agg = items => items.length ? items.reduce((sum, item) => sum + item.production, 0) : null;
  w.grouped = () => [{ n: 'Ribeirão Preto', u: 'SP', v: 1234 }, { n: 'Piracicaba', u: 'SP', v: 900 }];
  w.answer = () => html;
  w.eval(code);
  w.SCIi18n.set('en');
  return dom;
}

const rows = [
  { municipality: 'Ribeirão Preto', uf: 'SP', year: 2024, production: 1234 },
  { municipality: 'Piracicaba', uf: 'SP', year: 2024, production: 900 }
];

test('ranking summary and chart labels contain English and en-US numbers', t => {
  const original = '<p class="answer">O município na primeira posição é Ribeirão Preto, com 1.234 t.</p>' +
    '<div class="chart ranking-bar-chart"><div class="ranking-chart-heading">' +
    '<strong>Produção</strong><span>Ranking dos municípios</span></div>' +
    '<div class="ranking-bar-row"><span class="ranking-bar-name">Ribeirão Preto (SP)</span>' +
    '<strong class="ranking-bar-value">1.234 t</strong></div></div>';
  const dom = setup(original, rows, 'ranking');
  t.after(() => dom.window.close());
  const result = dom.window.answer('Which 5 municipalities had the highest sugarcane production in São Paulo in 2024?');
  assert.match(result, /The leading municipality for <strong>sugarcane production<\/strong>/);
  assert.match(result, /1,234 t/);
  assert.match(result, /Municipality ranking/);
  assert.doesNotMatch(result, /O município|Ranking dos municípios|1\.234 t/);
});

test('comparison keeps calculated percentage and translates prose and KPIs', t => {
  const original = '<p class="answer">Na comparação de produção, Ribeirão Preto apresenta 1.234 t, valor 37,11% maior que Piracicaba.</p>' +
    '<div class="kpis"><div class="kpi"><span>Ribeirão Preto (SP)</span><strong>1.234 t</strong></div>' +
    '<div class="kpi"><span>Piracicaba (SP)</span><strong>900 t</strong></div></div>';
  const dom = setup(original, rows, 'comparison');
  t.after(() => dom.window.close());
  const result = dom.window.answer('Compare sugarcane production in Ribeirão Preto and Piracicaba from 2010 to 2024.');
  assert.match(result, /Comparing <strong>sugarcane production<\/strong> from 2010 to 2024/);
  assert.match(result, /37\.11%/);
  assert.match(result, /1,234 t/);
  assert.doesNotMatch(result, /Na comparação|1\.234 t/);
});

test('historical-chart legend, axis and accessible labels are localized', t => {
  const original = '<p class="answer">O município na primeira posição é Ribeirão Preto.</p>' +
    '<div class="chart historical-line-chart"><svg aria-label="Série histórica de produção">' +
    '<text class="axis" text-anchor="end">1.234</text>' +
    '<circle class="historical-point" data-value="1.234 t" aria-label="Ribeirão Preto, 2024: 1.234 t"></circle>' +
    '</svg><div class="legend"><strong>Produção por ano</strong></div></div>';
  const dom = setup(original, rows, 'ranking');
  t.after(() => dom.window.close());
  const result = dom.window.answer('Which municipality had the highest sugarcane production in São Paulo in 2024?');
  assert.match(result, /Historical series of sugarcane production/);
  assert.match(result, /Sugarcane production by year/);
  assert.match(result, /data-value="1,234 t"/);
  assert.match(result, /aria-label="Ribeirão Preto, 2024: 1,234 t"/);
});

test('empty-result error and comparison retry are translated', t => {
  const original = '<div class="error">Não encontrei dados para esse recorte.</div>' +
    '<div class="follow-up-suggestions positive-comparison-retry">' +
    '<p class="follow-up-label">Experimente uma comparação com valores maiores que zero:</p>' +
    '<button class="positive-comparison-suggestion">Compare a produção de Ribeirão Preto e Piracicaba entre 2010 e 2024.</button></div>';
  const dom = setup(original, rows, 'comparison');
  t.after(() => dom.window.close());
  const result = dom.window.answer('Compare sugarcane production in Ribeirão Preto and Piracicaba from 2010 to 2024.');
  assert.match(result, /No data was found for these filters\./);
  assert.match(result, /Try a comparison with values greater than zero:/);
  assert.match(result, /Compare sugarcane production in Ribeirão Preto and Piracicaba from 2010 to 2024/);
  assert.doesNotMatch(result, /Não encontrei|Experimente uma comparação/);
});
