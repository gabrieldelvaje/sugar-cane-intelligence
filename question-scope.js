/* Scope guard: do not turn greetings, unrelated topics or incomplete requests
   into an arbitrary sugarcane-production ranking. Keep the existing answer
   generator, animations, localization and guided-question workflow intact. */
(() => {
  'use strict';
  if (typeof answer !== 'function') return;

  const normalize = value => String(value ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const metrics = /\b(?:cana|sugarcane|producao|produzid[ao]s?|produzir|produziu|produtores?|production|produced|producer|area colhida|area cultivada|area de cana|harvested area|cultivated area|hectares?|produtividade|rendimento|yield|productivity|precipitacao|pluviosidade|chuvas?|rainfall|precipitation|temperatura|temperature)\b/;
  const measurable = /\b(?:producao|produzid[ao]s?|produzir|produziu|produtores?|production|produced|producer|area colhida|area cultivada|area de cana|harvested area|cultivated area|hectares?|produtividade|rendimento|yield|productivity|precipitacao|pluviosidade|chuvas?|rainfall|precipitation|temperatura|temperature)\b/;
  const questionIntent = /\b(?:qual|quais|quanto|quantos|compare|comparar|comparacao|ranking|rank|top|maior|maiores|menor|menores|media|historica|historico|evolucao|serie|mostrar|mostre|liste|listar|dados|which|what|how|compare|comparison|rank|ranking|top|highest|lowest|average|historical|show|list|data|trend)\b/;
  const rankingIntent = /\b(?:municipios?|cidades?|municipalities|cities|ranking|rank|top|maior|maiores|menor|menores|lider|leading|highest|lowest|largest|biggest)\b/;
  const compareIntent = /\b(?:compar(?:e|ar|acao)|comparison|versus|vs|difference between)\b/;
  const unsupportedTopic = /\b(?:jogos?|partidas?|placar|futebol|basquete|campeonatos?|gols?|soccer|football|basketball|matches|match|scores?|filmes?|movies?|musicas?|songs?|eleicoes?|elections?|lot[eo]ria|lottery)\b/;
  const livePeriod = /\b(?:hoje|ontem|amanha|agora|neste momento|tempo real|today|yesterday|tomorrow|right now|live|real time|this week|esta semana)\b/;

  function classify(question) {
    const raw = String(question ?? '').trim();
    const text = normalize(raw);
    if (!text || !metrics.test(text) || !measurable.test(text) || unsupportedTopic.test(text))
      return 'topic';
    if (livePeriod.test(text)) return 'format';

    const years = [...raw.matchAll(/\b(?:19\d{2}|20\d{2})\b/g)].map(match => Number(match[0]));
    if (years.some(year => year < 1974 || year > 2024)) return 'format';

    // A keyword alone ("precipitação", "production") is not a query.
    if (!questionIntent.test(text)) return 'format';

    const cities = typeof places === 'function' && typeof state !== 'undefined' && state.ready
      ? places(raw) : [];
    if (compareIntent.test(text)) return cities.length >= 2 ? null : 'format';

    // A concrete municipality asks for its recorded series. A ranking asks
    // which municipalities lead; without either, never invent the intent.
    if (cities.length || rankingIntent.test(text)) return null;
    return 'format';
  }

  const examples = {
    pt: [
      'Qual município teve maior produção de cana em 2024?',
      'Qual foi a temperatura média em Piracicaba em 2011?'
    ],
    en: [
      'Which municipality had the highest sugarcane production in 2024?',
      'What was the average temperature in Piracicaba in 2011?'
    ]
  };
  const copy = {
    pt: {
      topic: 'Não consigo responder a essa pergunta. Fui desenvolvido para analisar dados municipais de cana-de-açúcar, área colhida, produtividade, temperatura e precipitação no Brasil, de 1974 a 2024.',
      format: 'Não consigo gerar uma análise confiável com essa pergunta. Informe o indicador e o município, ou peça um ranking ou uma comparação entre dois municípios. Os dados disponíveis vão de 1974 a 2024.',
      hint: 'Você pode experimentar uma destas perguntas ou usar o construtor:',
      builder: 'Montar minha pergunta'
    },
    en: {
      topic: 'I cannot answer that question. I am designed to analyze Brazilian municipal data on sugarcane production, harvested area, yield, temperature, and rainfall from 1974 to 2024.',
      format: 'I cannot produce a reliable analysis from that request. Please specify a metric and municipality, or ask for a ranking or a comparison between two municipalities. The available data covers 1974 to 2024.',
      hint: 'Try one of these questions, or use the question builder:',
      builder: 'Build my question'
    }
  };
  const escapeAttr = text => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

  function guidance(reason) {
    const language = window.SCIi18n?.get() === 'en' ? 'en' : 'pt';
    const strings = copy[language];
    const buttons = examples[language].map(question =>
      `<button type="button" class="sci-scope-example" data-sci-scope-example="${escapeAttr(question)}">${question}</button>`
    ).join('');
    // Keep class="error" unchanged: the chat's existing streaming and error
    // handling use this exact class to avoid inventing follow-up rankings.
    return `<div class="error"><strong>${strings[reason === 'format' ? 'format' : 'topic']}</strong></div>` +
      `<div class="sci-scope-actions"><p>${strings.hint}</p>` + buttons +
      `<button type="button" class="sci-scope-builder">${strings.builder}</button></div>`;
  }

  const originalAnswer = answer;
  answer = function scopeCheckedAnswer(question) {
    const reason = classify(question);
    return reason ? guidance(reason) : originalAnswer(question);
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
