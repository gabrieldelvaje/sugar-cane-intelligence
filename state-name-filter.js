/* Parse full state names selected in the guided question builder. */
(() => {
  'use strict';
  if (typeof uf !== 'function' || typeof norm !== 'function') return;
  const states = [
    ['mato grosso do sul', 'MS'], ['rio grande do norte', 'RN'],
    ['rio grande do sul', 'RS'], ['rio de janeiro', 'RJ'],
    ['santa catarina', 'SC'], ['minas gerais', 'MG'],
    ['mato grosso', 'MT'], ['sao paulo', 'SP'],
    ['maranhao', 'MA'], ['pernambuco', 'PE'], ['alagoas', 'AL'],
    ['paraiba', 'PB'], ['parana', 'PR'], ['tocantins', 'TO'],
    ['sergipe', 'SE'], ['goias', 'GO'], ['bahia', 'BA'], ['para', 'PA']
  ];
  uf = function matchedStateName(question) {
    const text = norm(question).replace(/\s+/g, ' ');
    for (const [name, code] of states) {
      // State name must stand on its own, followed by a date or punctuation:
      // the municipality "São Paulo das Missões" must not force an SP filter.
      const pattern = new RegExp(`\\b(?:em|no|na|de|do|da)\\s+${name}(?=\\s+(?:em|entre|ate)\\s+\\d{4}|\\s*[?.!,]|$)`);
      if (pattern.test(text)) return code;
    }
    return undefined;
  };
})();
