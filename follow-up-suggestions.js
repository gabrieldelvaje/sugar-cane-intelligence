(() => {
  'use strict';

  const questionPool = [
    'Quais são os 5 municípios com maior produção em 2024?',
    'Qual foi a produção de cana em Piracicaba em 2024?',
    'Compare a produção de Piracicaba e Ribeirão Preto entre 2010 e 2024.',
    'Quais municípios tiveram maior produtividade em São Paulo em 2024?',
    'Qual foi a precipitação em Ribeirão Preto em 2024?',
    'Qual município teve maior área colhida em 2024?',
    'Qual foi a temperatura média em Piracicaba em 2024?',
    'Quais são os 10 maiores produtores de Minas Gerais em 2020?',
    'Compare a produtividade de Piracicaba e Ribeirão Preto entre 2010 e 2024.',
    'Qual município teve maior produção em Goiás em 2024?',
    'Qual foi a área colhida em Piracicaba em 2024?',
    'Quais municípios tiveram maior precipitação em São Paulo em 2024?'
  ];

  const originalAsk = window.ask;
  if (typeof originalAsk !== 'function') return;

  const normalize = value => String(value).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  let previousSuggestions = [];

  function pickTwo(question) {
    const previous = new Set(previousSuggestions.map(normalize));
    const asked = normalize(question);
    const candidates = questionPool.filter(item => !previous.has(normalize(item)) && normalize(item) !== asked);

    // Fisher–Yates: two distinct questions, avoiding the preceding pair.
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    previousSuggestions = candidates.slice(0, 2);
    return previousSuggestions;
  }

  window.ask = function askWithFollowUps(question) {
    const prompt = String(question ?? '').trim();
    if (!prompt) return;

    const conversation = document.querySelector('#conversation');
    const priorAnswers = conversation.querySelectorAll('.message.assistant').length;
    originalAsk(prompt);

    const answers = conversation.querySelectorAll('.message.assistant');
    if (answers.length <= priorAnswers) return;
    const content = answers[answers.length - 1].querySelector('.message-content');
    if (!content || content.querySelector('.error')) return;

    const suggestions = document.createElement('div');
    suggestions.className = 'follow-up-suggestions';
    suggestions.setAttribute('aria-label', 'Sugestões de próximas perguntas');

    const label = document.createElement('p');
    label.className = 'follow-up-label';
    label.textContent = 'Você também pode perguntar';
    suggestions.append(label);

    for (const suggestion of pickTwo(prompt)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = suggestion;
      button.addEventListener('click', () => window.ask(suggestion));
      suggestions.append(button);
    }

    content.append(suggestions);
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
  };

  document.querySelector('#new-chat').addEventListener('click', () => {
    previousSuggestions = [];
  });
})();
