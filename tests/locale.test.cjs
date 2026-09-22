const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function environment() {
  const storage = new Map();
  const window = {};
  const document = { documentElement: { lang: 'pt-BR', dataset: {} } };
  const names = ['Piracicaba', 'Ribeirão Preto', 'Bragança Paulista'];
  const context = {
    window, document,
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    },
    places: question => names.filter(name => question.includes(name)).slice(0, 2)
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../locale-answers.js'), 'utf8');
  vm.runInNewContext(source, context, { filename: 'locale-answers.js' });
  return { i18n: window.SCIi18n, storage, document };
}

test('the default language is Portuguese and selection is stored', () => {
  const { i18n, storage, document } = environment();
  assert.equal(i18n.get(), 'pt');
  i18n.set('en');
  assert.equal(i18n.get(), 'en');
  assert.equal(storage.get('sci-language'), 'en');
  assert.equal(document.documentElement.lang, 'en');
  i18n.set('pt');
  assert.equal(document.documentElement.lang, 'pt-BR');
});

test('ranking questions round-trip without changing metric, state or year', () => {
  const { i18n } = environment();
  const portuguese = 'Quais são os 5 municípios com maior produção em Paraná em 2006?';
  const english = 'Which 5 municipalities had the highest sugarcane production in Paraná in 2006?';
  assert.equal(i18n.toEnglishQuestion(portuguese), english);
  assert.equal(i18n.toPortugueseQuestion(english), portuguese);
});

test('municipality queries round-trip without changing city, metric or year', () => {
  const { i18n } = environment();
  const portuguese = 'Qual foi a temperatura média em Bragança Paulista (SP) em 2011?';
  const english = 'What was the average temperature in Bragança Paulista (SP) in 2011?';
  assert.equal(i18n.toEnglishQuestion(portuguese), english);
  assert.equal(i18n.toPortugueseQuestion(english), portuguese);
});

test('comparisons preserve both municipalities and the year range', () => {
  const { i18n } = environment();
  const portuguese = 'Compare a produtividade de Piracicaba e Ribeirão Preto entre 2010 e 2024.';
  const english = 'Compare yield in Piracicaba and Ribeirão Preto from 2010 to 2024.';
  assert.equal(i18n.toEnglishQuestion(portuguese), english);
  assert.equal(i18n.toPortugueseQuestion(english), portuguese);
});

test('leader questions preserve rainfall and state', () => {
  const { i18n } = environment();
  const english = 'Which municipality had the highest rainfall in São Paulo in 2024?';
  assert.equal(i18n.toPortugueseQuestion(english),
    'Qual município teve maior precipitação em São Paulo em 2024?');
});
