(() => {
  'use strict';

  // Wrap the existing chat without changing its answers or follow-up questions.
  const previousAsk = window.ask;
  const conversation = document.querySelector('#conversation');
  if (typeof previousAsk !== 'function' || !conversation) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pendingTimers = new Set();

  function schedule(callback, delay) {
    const timer = window.setTimeout(() => {
      pendingTimers.delete(timer);
      callback();
    }, delay);
    pendingTimers.add(timer);
  }

  function scrollToLatest() {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: reducedMotion ? 'auto' : 'smooth'
    });
  }

  window.ask = function askWithAnimations(question) {
    const prompt = String(question ?? '').trim();
    if (!prompt) return;

    const previousMessageCount = conversation.children.length;
    previousAsk(prompt);

    const newMessages = Array.from(conversation.children).slice(previousMessageCount);
    const userMessage = newMessages.find(message => message.classList.contains('user'));
    const answerMessage = newMessages.find(message => message.classList.contains('assistant'));
    if (!userMessage || !answerMessage || reducedMotion) return;

    // The question enters upwards, as though it has just been sent.
    userMessage.classList.add('chat-question-enter');

    // Do not simulate thinking when the data has not loaded or an error occurred.
    if (answerMessage.querySelector('.error')) {
      answerMessage.classList.add('chat-answer-enter');
      return;
    }

    // The actual answer (including the two follow-up buttons) stays hidden
    // until the three typing-dot pulses have finished.
    answerMessage.classList.add('chat-answer-pending');
    const typingMessage = document.createElement('article');
    typingMessage.className = 'message assistant chat-typing-message';
    typingMessage.setAttribute('role', 'status');
    typingMessage.setAttribute('aria-label', 'Analisando sua pergunta');
    typingMessage.innerHTML = '<div class="message-icon" aria-hidden="true"></div>' +
      '<div class="message-content">' +
      '<span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>' +
      '<span class="typing-label">Analisando sua pergunta…</span>' +
      '</div>';
    answerMessage.before(typingMessage);
    scrollToLatest();

    // 360 ms for the question to slide up; then three dot pulses.
    schedule(() => {
      if (!typingMessage.isConnected || !answerMessage.isConnected) return;
      typingMessage.classList.add('chat-typing-active');
      scrollToLatest();

      // Three 540 ms pulses, with 110 ms stagger per dot, complete in 1.84 s.
      schedule(() => {
        if (!answerMessage.isConnected) return;
        typingMessage.remove();
        answerMessage.classList.remove('chat-answer-pending');
        answerMessage.classList.add('chat-answer-enter');
        scrollToLatest();
      }, 1900);
    }, 360);
  };

  // Resetting the conversation cancels delayed replies from the old chat.
  document.querySelector('#new-chat')?.addEventListener('click', () => {
    for (const timer of pendingTimers) window.clearTimeout(timer);
    pendingTimers.clear();
  });
})();
