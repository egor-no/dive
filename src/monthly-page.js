import { dateKey, STYLES, formatCentiseconds } from './domain.js';
import { latestSummaryMonth, isSummaryMonthAvailable, assertSummaryMonthAvailable, monthlySummary } from './monthly-summary.js';
import { CARD_DESIGNS, renderMonthCard, monthCardPNG, summaryMonthLabel, summaryComparison } from './monthly-card.js';

let selectedMonth = '';
let refreshShare = null;
const number = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value);
const designName = design => design[0].toUpperCase() + design.slice(1);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function monthRecords(records) {
  return `<section class="month-records" aria-labelledby="month-records-heading"><h2 id="month-records-heading">Рекорды месяца</h2>
    ${records.length ? `<ul class="month-record-list">${records.map(record => {
      const improvements = record.eventCount - (record.previousBestCs === null ? 1 : 0);
      const improvementLabel = improvements % 10 === 1 && improvements % 100 !== 11 ? 'улучшение'
        : improvements % 10 >= 2 && improvements % 10 <= 4 && !(improvements % 100 >= 12 && improvements % 100 <= 14) ? 'улучшения' : 'улучшений';
      const change = record.improvementCs === null ? 'Первый результат'
        : `${number(Math.floor(record.improvementCs / 100))},${String(record.improvementCs % 100).padStart(2, '0')} с`;
      return `<li><div class="month-record-discipline"><strong>${number(record.distance)} м · ${STYLES[record.style]}</strong>${record.technique ? `<span>${escapeHTML(record.technique)}</span>` : ''}</div>
        <dl class="month-record-values"><div><dt>Лучшее время</dt><dd>${formatCentiseconds(record.timeCs)}</dd></div><div><dt>Улучшение</dt><dd class="${record.improvementCs === null ? 'month-record-first' : ''}">${change}</dd>${record.eventCount > 1 ? `<small>${improvements} ${improvementLabel} за месяц</small>` : ''}</div></dl></li>`;
    }).join('')}</ul>` : '<p class="month-records-empty">В этом месяце новых личных рекордов пока нет. Каждая тренировка — часть вашей истории.</p>'}
  </section>`;
}

export function resetSummaryMonth() { selectedMonth = latestSummaryMonth(); }

export function monthSummaryPage(workouts, unreadable = false) {
  const now = dateKey();
  const latest = latestSummaryMonth(now);
  if (!isSummaryMonthAvailable(selectedMonth, now)) selectedMonth = latest;
  const data = monthlySummary(workouts, selectedMonth, now);
  const comparison = summaryComparison(data);
  const [year, month] = selectedMonth.split('-');
  const years = Array.from({ length: Number(latest.slice(0, 4)) - 1899 }, (_, i) => Number(latest.slice(0, 4)) - i);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
    .filter(key => isSummaryMonthAvailable(key, now));
  return `<section class="month-summary" aria-labelledby="summary-month-heading">
    <div class="month-summary-toolbar"><div class="month-summary-selectors">
      <label for="summary-month">Месяц<select id="summary-month">${months.map(key => `<option value="${key.slice(5)}" ${key === selectedMonth ? 'selected' : ''}>${new Date(`${key}-01T12:00:00`).toLocaleDateString('ru-RU', { month: 'long' })}</option>`).join('')}</select></label>
      <label for="summary-year">Год<select id="summary-year">${years.map(value => `<option value="${value}" ${String(value) === year ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
    </div><p>Итоги открываются в последний день месяца.<br>Последний доступный — ${summaryMonthLabel(latest)}.</p></div>
    <h2 id="summary-month-heading">${summaryMonthLabel(`${year}-${month}`)}</h2>
    <div class="month-summary-metrics"><div class="month-summary-distance"><p class="journal-label">МЕТРОВ В ВОДЕ</p><div><strong>${number(data.distance)}</strong><span>м</span></div>${comparison ? `<p>${comparison}</p>` : ''}</div>
    <dl class="month-summary-facts"><div><dt>Тренировок</dt><dd>${number(data.trainingCount)}</dd></div><div><dt>Средняя дистанция за тренировку</dt><dd>${number(data.averageDistance)} <small>м</small></dd></div><div><dt>Новых личных рекордов</dt><dd>${number(data.newRecords)}</dd></div></dl></div>
    ${!data.trainingCount ? '<p class="month-summary-empty">В этом месяце пока нет записей. Итоги с нулевыми показателями тоже можно сохранить.</p>' : ''}
    <div class="month-summary-share"><button class="button primary" id="share-month" ${unreadable ? 'disabled' : ''}>Поделиться итогами <span aria-hidden="true">↗</span></button><p>Три оформления вашей истории.<br>Карточка PNG · 1080 × 1350</p></div>
    ${monthRecords(data.records)}
  </section>`;
}

export function mountMonthSummary(root, { getWorkouts, getStorageError, render, openModal, toast }) {
  const monthInput = root.querySelector('#summary-month');
  const yearInput = root.querySelector('#summary-year');
  for (const input of [monthInput, yearInput]) input.addEventListener('change', () => {
    try {
      let candidate = `${yearInput.value}-${monthInput.value}`;
      const latest = latestSummaryMonth();
      // Switching to the latest year can require selecting its last available month.
      if (input === yearInput && yearInput.value === latest.slice(0, 4) && candidate > latest) candidate = latest;
      assertSummaryMonthAvailable(candidate);
      selectedMonth = candidate;
    } catch (error) { toast(error.message); }
    render(); root.querySelector(`#${input.id}`)?.focus();
  });
  root.querySelector('#share-month').addEventListener('click', () => {
    try {
      if (getStorageError()) throw new Error('Сначала восстановите дневник в разделе «Данные».');
      assertSummaryMonthAvailable(selectedMonth);
      showMonthDesigns(selectedMonth, getWorkouts, getStorageError, openModal);
    } catch (error) { toast(error.message); }
  });
  refreshShare?.();
}

function showMonthDesigns(month, getWorkouts, getStorageError, openModal) {
  openModal('Поделиться итогами', `<div class="month-share-content">
    <p class="month-share-subtitle">${summaryMonthLabel(month)} · выберите оформление</p>
    <div class="month-designs" role="group" aria-label="Оформление карточки">${CARD_DESIGNS.map(design => `<button type="button" class="month-design" data-month-design="${design}" aria-pressed="${design === 'paper'}"><canvas aria-hidden="true"></canvas><span>${designName(design)}</span></button>`).join('')}</div>
    <div class="month-card-preview" aria-busy="true"><canvas id="month-card-canvas" role="img" aria-label="Предпросмотр итогов месяца"></canvas></div>
  </div>
  <div class="month-share-footer">
    <p class="month-share-error" role="alert" hidden></p>
    <p>PNG · 1080 × 1350<br>Сохраняется на ваше устройство</p><button type="button" class="button primary" id="download-month" disabled>Скачать PNG</button>
    <p class="sr-only" id="month-card-announcement" role="status"></p>
  </div>`, true);
  const dialog = document.querySelector('#modal-root dialog');
  dialog.classList.add('monthly-share-modal');
  const preview = dialog.querySelector('#month-card-canvas');
  const previewWrap = dialog.querySelector('.month-card-preview');
  const errorBox = dialog.querySelector('.month-share-error');
  const download = dialog.querySelector('#download-month');
  const buttons = [...dialog.querySelectorAll('[data-month-design]')];
  const announcement = dialog.querySelector('#month-card-announcement');
  let design = 'paper';
  let ready = false;
  let busy = false;

  const showError = error => {
    errorBox.textContent = error.message || 'Не удалось подготовить карточку. Закройте окно и попробуйте ещё раз.';
    errorBox.hidden = false; download.disabled = true;
  };
  const refresh = () => {
    if (!dialog.isConnected || !ready || busy) return;
    try {
      if (getStorageError()) throw new Error('Не удалось прочитать дневник. Восстановите данные перед экспортом.');
      const data = monthlySummary(getWorkouts(), month);
      renderMonthCard(preview, data, design);
      for (const button of buttons) {
        const miniature = button.querySelector('canvas');
        // Miniatures use the same full-size renderer, then a compact backing canvas.
        const source = document.createElement('canvas');
        renderMonthCard(source, data, button.dataset.monthDesign);
        miniature.width = 216; miniature.height = 270;
        const ctx = miniature.getContext('2d');
        if (!ctx) throw new Error('Не удалось создать предпросмотр карточки.');
        ctx.drawImage(source, 0, 0, 216, 270);
        button.setAttribute('aria-pressed', String(button.dataset.monthDesign === design));
      }
      preview.setAttribute('aria-label', `${designName(design)}. ${summaryMonthLabel(month)}. Дистанция ${number(data.distance)} м, тренировок ${data.trainingCount}, в среднем ${number(data.averageDistance)} м, новых личных рекордов ${data.newRecords}.`);
      previewWrap.hidden = false; errorBox.hidden = true; download.disabled = false;
    } catch (error) { previewWrap.hidden = true; showError(error); }
    finally { previewWrap.setAttribute('aria-busy', 'false'); }
  };
  refreshShare = refresh;
  dialog.addEventListener('close', () => { if (refreshShare === refresh) refreshShare = null; });
  for (const button of buttons) button.addEventListener('click', () => {
    if (busy) return;
    design = button.dataset.monthDesign;
    refresh();
    announcement.textContent = `Выбрано оформление ${designName(design)}.`;
  });
  document.fonts.ready.then(() => { ready = true; refresh(); }).catch(showError);
  download.addEventListener('click', async () => {
    if (busy || !ready) return;
    busy = true; download.disabled = true; download.textContent = 'Готовим PNG…';
    buttons.forEach(button => { button.disabled = true; });
    try {
      if (getStorageError()) throw new Error('Не удалось прочитать дневник. Восстановите данные перед экспортом.');
      const { blob, filename } = await monthCardPNG(preview, getWorkouts(), month, design);
      if (!dialog.isConnected) return;
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = url; link.download = filename;
        document.body.append(link); link.click(); link.remove();
      } finally { setTimeout(() => URL.revokeObjectURL(url), 60000); }
      announcement.textContent = 'PNG подготовлен. Проверьте загрузки браузера.';
      errorBox.hidden = true;
    } catch (error) { showError(error); }
    finally {
      busy = false; download.textContent = 'Скачать PNG';
      buttons.forEach(button => { button.disabled = false; });
      download.disabled = !isSummaryMonthAvailable(month) || Boolean(getStorageError());
    }
  });
}
