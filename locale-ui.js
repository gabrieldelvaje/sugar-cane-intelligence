/* Translate the interface and generated question suggestions without changing
   the Portuguese values used internally by the existing analysis and wizard. */
(() => {
  'use strict';
  const i18n = window.SCIi18n;
  const header = document.querySelector('.topbar');
  const theme = document.querySelector('#theme-toggle');
  const form = document.querySelector('#question-form');
  const input = document.querySelector('#question');
  const conversation = document.querySelector('#conversation');
  const initial = document.querySelector('#suggestions');
  const panel = document.querySelector('#question-builder-panel');
  const submit = form?.querySelector('button[type="submit"]');
  if (!i18n || !header || !theme || !form || !input || !conversation || !initial || !panel) return;

  const translations = new Map(Object.entries({
    'Desenvolvido por Gabriel Delvaje': 'Developed by Gabriel Delvaje',
    'O que você quer saber sobre a cana?': 'What would you like to know about sugarcane?',
    'Consulte produção, área, produtividade, temperatura, chuva, municípios e períodos.':
      'Explore production, harvested area, yield, temperature, rainfall, municipalities, and time periods.',
    'Carregando base integrada': 'Loading integrated dataset',
    'PAM/IBGE + CRU TS, de 1974 a 2024.': 'PAM/IBGE + CRU TS, 1974–2024.',
    'Não foi possível carregar a base.': 'The dataset could not be loaded.',
    'Arquivo da base não encontrado.': 'The dataset file was not found.',
    'Montar pergunta': 'Build a question',
    'Montar uma pergunta': 'Build a question',
    'Montar pergunta escolhendo uma análise': 'Build a question by choosing an analysis',
    'Fechar o menu de perguntas': 'Close the question builder',
    'Fechar menu': 'Close menu',
    'Escolha a análise e os dados que quer consultar.': 'Choose the analysis and data you want to explore.',
    'O que você quer fazer?': 'What would you like to do?',
    'Qual indicador?': 'Which indicator?',
    'Primeiro município': 'First municipality',
    'Qual município?': 'Which municipality?',
    'Segundo município': 'Second municipality',
    'Onde pesquisar?': 'Where would you like to search?',
    'Qual período?': 'Which time period?',
    'Confira sua pergunta': 'Review your question',
    'Maior município': 'Leading municipality',
    'Mostrar o município com o maior valor': 'Show the municipality with the highest value',
    'Listar os 5, 10 ou 20 primeiros': 'List the top 5, 10, or 20 municipalities',
    'Comparar cidades': 'Compare municipalities',
    'Confrontar dois municípios': 'Compare two municipalities',
    'Consultar cidade': 'Look up a municipality',
    'Ver os dados de um município': 'View data for one municipality',
    'Indicador': 'Indicator',
    'Produção': 'Sugarcane production',
    'Produção de cana': 'Sugarcane production',
    'Área colhida': 'Harvested area',
    'Produtividade': 'Yield',
    'Precipitação': 'Rainfall',
    'Temperatura média': 'Average temperature',
    'Estado': 'State',
    'Brasil inteiro': 'All of Brazil',
    'Quantidade': 'Quantity',
    'Quantidade no ranking': 'Number of ranked municipalities',
    'Primeira cidade': 'First municipality',
    'Segunda cidade': 'Second municipality',
    'Município': 'Municipality',
    'Período': 'Time period',
    'Toda a série disponível': 'Full available time series',
    'Um ano': 'One year',
    'Entre dois anos': 'Between two years',
    'Ano': 'Year',
    'De': 'From',
    'Até': 'To',
    'Voltar': 'Back',
    'Avançar': 'Next',
    'Avançar →': 'Next →',
    'Fechar': 'Close',
    'Enviar pergunta': 'Send question',
    'Enviar pergunta ↑': 'Send question ↑',
    'Sua pergunta': 'Your question',
    'Gerando resposta': 'Generating answer',
    'Nova conversa': 'New conversation',
    'Novo chat': 'New chat',
    'Alternar tema': 'Switch theme',
    'Preparando resposta': 'Preparing answer',
    'Sugestões de próximas perguntas': 'Suggested follow-up questions',
    'Você também pode perguntar': 'You can also ask',
    'A pergunta aparece aqui quando você completar os campos.':
      'Your question will appear here once you complete the fields.',
    'Aguarde a base de dados terminar de carregar.': 'Wait for the dataset to finish loading.',
    'Aguarde a base de municípios carregar.': 'Wait for the municipality dataset to load.',
    'Aguarde o carregamento da base de municípios.': 'Wait for the municipality dataset to load.',
    'Nenhum município encontrado.': 'No municipality was found.',
    'Busque e selecione uma cidade da base de dados.':
      'Search for and select a municipality from the dataset.',
    'Selecione o tipo de análise.': 'Select an analysis type.',
    'Selecione um indicador.': 'Select an indicator.',
    'Escolha um município na lista.': 'Choose a municipality from the list.',
    'Escolha o segundo município na lista.': 'Choose the second municipality from the list.',
    'O ano inicial deve ser anterior ou igual ao final.':
      'The start year must be earlier than or equal to the end year.',
    'O ano inicial precisa ser anterior ou igual ao ano final.':
      'The start year must be earlier than or equal to the end year.',
    'Aguarde a base carregar ou a resposta atual terminar.':
      'Wait for the dataset to load or for the current answer to finish.',
    'Não consegui identificar essa dupla. Volte e escolha outros municípios.':
      'I could not identify this pair. Go back and choose different municipalities.',
    'Não consegui identificar essa dupla de municípios. Escolha outros na lista.':
      'I could not identify this pair of municipalities. Choose others from the list.',
    'Selecione a primeira cidade na lista de resultados.':
      'Select the first municipality from the results.',
    'Selecione a segunda cidade na lista de resultados.':
      'Select the second municipality from the results.',
    'Escolha dois municípios diferentes.': 'Choose two different municipalities.',
    'Complete os campos antes de enviar.': 'Complete the fields before sending.',
    'Busque uma cidade…': 'Search for a municipality…',
    'Busque outra cidade…': 'Search for another municipality…',
    'Digite o nome de um município…': 'Type a municipality name…',
    'Buscar município': 'Search for a municipality',
    'Buscar segundo município': 'Search for the second municipality',
    'Pergunte sobre produção, clima ou municípios...':
      'Ask about production, climate, or municipalities…',
    'Experimente uma comparação com valores maiores que zero:':
      'Try a comparison with values greater than zero:'
  }));
  let originalText = new WeakMap();
  let originalAttrs = new WeakMap();
  let refreshing = false;

  function translateValue(value) {
    const text = String(value ?? '');
    const whitespace = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const core = whitespace[2];
    let translated = translations.get(core);
    if (!translated && /^(?:Qual|Quais|Compare a)\b/i.test(core)) {
      translated = i18n.toEnglishQuestion(core);
    }
    if (!translated) {
      const step = core.match(/^Etapa (\d+) de (\d+)$/);
      const compare = core.match(/^Comparar com (.+)\.$/);
      if (step) translated = `Step ${step[1]} of ${step[2]}`;
      else if (compare) translated = `Compare with ${compare[1]}.`;
    }
    return translated ? whitespace[1] + translated + whitespace[3] : text;
  }

  function translateTextNode(node) {
    if (node.nodeType !== Node.TEXT_NODE || !node.nodeValue.trim()) return;
    if (i18n.get() === 'en') {
      if (!originalText.has(node)) originalText.set(node, node.nodeValue);
      const text = translateValue(originalText.get(node));
      if (node.nodeValue !== text) node.nodeValue = text;
    } else if (originalText.has(node) && node.nodeValue !== originalText.get(node)) {
      node.nodeValue = originalText.get(node);
    }
  }

  function translateAttributes(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return;
    for (const name of ['placeholder', 'title', 'aria-label']) {
      if (!element.hasAttribute(name)) continue;
      const current = element.getAttribute(name);
      if (i18n.get() === 'en') {
        const previous = originalAttrs.get(element)?.[name];
        if (previous !== undefined && current === translateValue(previous)) continue;
        const originals = originalAttrs.get(element) || {};
        originals[name] = current;
        originalAttrs.set(element, originals);
        const translated = translateValue(current);
        if (translated !== current) element.setAttribute(name, translated);
      } else {
        const previous = originalAttrs.get(element)?.[name];
        if (previous !== undefined && current !== previous) element.setAttribute(name, previous);
      }
    }
  }

  function localizeTree(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) { translateTextNode(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    translateAttributes(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
      else translateAttributes(node);
    }
  }

  const control = document.createElement('div');
  control.className = 'sci-language-control';
  control.innerHTML = '<button type="button" class="sci-language-toggle" aria-label="Idioma / Language" aria-controls="sci-language-menu" aria-expanded="false" aria-haspopup="true"><span class="sci-language-current">PT</span><span aria-hidden="true">⌄</span></button>' +
    '<div id="sci-language-menu" class="sci-language-menu" role="group" aria-label="Idioma / Language" hidden>' +
    '<button type="button" data-language="pt" lang="pt-BR">Português</button>' +
    '<button type="button" data-language="en" lang="en">English</button></div>';
  header.insertBefore(control, theme);
  const toggle = control.querySelector('.sci-language-toggle');
  const menu = control.querySelector('.sci-language-menu');
  const current = control.querySelector('.sci-language-current');

  function menuOpen(yes) {
    menu.hidden = !yes;
    toggle.setAttribute('aria-expanded', String(yes));
  }
  toggle.addEventListener('click', () => menuOpen(menu.hidden));
  document.addEventListener('click', event => {
    if (!control.contains(event.target)) menuOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) {
      menuOpen(false);
      toggle.focus({ preventScroll: true });
    }
  });

  function localizeExistingConversation() {
    if (!state.ready || submit.disabled) return;
    for (const response of conversation.querySelectorAll('.message.assistant.chat-response')) {
      const user = response.previousElementSibling;
      if (!user?.classList.contains('user')) continue;
      const question = user.querySelector('.message-content p')?.textContent || '';
      const content = response.querySelector('.message-content');
      if (!content || !question) continue;
      const suggestions = content.querySelector('.follow-up-suggestions');
      if (suggestions) suggestions.remove();
      try {
        // Rebuild from the dataset, not by translating already-streamed DOM fragments.
        const pt = i18n.toPortugueseQuestion(question);
        content.innerHTML = answer(i18n.get() === 'en' ? question : pt);
      } catch (_) { /* Keep an already-rendered answer if the data are unavailable. */ }
      if (suggestions) content.append(suggestions);
    }
  }

  function refresh(switching = false) {
    if (refreshing) return;
    refreshing = true;
    try {
      current.textContent = i18n.get() === 'en' ? 'EN' : 'PT';
      control.querySelectorAll('[data-language]').forEach(button => {
        const selected = button.dataset.language === i18n.get();
        button.setAttribute('aria-pressed', String(selected));
      });
      for (const selector of ['.brand-copy', '#home-hero > h1', '#home-hero > p',
        '#loading-card', '#new-chat', '#theme-toggle', '#question-builder-toggle',
        '#question-form', '#question-builder-panel']) {
        localizeTree(document.querySelector(selector));
      }
      localizeTree(initial);
      conversation.querySelectorAll('.follow-up-suggestions').forEach(localizeTree);
      if (switching) localizeExistingConversation();
    } finally { refreshing = false; }
  }

  control.querySelectorAll('[data-language]').forEach(button => {
    button.addEventListener('click', () => {
      const next = button.dataset.language;
      if (next !== i18n.get()) {
        i18n.set(next);
        refresh(true);
      }
      menuOpen(false);
      toggle.focus({ preventScroll: true });
    });
  });

  // Existing suggestion handlers retain Portuguese questions in closures.
  // Capture their clicks, submit the selected language's visible text, and keep
  // the existing question/answer/chat animations unchanged.
  conversation.addEventListener('click', event => {
    if (i18n.get() !== 'en') return;
    const button = event.target.closest('.follow-up-suggestions button');
    if (!button || !conversation.contains(button) || button.disabled || submit.disabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = i18n.toEnglishQuestion(button.textContent.trim());
    form.requestSubmit();
  }, true);

  // Builder and randomized suggestions still create Portuguese questions for
  // the data engine; only convert the user-facing submission in English mode.
  document.addEventListener('submit', event => {
    if (event.target !== form || i18n.get() !== 'en') return;
    input.value = i18n.toEnglishQuestion(input.value);
  }, true);

  function shouldTranslateMutation(record) {
    const element = record.target.nodeType === Node.ELEMENT_NODE
      ? record.target : record.target.parentElement;
    if (!element) return false;
    return element.closest('#question-builder-panel, #question-builder-toggle, #suggestions, #loading-card, .follow-up-suggestions') !== null;
  }
  const observer = new MutationObserver(records => {
    if (refreshing || !records.some(shouldTranslateMutation)) return;
    refresh();
  });
  observer.observe(panel, { childList: true, subtree: true, characterData: true });
  observer.observe(initial, { childList: true, subtree: true, characterData: true });
  observer.observe(conversation, { childList: true, subtree: true, characterData: true });
  observer.observe(document.querySelector('#loading-card'), { childList: true, subtree: true, characterData: true });
  observer.observe(document.querySelector('#question-builder-toggle'), { attributes: true, attributeFilter: ['title', 'aria-label'] });
  if (submit) observer.observe(submit, { attributes: true, attributeFilter: ['aria-label'] });
  refresh();
})();