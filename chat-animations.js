(() => {
  'use strict';

  const previousAsk = window.ask;
  const conversation = document.querySelector('#conversation');
  const newChatButton = document.querySelector('#new-chat');
  if (typeof previousAsk !== 'function' || !conversation) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pendingTimers = new Set();
  const queuedQuestions = [];
  let generation = 0;
  let animating = false;

  function schedule(callback, delay) {
    const timer = window.setTimeout(() => {
      pendingTimers.delete(timer);
      callback();
    }, delay);
    pendingTimers.add(timer);
  }

  function scrollToLatest(force = false) {
    const page = document.documentElement;
    const nearBottom = page.scrollHeight - window.scrollY - window.innerHeight < 180;
    if (force || nearBottom) {
      window.scrollTo({ top: page.scrollHeight, behavior: 'instant' });
    }
  }

  function finishReply(token) {
    if (token !== generation) return;
    animating = false;
    scrollToLatest();
    if (queuedQuestions.length) {
      const next = queuedQuestions.shift();
      schedule(() => {
        if (token === generation) window.ask(next);
      }, 100);
    }
  }

  // Keep the answer's HTML (strong text, KPIs, tables and clickable suggestions)
  // intact. Stream only its heading and narrative, then reveal data and buttons.
  function streamAnswer(message, token) {
    if (token !== generation || !message.isConnected) return;
    const content = message.querySelector('.message-content');
    if (!content) return finishReply(token);

    const originalBlocks = Array.from(content.childNodes);
    const narrative = [];
    const otherBlocks = [];
    const isNarrative = node => node.nodeType === Node.ELEMENT_NODE &&
      node.matches('.result-title, .answer, .error, h1, h2, h3, p');

    for (const block of originalBlocks) {
      if (!isNarrative(block)) {
        otherBlocks.push(block);
        continue;
      }
      const clone = block.cloneNode(true);
      const textNodes = [];
      const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const characters = Array.from(node.nodeValue || '');
        node.nodeValue = '';
        if (characters.length) textNodes.push({ node, characters, offset: 0 });
      }
      narrative.push({ element: clone, textNodes });
    }

    content.replaceChildren();
    message.classList.remove('chat-answer-pending');
    message.classList.add('chat-answer-streaming');

    if (reducedMotion || !narrative.length) {
      content.append(...originalBlocks);
      message.classList.remove('chat-answer-streaming');
      finishReply(token);
      return;
    }

    const totalCharacters = narrative.reduce((sum, block) =>
      sum + block.textNodes.reduce((count, item) => count + item.characters.length, 0), 0);
    // Roughly 30-90 incremental updates rather than a long wait for large answers.
    const charactersPerTick = Math.max(2, Math.ceil(totalCharacters / 85));
    let blockIndex = 0;
    let textIndex = 0;

    function writeNext() {
      if (token !== generation || !message.isConnected) return;
      let budget = charactersPerTick;
      while (budget > 0 && blockIndex < narrative.length) {
        const block = narrative[blockIndex];
        if (!block.element.isConnected) content.append(block.element);
        if (textIndex >= block.textNodes.length) {
          blockIndex++;
          textIndex = 0;
          continue;
        }
        const item = block.textNodes[textIndex];
        const amount = Math.min(budget, item.characters.length - item.offset);
        item.node.nodeValue += item.characters.slice(item.offset, item.offset + amount).join('');
        item.offset += amount;
        budget -= amount;
        if (item.offset === item.characters.length) textIndex++;
      }
      scrollToLatest();
      if (blockIndex < narrative.length) {
        schedule(writeNext, 33);
      } else {
        // Keep graphs/tables and the two suggested questions out of the typing effect.
        content.append(...otherBlocks);
        message.classList.remove('chat-answer-streaming');
        message.classList.add('chat-answer-complete');
        finishReply(token);
      }
    }

    writeNext();
  }

  window.ask = function askWithAnimations(question) {
    const prompt = String(question ?? '').trim();
    if (!prompt) return;
    if (animating) {
      queuedQuestions.push(prompt);
      const input = document.querySelector('#question');
      if (input && input.value.trim() === prompt) input.value = '';
      return;
    }

    animating = true;
    const token = ++generation;
    // The first question is anchored just above the fixed input instead of
    // jumping to the top when the landing-page suggestions disappear.
    document.body.classList.add('chat-started');
    const previousMessageCount = conversation.children.length;
    previousAsk(prompt);
    const newMessages = Array.from(conversation.children).slice(previousMessageCount);
    const userMessage = newMessages.find(message => message.classList.contains('user'));
    const answerMessage = newMessages.find(message => message.classList.contains('assistant'));
    if (!userMessage || !answerMessage) return finishReply(token);

    if (!reducedMotion) userMessage.classList.add('chat-question-enter');
    if (answerMessage.querySelector('.error') || reducedMotion) {
      scrollToLatest(true);
      return finishReply(token);
    }

    // Answer is already computed synchronously but never shown before typing.
    answerMessage.classList.add('chat-answer-pending');
    const typingMessage = document.createElement('article');
    typingMessage.className = 'message assistant chat-typing-message';
    typingMessage.setAttribute('role', 'status');
    typingMessage.setAttribute('aria-label', 'Gerando resposta');
    typingMessage.innerHTML = '<div class="message-content">' +
      '<span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>' +
      '</div>';
    answerMessage.before(typingMessage);
    scrollToLatest(true);

    // Three staggered dot pulses, followed by an incremental, token-like reply.
    schedule(() => {
      if (token !== generation || !typingMessage.isConnected) return;
      typingMessage.classList.add('chat-typing-active');
      schedule(() => {
        if (token !== generation || !answerMessage.isConnected) return;
        typingMessage.remove();
        streamAnswer(answerMessage, token);
      }, 1740);
    }, 320);
  };

  newChatButton?.addEventListener('click', () => {
    generation++;
    for (const timer of pendingTimers) window.clearTimeout(timer);
    pendingTimers.clear();
    queuedQuestions.length = 0;
    animating = false;
    document.body.classList.remove('chat-started');
  });
})();
