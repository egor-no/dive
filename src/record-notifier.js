import { STYLES, formatCentiseconds } from './domain.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const seconds = value => `${Math.floor(value / 100).toLocaleString('ru-RU')},${String(value % 100).padStart(2, '0')} с`;
const artwork = `<svg class="record-notice-art" viewBox="0 0 120 92" fill="none" aria-hidden="true">
  <circle cx="74" cy="43" r="34"/><circle cx="74" cy="43" r="25"/><circle cx="74" cy="43" r="16"/>
  <path d="M4 60c16-18 27 18 45 0s27 18 45 0M4 73c16-18 27 18 45 0s27 18 45 0"/>
  <path class="record-notice-accent" d="M12 12h30M12 20h30M12 28h30"/>
</svg>`;

export function createRecordNotifier() {
  const card = document.createElement('aside');
  card.className = 'record-notice';
  card.setAttribute('aria-labelledby', 'record-notice-title');
  card.hidden = true;
  const announcer = document.createElement('p');
  announcer.className = 'sr-only';
  announcer.setAttribute('role', 'status');
  document.body.append(card, announcer);
  let notices = [];
  let index = 0;

  const clear = () => {
    notices = []; index = 0; card.hidden = true; card.innerHTML = ''; announcer.textContent = '';
  };
  const render = () => {
    const notice = notices[index];
    if (!notice) { clear(); return; }
    const first = notice.kind === 'first';
    const title = first ? 'Первый результат' : 'Новый личный рекорд';
    const discipline = `${notice.distance.toLocaleString('ru-RU')} м · ${STYLES[notice.style]}`;
    card.classList.toggle('is-first', first);
    card.innerHTML = `<button type="button" class="icon-button record-notice-close" data-notice="close" aria-label="Закрыть уведомления о достижениях">×</button>
      <div class="record-notice-heading"><div><p class="journal-label">${first ? 'НАЧАЛО ВАШЕЙ ИСТОРИИ' : 'ЕЩЁ ОДНА НОВАЯ ГРАНЬ'}</p><h2 id="record-notice-title">${title}<span>.</span></h2></div>${artwork}</div>
      <p class="record-notice-discipline">${discipline}</p>${notice.technique ? `<p class="record-notice-technique">${esc(notice.technique)}</p>` : ''}
      <div class="record-notice-result"><strong>${formatCentiseconds(notice.timeCs)}</strong>${first ? '<span>Точка отсчёта для следующих заплывов</span>' : `<div><span>Раньше — ${formatCentiseconds(notice.previousTimeCs)}</span><b>Быстрее на ${seconds(notice.improvementCs)}</b></div>`}</div>
      <div class="record-notice-footer"><span>${notices.length > 1 ? `${index + 1} из ${notices.length} достижений` : 'В своём ритме'}</span><button type="button" class="text-link" data-notice="next">${index + 1 < notices.length ? 'Следующее →' : 'Готово'}</button></div>`;
    card.hidden = false;
    announcer.textContent = `${title}. ${discipline}${notice.technique ? ', ' + notice.technique : ''}. ${formatCentiseconds(notice.timeCs)}.${first ? '' : ` Раньше ${formatCentiseconds(notice.previousTimeCs)}, быстрее на ${seconds(notice.improvementCs)}.`}${notices.length > 1 ? ` Достижение ${index + 1} из ${notices.length}.` : ''}`;
  };
  card.addEventListener('click', event => {
    const action = event.target.closest('[data-notice]')?.dataset.notice;
    if (action === 'close') clear();
    else if (action === 'next') {
      index++; render();
      // Keep keyboard focus inside the card only when the user advances its queue.
      if (!card.hidden) card.querySelector('[data-notice="next"]').focus({ preventScroll: true });
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !card.hidden) clear();
  });
  return {
    show(items) { if (!items.length) return; notices = [...notices.slice(index), ...items]; index = 0; render(); },
    clear,
  };
}
