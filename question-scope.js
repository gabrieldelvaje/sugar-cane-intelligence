/* Scope guard: allow supported municipal rankings/comparisons to omit the
   indicator (default: sugarcane production), without turning unrelated or
   incomplete requests into arbitrary production results. */
(() => {
  'use strict';
  if (typeof answer !== 'function') return;

  const normalize = value => String(value ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const measurable = /\b(?:producao|produzid[ao]s?|produzir|produziu|produtores?|production|produced|producer|area colhida|area cultivada|area de cana|harvested area|cultivated area|hectares?|produtividade|rendimento|yield|productivity|precipitacao|pluviosidade|chuvas?|choveu|rainfall|precipitation|rained|temperatura|temperature)\b/;
  const questionIntent = /\b(?:qual|quais|quanto|quantos|compare|comparar|comparacao|ranking|rank|top|maior|maiores|menor|menores|media|historica|historico|evolucao|serie|mostrar|mostre|liste|listar|dados|which|what|how|compare|comparison|rank|ranking|top|highest|lowest|largest|biggest|average|historical|show|list|data|trend)\b/;
  const rankingIntent = /\b(?:municipios?|cidades?|municipalities|cities|ranking|rank|top|maior|maiores|menor|menores|lider|leading|highest|lowest|largest|biggest)\b/;
  const compareIntent = /\b(?:compar(?:e|ar|acao)|comparison|versus|vs|difference between)\b/;
  const unsupportedTopic = /\b(?:jogos?|partidas?|placar|futebol|basquete|campeonatos?|gols?|games?|soccer|football|basketball|matches|match|scores?|filmes?|movies?|musicas?|songs?|eleicoes?|elections?|lot[eo]ria|lottery|populacao|population|habitantes?|pib|gdp|renda|income|criminalidade|crimes?|desemprego|unemployment|precos?|prices?)\b/;
  const unspecifiedClimate = /\b(?:clima|climate|weather|previsao|forecast)\b/;
  const livePeriod = /\b(?:hoje|ontem|amanha|agora|neste momento|tempo real|today|yesterday|tomorrow|right now|live|real time|this week|esta semana)\b/;
  const numberWords = Object.freeze({
    um: 1, uma: 1, one: 1, dois: 2, duas: 2, two: 2, tres: 3, three: 3,
    quatro: 4, four: 4, cinco: 5, five: 5, seis: 6, six: 6, sete: 7,
    seven: 7, oito: 8, eight: 8, nove: 9, nine: 9, dez: 10, ten: 10,
    onze: 11, eleven: 11, doze: 12, twelve: 12, quinze: 15, fifteen: 15,
    vinte: 20, twenty: 20
  });

  function cityNames(question) {
    return typeof places === 'function' && typeof state !== 'undefined' && state.ready
      ? places(question) : [];
  }

  function rankRequest(text) {
    // The words "maiores" or "biggest" alone do not authorize an arbitrary
    // answer: there must also be a municipal/ranking request.
    return rankingIntent.test(text) && questionIntent.test(text) &&
      /\b(?:municipios?|cidades?|municipalities|cities|ranking|rank|top)\b/.test(text);
  }

  const capabilityIntent = /^(?:o que (?:voce|você) pode fazer|o que posso fazer|what can you do|what can i do)[?!.\s]*$/i;

  function classify(question) {
    const raw = String(question ?? '').trim();
    const text = normalize(raw);
    if (!text || unsupportedTopic.test(text)) return 'topic';

    const cities = cityNames(raw);
    const hasMetric = measurable.test(text);
    if (!hasMetric) {
      // Out-of-topic questions stay out-of-topic even if they mention a date
      // such as "yesterday". Only supported municipal intents are allowed to
      // infer sugarcane production; unspecified climate still needs a metric.
      const implicitComparison = compareIntent.test(text) && cities.length >= 2;
      if (!implicitComparison && !rankRequest(text) && !unspecifiedClimate.test(text))
        return compareIntent.test(text) && cities.length ? 'format' : 'topic';
    }
    if (livePeriod.test(text)) return 'format';

    const years = [...raw.matchAll(/\b(?:19\d{2}|20\d{2})\b/g)].map(match => Number(match[0]));
    if (years.some(year => year < 1974 || year > 2024)) return 'format';

    if (!hasMetric) {
      // Explicitly requested climate without a defined indicator is still
      // ambiguous; do not silently interpret it as agricultural production.
      if (unspecifiedClimate.test(text)) return 'format';
      if (compareIntent.test(text)) return cities.length >= 2 ? null : (cities.length ? 'format' : 'topic');
      return rankRequest(text) ? null : 'topic';
    }

    // A metric alone ("precipitação", "production") is not a query.
    if (!questionIntent.test(text)) return 'format';
    if (compareIntent.test(text)) return cities.length >= 2 ? null : 'format';
    if (cities.length || rankingIntent.test(text)) return null;
    return 'format';
  }

  function countRequested(question) {
    const text = normalize(question);
    const digit = text.match(/\b(?:20|1\d|[1-9])\b/);
    if (digit) return Number(digit[0]);
    const word = text.match(new RegExp(`\\b(?:${Object.keys(numberWords).join('|')})\\b`));
    return word ? numberWords[word[0]] : 0;
  }

  function implicitProductionQuestion(question) {
    const raw = String(question ?? '').trim();
    const text = normalize(raw);
    if (measurable.test(text) || classify(raw)) return raw;

    const dates = [...raw.matchAll(/\b(?:19\d{2}|20\d{2})\b/g)].map(match => Number(match[0]));
    const period = dates.length >= 2
      ? ` entre ${Math.min(...dates)} e ${Math.max(...dates)}`
      : dates.length ? ` em ${dates[0]}` : '';
    const cities = cityNames(raw);
    if (compareIntent.test(text) && cities.length >= 2)
      return `Compare a produção de cana de ${cities[0]} e ${cities[1]}${period}.`;

    const n = countRequested(raw);
    // Preserve state filters when the original question specifies them.
    const stateNames = {
      'sao paulo': 'São Paulo', 'minas gerais': 'Minas Gerais', goias: 'Goiás',
      parana: 'Paraná', 'mato grosso do sul': 'Mato Grosso do Sul',
      'mato grosso': 'Mato Grosso', pernambuco: 'Pernambuco', alagoas: 'Alagoas',
      bahia: 'Bahia', 'rio de janeiro': 'Rio de Janeiro', para: 'Pará'
    };
    const stateName = Object.entries(stateNames)
      .sort((a, b) => b[0].length - a[0].length)
      .find(([name]) => new RegExp(`\\b${name}\\b`).test(text))?.[1];
    const where = stateName ? ` em ${stateName}` : '';
    const singular = /\b(?:qual|which)\b/.test(text) && !n &&
      !/\b(?:quais|municipios|cidades|municipalities|cities|ranking|rank|top|list|lista)\b/.test(text);
    return singular
      ? `Qual município teve maior produção de cana${where}${period}?`
      : `Quais são os ${n || 10} municípios com maior produção de cana${where}${period}?`;
  }

  // Used only when re-rendering previously answered questions after a locale
  // change; the original English question must reach the scope guard intact.
  window.SCIimplicitProduction = Object.freeze({
    matches: question => !measurable.test(normalize(question)) && classify(question) === null
  });

  const examples = {
    pt: [
      'O que você pode fazer?',
      'Qual município teve maior produção de cana em 2024?'
    ],
    en: [
      'What can you do?',
      'Which municipality had the highest sugarcane production in 2024?'
    ]
  };
  const copy = {
    pt: {
      topic: 'Não consigo responder a essa pergunta. Fui desenvolvido para analisar dados municipais de cana-de-açúcar, área colhida, produtividade, temperatura e precipitação no Brasil, de 1974 a 2024.',
      format: 'Não consigo gerar uma análise confiável com essa pergunta. Informe o indicador e o município, ou peça um ranking ou uma comparação entre dois municípios. Os dados disponíveis vão de 1974 a 2024.',
      hint: 'Você pode ver o que eu consigo fazer, experimentar uma pergunta ou usar o construtor:',
      builder: 'Montar minha pergunta',
      capabilitiesTitle: 'O que é o Sugar Cane Intelligence?',
      capabilitiesIntro: 'É uma ferramenta de análise municipal que transforma perguntas sobre cana-de-açúcar e clima em respostas, rankings, comparações e séries históricas usando a base disponível de 1974 a 2024.',
      capabilitiesItems: [
        '<strong>Produção de cana</strong> — consulte valores e municípios líderes.',
        '<strong>Área colhida</strong> — analise a área destinada à cultura.',
        '<strong>Produtividade</strong> — compare o rendimento entre municípios.',
        '<strong>Precipitação</strong> — investigue chuva por município e período.',
        '<strong>Temperatura média</strong> — consulte e compare condições térmicas.'
      ],
      capabilitiesFooter: 'Você pode consultar um município, criar rankings, comparar duas cidades ou analisar um período. Se preferir, monte a pergunta passo a passo.'
    },
    en: {
      topic: 'I cannot answer that question. I am designed to analyze Brazilian municipal data on sugarcane production, harvested area, yield, temperature, and rainfall from 1974 to 2024.',
      format: 'I cannot produce a reliable analysis from that request. Please specify a metric and municipality, or ask for a ranking or a comparison between two municipalities. The available data covers 1974 to 2024.',
      hint: 'See what I can do, try a question, or use the question builder:',
      builder: 'Build my question',
      capabilitiesTitle: 'What is Sugar Cane Intelligence?',
      capabilitiesIntro: 'It is a municipal analytics tool that turns questions about sugarcane and climate into answers, rankings, comparisons, and historical series using the available 1974–2024 dataset.',
      capabilitiesItems: [
        '<strong>Sugarcane production</strong> — explore values and leading municipalities.',
        '<strong>Harvested area</strong> — analyze the area used for the crop.',
        '<strong>Yield</strong> — compare productivity across municipalities.',
        '<strong>Rainfall</strong> — investigate precipitation by municipality and period.',
        '<strong>Average temperature</strong> — explore and compare thermal conditions.'
      ],
      capabilitiesFooter: 'You can look up one municipality, create rankings, compare two cities, or analyze a time period. Or build the question step by step.'

    }
  };
  const escapeAttr = text => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

  function capabilities() {
    const language = window.SCIi18n?.get() === 'en' ? 'en' : 'pt';
    const strings = copy[language];
    return `<div class="sci-capability-overview"><h2>${strings.capabilitiesTitle}</h2><p>${strings.capabilitiesIntro}</p>` +
      `<ul>${strings.capabilitiesItems.map(item => `<li>${item}</li>`).join('')}</ul>` +
      `<p>${strings.capabilitiesFooter}</p></div>` +
      `<div class="sci-scope-actions sci-capability-actions"><button type="button" class="sci-scope-builder">${strings.builder}</button></div>`;
  }

  function guidance(reason) {
    const language = window.SCIi18n?.get() === 'en' ? 'en' : 'pt';
    const strings = copy[language];
    const buttons = examples[language].map((question, index) =>
      `<button type="button" class="sci-scope-example${index === 0 ? ' sci-capability-suggestion' : ''}" data-sci-scope-example="${escapeAttr(question)}">${question}</button>`
    ).join('');
    return `<div class="error"><strong>${strings[reason === 'format' ? 'format' : 'topic']}</strong></div>` +
      `<div class="sci-scope-actions"><p>${strings.hint}</p>` + buttons +
      `<button type="button" class="sci-scope-builder">${strings.builder}</button></div>`;
  }

  const originalAnswer = answer;
  answer = function scopeCheckedAnswer(question) {
    const raw = String(question ?? '').trim();
    if (capabilityIntent.test(raw)) return capabilities();
    const reason = classify(raw);
    return reason ? guidance(reason) : originalAnswer(implicitProductionQuestion(raw));
  };

  const conversation = document.querySelector('#conversation');
  conversation?.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || !conversation.contains(button)) return;
    if (button.matches('.sci-scope-builder')) {
      document.querySelector('#question-builder-toggle')?.click();
      return;
    }
    if (!button.matches('.sci-scope-example')) return;
    const input = document.querySelector('#question');
    const form = document.querySelector('#question-form');
    if (!input || !form || input.disabled) return;
    input.value = button.dataset.sciScopeExample || '';
    form.requestSubmit();
  });
})();
