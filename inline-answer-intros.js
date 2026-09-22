/* Preserve the original data, cards, tables and typing animation; replace only
   the oversized result heading with a natural introduction in the answer. */
(() => {
  'use strict';
  if (typeof answer !== 'function' || typeof metric !== 'function' ||
      typeof info === 'undefined') return;

  const previousAnswer = answer;
  answer = function answerWithInlineIntroduction(question) {
    const html = previousAnswer(question);
    if (typeof html !== 'string' || !html.includes('result-title')) return html;

    const fragment = document.createElement('div');
    fragment.innerHTML = html;
    const heading = fragment.querySelector('.result-title');
    if (!heading) return html;

    const title = heading.textContent.trim();
    const label = info[metric(question)]?.label?.toLocaleLowerCase('pt-BR') || '';
    const paragraph = fragment.querySelector('.answer');

    if (/^Compara(?:ção|cao)\s*[—–-]/i.test(title) && paragraph) {
      // Keep the existing bold period, values and municipality names intact.
      const topic = title.replace(/^Compara(?:ção|cao)\s*[—–-]\s*/i, '')
        .toLocaleLowerCase('pt-BR');
      paragraph.innerHTML = paragraph.innerHTML.replace(
        /^Na análise histórica de\s*/i,
        `Na comparação de <strong>${esc(topic)}</strong>, considerando o período de `
      );
    } else if (/^Maior\s/i.test(title) && !paragraph) {
      // The single-leader view intentionally has only a card: give it the same
      // contextual introduction without restoring the ranking table.
      const card = fragment.querySelector('.kpis .kpi');
      const city = card?.querySelector('span')?.textContent?.trim();
      const value = card?.querySelector('strong')?.textContent?.trim();
      if (!city || !value) return html;
      const date = typeof years === 'function' ? years(question) : {};
      const periodHtml = date.f && date.t
        ? (date.f === date.t
          ? `em <strong>${esc(date.f)}</strong>`
          : `entre <strong>${esc(date.f + ' e ' + date.t)}</strong>`)
        : 'na <strong>série disponível</strong>';
      const introduction = document.createElement('p');
      introduction.className = 'answer';
      introduction.innerHTML =
        `Na análise de <strong>${esc(label)}</strong> ${periodHtml}, ` +
        `o município com maior valor é <strong>${esc(city)}</strong>, ` +
        `com <strong>${esc(value)}</strong>.`;
      heading.after(introduction);
    } else if (title === 'Resultado' && paragraph) {
      paragraph.innerHTML = `No ranking de <strong>${esc(label)}</strong>, ` +
        paragraph.innerHTML.replace(/^O município/i, 'o município');
    } else if (paragraph) {
      // Municipality lookups: carry the subject into the explanatory sentence.
      const subject = title.charAt(0).toLocaleLowerCase('pt-BR') + title.slice(1);
      const detail = paragraph.innerHTML.replace(/^O maior valor/i, 'o maior valor');
      paragraph.innerHTML = `Ao analisar <strong>${esc(subject)}</strong>, ${detail}`;
    } else {
      return html;
    }

    heading.remove();
    return fragment.innerHTML;
  };
})();
