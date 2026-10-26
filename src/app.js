import {
  STYLES, dateKey, monthKey, validateWorkout, summary, sortedWorkouts, formatTime,
  pace, personalBests, previousResult, dayNumber,
  recordKey, createDemo, parseBackup, backupJSON, totalDistance, totalDuration,
  exercisesOf, blockDistance, formatCentiseconds, timedResults, copyWorkout, templateWorkouts,
} from './domain.js';
import { statisticsData, dailyPaceSeries } from './statistics.js';
import { readWorkouts, writeWorkouts, STORAGE_KEY } from './storage.js';
import { editorHTML, mountEditor, newBlock } from './editor.js';
import { resultDraft, resultOverview, resultsEditorHTML, mountResultsEditor, withExerciseResults, discardHTML, protectEditor } from './results-editor.js';

const icons = {
  wave: '<path d="M2 9q5-5 10 0t10 0M2 16q5-5 10 0t10 0"/>',
  home: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  book: '<path d="M5 3h14a1 1 0 0 1 1 1v17H6a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2ZM3 17h17M7 3v14M11 7h5M11 11h4"/>',
  chart: '<path d="M4 3v17h17M8 15l4-5 4 2 5-7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14M14 7l5 5-5 5"/>',
  left: '<path d="m14 6-6 6 6 6"/>',
  right: '<path d="m10 6 6 6-6 6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18M8 15h2M14 15h2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  drop: '<path d="M12 3C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-12Z"/><path d="M9 15a3 3 0 0 0 3 3"/>',
  rhythm: '<path d="M2 12h4l3-6 5 12 3-6h5"/>',
  trophy: '<path d="M8 3h8v7a4 4 0 0 1-8 0ZM8 5H4v3a4 4 0 0 0 4 4M16 5h4v3a4 4 0 0 1-4 4M12 14v5M8 21h8M10 19h4"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6ZM8 12l3 3 5-6"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="3" fill="currentColor" stroke="none"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14ZM13 20h8"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
};
const icon = (name, extra = '') => `<svg class="icon ${extra}" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.wave}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const number = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value);
const plural = (n, one, few, many) => n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14) ? few : many;
const dateLabel = (key, options = { day: 'numeric', month: 'long' }) => new Date(`${key}T12:00:00`).toLocaleDateString('ru-RU', options);
const monthLabel = key => dateLabel(`${key}-01`, { month: 'long', year: 'numeric' }).replace(' г.', '');
const distanceLabel = value => value === null ? 'Без дистанции' : `${number(value)} м`;
const app = document.querySelector('#app');
const modalRoot = document.querySelector('#modal-root');
let today = dateKey();
let workouts = [];
let storageError = '';
try { workouts = readWorkouts(localStorage); }
catch { storageError = 'Не удалось прочитать сохранённый дневник. Исходные данные не изменены. Откройте «Данные» для восстановления.'; }
let view = ['dashboard', 'diary', 'stats'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard';
let calendarMonth = today.slice(0, 7);
let demo = false;
let realWorkouts = [];

let filterMonth = '';
let filterSearch = '';
let statsPeriod = 'all';
let selectedPace = '';
let toastTimer;
let lastFocus;
let pendingImport = null;
let activeEditor = null;
const nav = [['dashboard', 'home', 'Обзор'], ['diary', 'book', 'Дневник'], ['stats', 'chart', 'Статистика']];

function toast(message) {
  const element = document.querySelector('#toast');
  element.textContent = message;
  element.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('visible'), 4500);
}
function persist(next) {
  if (!demo) {
    if (storageError) throw new Error('Сначала восстановите дневник в разделе «Данные», чтобы не перезаписать исходные записи.');
    writeWorkouts(localStorage, next);
  }
  workouts = next;
}
function emptyState(title, text, action = 'add', label = 'Добавить тренировку', symbol = 'wave') {
  return `<div class="empty-state"><span class="empty-symbol">${icon(symbol)}</span><h3>${title}</h3><p>${text}</p>${action ? `<button class="button secondary small" data-action="${action}">${icon(action === 'add' ? 'plus' : 'arrow')}${label}</button>` : ''}</div>`;
}
function regularityText(stats) {
  // summary uses unique local calendar dates and excludes future visits.
  if (stats.lastDate === today) return {
    title: 'Сегодня вы уже были в воде',
    text: stats.average === null
      ? 'Начало положено. После второго дня в бассейне мы рассчитаем ваш привычный интервал.'
      : `В среднем вы возвращаетесь в бассейн каждые ${number(stats.average)} дн. Продолжайте так, как комфортно вам.`,
    tag: 'Без спешки и давления', image: 'rhythm-today.png', warm: false,
  };
  if (stats.average === null || stats.elapsed === null || stats.elapsed < Math.ceil(stats.average)) return null;
  return {
    title: 'Кажется, пора поплавать!',
    text: `Ваш привычный интервал — ${number(stats.average)} дн. Возможно, самое время запланировать встречу с водой.`,
    tag: 'Вода подождёт вас', image: 'rhythm-due.png', warm: true,
  };
}
function statCard(label, value, unit, caption, symbol, accent = false) {
  return `<article class="stat-card ${accent ? 'accent' : ''}"><div class="stat-label">${label}${icon(symbol)}</div><div class="stat-value">${value}<span>${unit}</span></div><p>${caption}</p></article>`;
}
function render() {
  const stats = summary(workouts, today);
  const titles = { dashboard: ['МОЁ ПРОСТРАНСТВО', 'Хороший день для воды'], diary: ['МОЯ ИСТОРИЯ', 'Дневник тренировок'], stats: ['МОЙ ПРОГРЕСС', 'Каждый заплыв имеет значение'] };
  app.innerHTML = `
    <a class="skip-link" href="#main">К содержимому</a>
    <aside class="sidebar">
      <a class="brand" href="#dashboard" aria-label="Нырок — на главную"><img class="brand-symbol" src="/src/nyrok-logo.svg" width="42" height="42" alt=""><span>нырок<span class="brand-dot">.</span><small>дневник плавания</small></span></a>
      <div class="sidebar-label">ВАШ ДНЕВНИК</div>
      <nav aria-label="Основная навигация">${nav.map(([key, symbol, label]) => `<a href="#${key}" class="nav-item ${view === key ? 'active' : ''}" ${view === key ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span>${view === key ? '<span class="nav-dot"></span>' : ''}</a>`).join('')}</nav>
      <button class="button primary sidebar-add" data-action="add">${icon('plus')}<span>Добавить тренировку</span></button>
      <div class="sidebar-note"><div class="small-waves">${icon('wave')}</div><p>Не быстрее других.<br>Ближе к себе.</p><span>Плывите в своём ритме</span></div>
      <div class="sidebar-bottom"><button class="nav-item" data-action="settings">${icon('settings')}<span>Данные и настройки</span></button><div class="local-label"><span class="status-dot"></span>Хранится на этом устройстве</div></div>
    </aside>
    <main id="main" class="${view === 'dashboard' ? 'journal-page' : view === 'diary' ? 'diary-page' : 'stats-page'}" tabindex="-1">
      ${demo ? `<div class="demo-banner"><span>Вы смотрите пример. Эти записи не сохраняются в вашем дневнике.</span><button data-action="demo-off">Вернуться к моим данным ${icon('close')}</button></div>` : ''}
      ${storageError ? `<div class="error-banner" role="alert">${esc(storageError)} <button data-action="settings">Открыть данные</button></div>` : ''}
      ${view === 'dashboard' ? journalHeader() : `<header class="page-header"><div><p class="eyebrow">${titles[view][0]}</p><h1>${titles[view][1]}<span class="title-dot">.</span></h1><p class="header-date">${view === 'diary' ? 'Место для больших дистанций и маленьких побед.' : 'Замечайте изменения, наслаждайтесь процессом.'}</p></div><button class="button primary" data-action="add">${icon('plus')}<span>Добавить тренировку</span></button></header>`}
      ${view === 'dashboard' ? dashboard(stats) : view === 'diary' ? diary() : statistics()}
      <footer class="page-footer"><span>НЫРОК <span class="footer-dot">•</span> В своём ритме</span><span>${icon('shield')} Только вы и ваша история</span></footer>
    </main>
    <nav class="mobile-nav" aria-label="Мобильная навигация">${nav.map(([key, symbol, label]) => `<a href="#${key}" class="${view === key ? 'active' : ''}" ${view === key ? 'aria-current="page"' : ''}>${icon(symbol)}${label}</a>`).join('')}<button data-action="settings">${icon('settings')}Данные</button></nav>`;
  if (view === 'stats') mountPaceTooltip();
}
function journalHeader() {
  return `<header class="journal-header">
    <div class="journal-hero">
      <div class="journal-hero-copy"><p class="journal-label">Моё пространство</p><h1>Хороший день<br>для <em>воды.</em></h1><p class="journal-greeting">Привет! Сегодня ${dateLabel(today, { weekday: 'long', day: 'numeric', month: 'long' })}.</p></div>
      <figure class="journal-poster" aria-hidden="true">
        <img src="/src/hero-swim.png" width="523" height="291" alt="">
      </figure>
      <div class="journal-header-actions"><button class="button primary" data-action="add">${icon('plus')}<span>Добавить тренировку</span></button><p aria-hidden="true">ВДОХ.<br>ВЫДОХ.<br>ПЛЫВЁМ.</p></div>
    </div>
  </header>`;
}
function dashboard(stats) {
  const rhythm = regularityText(stats);
  return `<section class="journal-month" aria-labelledby="month-heading">
      <div class="journal-section-heading"><h2 id="month-heading">Этот месяц <span>/ ${dateLabel(`${today.slice(0, 7)}-01`, { month: 'long' })}</span></h2><a href="#stats" class="text-link">Вся статистика ${icon('arrow')}</a></div>
      <div class="journal-metrics">
        <div class="journal-distance"><span class="journal-label">Дистанция за месяц</span><div><strong>${number(stats.monthDistance / 1000)}</strong><span>км</span></div><p>Каждый метр имеет значение</p></div>
        <dl class="journal-facts">
          <div><dt>${icon('wave')}<span>Тренировок за месяц</span></dt><dd>${number(stats.monthCount)}</dd></div>
          <div><dt>${icon('clock')}<span>Последний раз</span></dt><dd>${stats.lastDate ? dateLabel(stats.lastDate, { day: 'numeric', month: 'short' }).replace('.', '') : '—'}</dd></div>
          <div><dt>${icon('rhythm')}<span>Средний интервал</span></dt><dd>${stats.average === null ? '—' : `${number(stats.average)} <small>дн.</small>`}</dd></div>
        </dl>
        <div class="journal-distance-art" aria-hidden="true"><img src="/src/month-water.png" width="430" height="290" alt=""></div>
      </div>
    </section>
    <section class="journal-lower${rhythm ? '' : ' without-rhythm'}" aria-label="Календарь и регулярность">
      <article class="journal-calendar"><div class="journal-section-heading"><h2>Дни в воде</h2><span class="legend"><i></i> Тренировка</span></div>${calendar()}</article>
      ${rhythm ? `<article class="journal-rhythm${rhythm.warm ? ' journal-rhythm--warm' : ''}"><div class="journal-rhythm-copy"><div class="journal-rhythm-heading"><span class="journal-label">Регулярность</span>${icon('wave')}</div><p class="journal-rhythm-tag">${rhythm.tag}</p><h2>${rhythm.title}</h2><p class="journal-rhythm-text">${rhythm.text}</p></div><img class="journal-rhythm-art" src="/src/${rhythm.image}" width="1806" height="871" alt="" aria-hidden="true"></article>` : ''}
    </section>
    <section class="journal-recent" aria-labelledby="recent-heading"><div class="journal-section-heading"><h2 id="recent-heading">Последние тренировки</h2><a class="text-link" href="#diary">Весь дневник ${icon('arrow')}</a></div>${workouts.length ? `<div class="recent-list">${sortedWorkouts(workouts).slice(0, 3).map(w => workoutRow(w, true)).join('')}</div>` : emptyState('Здесь начинается ваша история', 'Запишите посещение бассейна — даже если не считали метры и минуты.', 'add', 'Записать первый заплыв')}</section>
    ${!workouts.length && !demo ? `<div class="demo-invite"><span>Хотите посмотреть, как оживает дневник?</span><button class="text-link" data-action="demo-on">Открыть пример ${icon('arrow')}</button></div>` : ''}`;
}
function calendar() {
  const first = new Date(`${calendarMonth}-01T12:00:00`);
  const leading = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const counts = new Map();
  workouts.filter(w => w.date.startsWith(calendarMonth)).forEach(w => counts.set(w.date, (counts.get(w.date) || 0) + 1));


  return `<div class="calendar-toolbar"><h3>${monthLabel(calendarMonth)}</h3><div><button class="calendar-today" data-action="calendar-today">Сегодня</button><button class="icon-button" data-action="prev-month" aria-label="Предыдущий месяц">${icon('left')}</button><button class="icon-button" data-action="next-month" aria-label="Следующий месяц">${icon('right')}</button></div></div>
    <div class="calendar-grid"><div class="week-label">Пн</div><div class="week-label">Вт</div><div class="week-label">Ср</div><div class="week-label">Чт</div><div class="week-label">Пт</div><div class="week-label weekend">Сб</div><div class="week-label weekend">Вс</div>
    ${Array.from({ length: leading }, () => '<span class="calendar-spacer"></span>').join('')}
    ${Array.from({ length: days }, (_, i) => {
      const key = `${calendarMonth}-${String(i + 1).padStart(2, '0')}`;
      const count = counts.get(key) || 0;
      return `<button class="day ${count ? 'has-workout' : ''} ${key === today ? 'today' : ''} ${key > today ? 'future' : ''}" data-action="day" data-date="${key}" ${key === today ? 'aria-current="date"' : ''} aria-label="${dateLabel(key, { day: 'numeric', month: 'long', year: 'numeric' })}, ${count} ${plural(count, 'тренировка', 'тренировки', 'тренировок')}"><span>${i + 1}</span>${count ? `<span class="day-dots">${Array.from({ length: Math.min(count, 3) }, () => '<i></i>').join('')}</span>` : ''}</button>`;
    }).join('')}</div><div class="calendar-footer"><span>${counts.size} ${plural(counts.size, 'день', 'дня', 'дней')} в воде в этом месяце</span><span>Ваше время для себя</span></div>`;
}
function workoutRow(w, compact = false) {
  const isTimed = exercisesOf(w).some(exercise => exercise.results.length);
  const best = isTimed && personalBests(workouts).some(item => item.id === w.id);
  const duration = totalDuration(w);
  const distance = totalDistance(w);
  const row = `<button class="workout-row ${compact ? 'compact' : ''}" data-action="detail" data-id="${esc(w.id)}">
    ${compact ? `<span class="workout-symbol ${isTimed ? 'timed' : ''}">${icon(isTimed ? 'clock' : 'wave')}</span>` : `<time class="entry-date" datetime="${esc(w.date)}" aria-label="${dateLabel(w.date, { day: 'numeric', month: 'long', year: 'numeric' })}"><span class="entry-day">${w.date.slice(8)}</span><span class="entry-date-caption"><span>${dateLabel(w.date, { month: 'short' }).replace('.', '')}</span><span>${dateLabel(w.date, { weekday: 'short' })}</span></span></time>`}
    <span class="workout-description"><span class="workout-title">${esc(w.title || (w.style ? STYLES[w.style] : 'Тренировка'))}${best ? `<span class="record-marker" aria-label="Личный рекорд">${icon('trophy')}</span>` : ''}</span><span class="workout-subtitle">${compact ? `${dateLabel(w.date)} · ` : ''}${exercisesOf(w).length} ${plural(exercisesOf(w).length, 'задание', 'задания', 'заданий')}</span>${!compact && w.comment ? `<span class="workout-comment">${esc(w.comment)}</span>` : ''}</span>
    <span class="workout-numbers${!compact && distance === null ? ' unknown-distance' : ''}"><strong>${!compact && distance !== null ? `${number(distance)} <small>м</small>` : distanceLabel(distance)}</strong><span>${duration !== null ? `${formatCentiseconds(w.durationCs)} мин:сек` : 'В своём ритме'}</span></span>${icon('right', 'row-arrow')}</button>`;
  return compact ? row : `<div class="diary-entry">${row}${exercisesOf(w).length ? `<details class="exercise-disclosure"><summary>Задания (${exercisesOf(w).length})</summary>${exerciseList(w)}</details>` : ''}</div>`;
}
function diary() {
  const months = [...new Set(workouts.map(w => w.date.slice(0, 7)))].sort().reverse();
  const items = sortedWorkouts(workouts.filter(w =>

    (!filterMonth || w.date.startsWith(filterMonth)) &&
    (!filterSearch || `${w.title} ${w.comment} ${STYLES[w.style] || ''} ${totalDistance(w) || ''} ${exercisesOf(w).map(e => `${e.description} ${e.technique} ${STYLES[e.style]} ${e.distance}`).join(' ')}`.toLocaleLowerCase('ru').includes(filterSearch.toLocaleLowerCase('ru')))));
  const groups = new Map();
  items.forEach(w => { const key = w.date.slice(0, 7); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(w); });
  return `<div class="diary-toolbar"><div class="diary-inputs"><label class="search-box">${icon('search')}<input id="diary-search" type="search" placeholder="Найти в дневнике" aria-label="Поиск по комментариям, стилю и дистанции" maxlength="200" value="${esc(filterSearch)}"></label><select id="diary-month" aria-label="Месяц тренировок"><option value="">Все месяцы</option>${months.map(key => `<option value="${key}" ${filterMonth === key ? 'selected' : ''}>${monthLabel(key)}</option>`).join('')}</select></div></div>
    <div class="diary-count">${items.length} ${plural(items.length, 'запись', 'записи', 'записей')} <span>Всё начинается с одного заплыва</span></div>
    ${items.length ? [...groups].map(([key, entries]) => `<section class="diary-group"><div class="section-intro"><h2>${monthLabel(key)}</h2><span class="muted">${number(entries.reduce((sum, w) => sum + (totalDistance(w) || 0), 0))} м</span></div><div class="panel diary-list">${entries.map(w => workoutRow(w)).join('')}</div></section>`).join('') : `<section class="panel">${emptyState(workouts.length ? 'Таких записей пока нет' : 'Ваша история начинается здесь', workouts.length ? 'Попробуйте другой месяц или поисковый запрос.' : 'Добавляйте тренировки с результатами или просто отмечайте дни, проведённые в бассейне.', workouts.length ? 'reset-filters' : 'add', workouts.length ? 'Сбросить фильтры' : 'Добавить тренировку', 'book')}</section>`}`;
}
function barChart(series, metric, label, unit, daily = false) {
  const max = Math.max(...series.map(item => item[metric]), 1);
  const current = item => item.end ? item.key <= today && item.end >= today : daily ? item.key === today : item.key === today.slice(0, 7);
  const axisLabel = item => item.end ? `${dateLabel(item.key, { day: 'numeric', month: 'short' }).replace('.', '')}<br>– ${dateLabel(item.end, { day: 'numeric', month: 'short' }).replace('.', '')}`
    : daily ? `${dateLabel(item.key, { weekday: 'short' })}<br>${dateLabel(item.key, { day: 'numeric' })}`
    : dateLabel(`${item.key}-01`, { month: 'short' }).replace('.', '');
  return `<div class="bar-chart" role="img" aria-label="${label}: ${series.map(item => `${item.key}${item.end ? ' — ' + item.end : ''} — ${item.future ? 'будущий период, нет данных' : `${item[metric]} ${unit}`}`).join('; ')}"><div class="chart-gridlines"><span>${number(max)}</span><span>${number(max / 2)}</span><span>0</span></div><div class="bars">${series.map(item => `<div class="bar-column${item.future ? ' future' : ''}"><span class="bar-number">${item.future ? '—' : number(item[metric])}</span><div class="bar-track"><div class="bar ${current(item) ? 'current' : ''}" style="height:${item[metric] ? Math.max(2, item[metric] / max * 100) : 0}%"></div></div><span class="bar-label">${axisLabel(item)}</span></div>`).join('')}</div></div>`;
}
function statistics() {
  const { selected, stats, chartSeries, records } = statisticsData(workouts, statsPeriod, today);
  if (!records.some(w => recordKey(w) === selectedPace)) selectedPace = records[0] ? recordKey(records[0]) : '';
  const daily = statsPeriod === 'week';
  const chartRange = daily ? 'Текущая неделя · будущие дни без данных'
    : statsPeriod === 'month' ? `${monthLabel(today.slice(0, 7))} · полные недели пн–вс` : '6 последних календарных месяцев';
  return `<div class="stats-period"><div class="segmented" role="group" aria-label="Период статистики">${[['week', 'Неделя'], ['month', 'Месяц'], ['all', 'Всё время']].map(([key, label]) => `<button data-action="stats-period" data-value="${key}" class="${statsPeriod === key ? 'selected' : ''}" aria-pressed="${statsPeriod === key}">${label}</button>`).join('')}</div><p>По ${dateLabel(today, { day: 'numeric', month: 'long', year: 'numeric' })} включительно</p></div>
    <section class="stats-overview" aria-label="Общие показатели за выбранный период">
    <article class="stats-distance"><h2>Вся дистанция</h2><div class="stats-distance-value">${number(stats.distance / 1000)}<span>км</span></div><p>${stats.unknownDistance ? `${stats.unknownDistance} ${plural(stats.unknownDistance, 'запись', 'записи', 'записей')} без дистанции` : 'Каждый известный метр'}</p></article>
    <div class="stats-facts">
      ${statCard('Всего тренировок', number(stats.total), '', `${stats.days} ${plural(stats.days, 'день', 'дня', 'дней')} посещения бассейна`, 'wave')}
      ${statCard('Средний перерыв', stats.average === null ? '—' : number(stats.average), stats.average === null ? '' : 'дн.', 'Между тренировочными днями', 'rhythm')}
      ${statCard('Средняя дистанция за тренировку', number(stats.averageDistance), 'м', 'Дистанция / число тренировок', 'wave')}
    </div>
    </section>
    <section class="charts-grid"><article class="panel chart-panel"><div class="panel-heading"><div><p class="eyebrow">РЕГУЛЯРНОСТЬ</p><h2>Встречи с водой</h2></div></div><p class="chart-description">Количество тренировок · ${chartRange}</p>${barChart(chartSeries, 'count', 'Количество тренировок', 'тренировок', daily)}</article>
    <article class="panel chart-panel"><div class="panel-heading"><div><p class="eyebrow">ДИСТАНЦИЯ</p><h2>Метр за метром</h2></div><span class="chart-unit">метры</span></div><p class="chart-description">Известная дистанция · ${chartRange}</p>${barChart(chartSeries, 'distance', daily ? 'Дистанция по дням' : statsPeriod === 'month' ? 'Дистанция по неделям месяца' : 'Дистанция по месяцам', 'м', daily)}</article></section>
    <article class="panel pace-panel"><div class="panel-heading"><div><p class="eyebrow">ЗАПЛЫВЫ НА ВРЕМЯ</p><h2>Как меняется ваш темп</h2></div>${records.length ? `<select id="pace-selection" aria-label="Дистанция, стиль и техника для графика темпа">${records.map(w => `<option value="${esc(recordKey(w))}" ${recordKey(w) === selectedPace ? 'selected' : ''}>${w.distance} м · ${STYLES[w.style]}${w.technique ? ' · ' + esc(w.technique) : ''}</option>`).join('')}</select>` : ''}</div><p class="chart-description">Темп на 100 м · лучший результат каждого дня за выбранный период. Дистанции, стили и техники учитываются отдельно. Нажмите на точку, чтобы увидеть время.</p>${records.length ? paceChart(dailyPaceSeries(selected, selectedPace)) : emptyState('В этом периоде пока нет результатов', 'Выберите другой период или запишите время заплыва. Результаты сравниваются на одинаковой дистанции, в одном стиле и с одинаковым уточнением техники.', 'add-timed', 'Записать результат', 'chart')}</article>
    <article class="panel records-panel"><div class="panel-heading"><div><p class="eyebrow">ЛИЧНЫЕ ДОСТИЖЕНИЯ</p><h2>Ваши лучшие заплывы</h2></div><span class="record-badge">${icon('trophy')} Маленькие победы</span></div>${records.length ? `<div class="table-wrap"><table><thead><tr><th>Дистанция и стиль</th><th>Результат</th><th>Темп / 100 м</th><th>Дата</th><th><span class="sr-only">Подробнее</span></th></tr></thead><tbody>${records.map(w => `<tr><td><strong>${w.distance} м</strong><span class="table-style">${STYLES[w.style]}${w.technique ? ' · ' + esc(w.technique) : ''}</span></td><td class="best-time">${formatCentiseconds(w.timeCs)}</td><td>${formatCentiseconds(pace(w) * 100)}</td><td>${dateLabel(w.date, { day: 'numeric', month: 'short', year: 'numeric' })}</td><td><button class="icon-button" data-action="detail" data-id="${esc(w.id)}" aria-label="Открыть рекорд ${w.distance} м ${STYLES[w.style]}">${icon('arrow')}</button></td></tr>`).join('')}</tbody></table></div>` : `<p class="records-empty">Здесь появятся лучшие результаты для каждой дистанции и стиля. Соревнуйтесь только с собой — и только если хочется.</p>`}</article>`;
}
function paceChart(series) {
  if (!series.length) return '<p class="records-empty">В этом периоде пока нет результатов.</p>';
  const width = 820, height = 190, pad = 35;
  const min = Math.max(0, Math.floor(Math.min(...series.map(w => w.pace)) / 10) * 10 - 10);
  const max = Math.ceil(Math.max(...series.map(w => w.pace)) / 10) * 10 + 10;
  const firstDay = dayNumber(series[0].date), lastDay = dayNumber(series.at(-1).date);
  const x = date => firstDay === lastDay ? width / 2 : 66 + (dayNumber(date) - firstDay) / (lastDay - firstDay) * (width - 100);
  const y = value => pad + (max - value) / (max - min) * (height - pad * 2);
  // Keep calendar spacing, but omit crowded labels; every date remains in the tooltip/table.
  const labels = new Set([0, series.length - 1]);
  let previousLabelX = x(series[0].date);
  series.forEach((w, i) => {
    const position = x(w.date);
    if (position - previousLabelX >= 90 && x(series.at(-1).date) - position >= 90) {
      labels.add(i); previousLabelX = position;
    }
  });
  return `${series.length === 1 ? '<p class="single-point-note">Первая точка есть. После такого заплыва в другой день появится линия прогресса.</p>' : ''}
    <div class="pace-chart"><svg viewBox="0 0 ${width} ${height + 30}" role="group" aria-label="Динамика темпа: лучший результат за каждый тренировочный день">
    ${[min, (min + max) / 2, max].map(value => `<line x1="58" x2="${width - 20}" y1="${y(value)}" y2="${y(value)}" stroke="#e8ecec" stroke-dasharray="4 5"/><text x="0" y="${y(value) + 4}" fill="#6b7d86" font-size="12">${formatTime(value)}</text>`).join('')}
    ${series.length > 1 ? `<polyline points="${series.map(w => `${x(w.date)},${y(w.pace)}`).join(' ')}" fill="none" stroke="#667f91" stroke-width="3" stroke-linejoin="round"/>` : ''}
    ${series.map((w, i) => {
      const date = dateLabel(w.date, { day: 'numeric', month: 'long', year: 'numeric' });
      const time = formatCentiseconds(w.timeCs);
      const label = `${w.distance} м · ${STYLES[w.style]}${w.technique ? ' · ' + w.technique : ''}`;
      return `<g class="pace-point${i === series.length - 1 ? ' latest' : ''}" tabindex="0" role="button" aria-label="${esc(`${date}: лучшее время ${time}, ${label}`)}" data-pace-date="${esc(date)}" data-pace-time="${time}" data-pace-label="${esc(label)}"><circle class="pace-hit" cx="${x(w.date)}" cy="${y(w.pace)}" r="20"/><circle class="pace-dot" cx="${x(w.date)}" cy="${y(w.pace)}" r="5" stroke-width="2"/></g>${labels.has(i) ? `<text x="${x(w.date)}" y="${height + 14}" text-anchor="middle" font-size="12">${dateLabel(w.date, { day: 'numeric', month: 'short' })}</text>` : ''}`;
    }).join('')}
    </svg><div id="pace-tooltip" class="pace-tooltip" role="tooltip" hidden></div></div><details class="chart-data"><summary>Лучшие результаты по дням (${series.length})</summary><div class="table-wrap"><table><thead><tr><th>Дата</th><th>Результат</th><th>Темп / 100 м</th></tr></thead><tbody>${series.map(w => `<tr><td>${dateLabel(w.date, { day: 'numeric', month: 'long', year: 'numeric' })}</td><td>${formatCentiseconds(w.timeCs)}</td><td>${formatCentiseconds(w.pace * 100)}</td></tr>`).join('')}</tbody></table></div></details>`;
}
function hidePaceTooltip() {
  const tooltip = document.querySelector('#pace-tooltip');
  if (tooltip) tooltip.hidden = true;
  document.querySelector('.pace-point[aria-describedby]')?.removeAttribute('aria-describedby');
}
function mountPaceTooltip() {
  const tooltip = document.querySelector('#pace-tooltip');
  if (!tooltip) return;
  const show = point => {
    hidePaceTooltip();
    tooltip.innerHTML = `<span>${esc(point.dataset.paceDate)}</span><strong>${point.dataset.paceTime}</strong><span>Лучшее время · ${esc(point.dataset.paceLabel)}</span>`;
    tooltip.hidden = false;
    point.setAttribute('aria-describedby', tooltip.id);
    const anchor = point.querySelector('.pace-dot').getBoundingClientRect();
    const box = tooltip.getBoundingClientRect();
    const left = Math.max(12, Math.min(anchor.left + anchor.width / 2 - box.width / 2, document.documentElement.clientWidth - box.width - 12));
    const preferredTop = anchor.top >= box.height + 20 ? anchor.top - box.height - 10 : anchor.bottom + 10;
    const top = Math.max(12, Math.min(preferredTop, document.documentElement.clientHeight - box.height - 12));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };
  for (const point of document.querySelectorAll('.pace-point')) {
    point.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') show(point); });
    point.addEventListener('pointerleave', event => {
      if (document.activeElement !== point && !tooltip.contains(event.relatedTarget)) hidePaceTooltip();
    });
    point.addEventListener('focus', () => show(point));
    point.addEventListener('blur', hidePaceTooltip);
    point.addEventListener('click', () => show(point));
    point.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(point); }
      else if (event.key === 'Escape') { event.preventDefault(); hidePaceTooltip(); }
    });
  }
  tooltip.addEventListener('pointerleave', () => {
    if (!document.activeElement?.classList.contains('pace-point')) hidePaceTooltip();
  });
}
function openModal(title, body, wide = false) {
  activeEditor?.dispose(); activeEditor = null;
  lastFocus = document.activeElement;
  modalRoot.innerHTML = `<dialog class="modal ${wide ? 'wide' : ''}" aria-labelledby="modal-title"><div class="modal-heading"><h2 id="modal-title">${title}</h2><button class="icon-button" data-action="close-modal" aria-label="Закрыть окно">${icon('close')}</button></div>${body}</dialog>`;
  const dialog = modalRoot.querySelector('dialog');
  document.body.classList.add('modal-open');
  dialog.showModal();
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeModal(); });
}
function closeModal(force = false) {
  if (!force && activeEditor && !activeEditor.canClose()) return false;
  activeEditor?.dispose(); activeEditor = null;
  modalRoot.querySelector('dialog')?.close();
  modalRoot.innerHTML = '';
  document.body.classList.remove('modal-open');
  if (lastFocus?.isConnected) lastFocus.focus();
  return true;
}
function showCreateChoice(initialDate = today, timed = false) {
  openModal('Добавить тренировку', `<p class="modal-subtitle">Начните с пустой формы или возьмите за основу знакомый план.</p>
    <div class="creation-options">
      <button class="button secondary creation-option" id="create-empty">${icon('plus')}<span>Новая тренировка<small>Пустая форма с возможностью добавить задания</small></span></button>
      <button class="button secondary creation-option" id="create-template">${icon('book')}<span>На основе предыдущей<small>Выбрать тренировку и скопировать её план</small></span></button>
    </div>`);
  document.querySelector('#create-empty').addEventListener('click', () => {
    const seed = timed ? { blocks: [newBlock()] } : null;
    showForm(null, initialDate, seed);
  });
  document.querySelector('#create-template').addEventListener('click', showTemplatePicker);
}
function showTemplatePicker() {
  openModal('На основе предыдущей', `<p class="modal-subtitle">Перенесём название и задания. Дата будет сегодняшней, результаты и самочувствие останутся в исходной записи.</p>
    <label class="search-box template-search">${icon('search')}<input id="template-search" type="search" placeholder="Найти по названию" aria-label="Поиск тренировки по названию" maxlength="200"></label>
    <div id="template-results" class="template-results"></div>`);
  const renderTemplates = query => {
    const items = templateWorkouts(workouts, query);
    document.querySelector('#template-results').innerHTML = items.length ? items.map(w => `<button class="template-row" data-action="copy-template" data-id="${esc(w.id)}"><span><strong>${esc(w.title || 'Без названия')}</strong><small>${dateLabel(w.date, { day: 'numeric', month: 'long', year: 'numeric' })}</small></span><span><strong>${distanceLabel(totalDistance(w))}</strong><small>${exercisesOf(w).length} ${plural(exercisesOf(w).length, 'задание', 'задания', 'заданий')}</small></span>${icon('right')}</button>`).join('') : `<p class="records-empty">${workouts.length ? 'Тренировки с таким названием не найдены.' : 'Сохранённых тренировок пока нет. Начните с новой тренировки.'}</p>`;
  };
  renderTemplates('');
  document.querySelector('#template-search').addEventListener('input', event => renderTemplates(event.target.value));
}
function showForm(existing = null, initialDate = today, seed = null) {
  const w = structuredClone(existing || {
    id: crypto.randomUUID(), date: initialDate, title: '', status: 'COMPLETED', blocks: [],
    distance: null, durationCs: null, style: '', comment: '', createdAt: new Date().toISOString(), ...seed,
  });
  const baseline = existing ? JSON.stringify(existing) : null;
  openModal(existing ? 'Редактировать тренировку' : 'Новая тренировка', editorHTML(w, { editing: Boolean(existing) }), true);
  activeEditor = mountEditor(w, {
    today: () => today,
    persisted: Boolean(existing),
    onDiscard: () => closeModal(true),
    onSave: candidate => {
      if (existing && JSON.stringify(workouts.find(item => item.id === existing.id)) !== baseline) throw new Error('Эта запись изменилась в другой вкладке. Закройте окно и откройте запись заново.');
      persist(existing ? workouts.map(item => item.id === candidate.id ? candidate : item) : [...workouts, candidate]);
      closeModal(true); render(); toast('Тренировка сохранена');
    },
  });
}
function exerciseList(w, comparisons = false) {
  const records = personalBests(workouts);
  const swims = comparisons ? timedResults([w]) : [];
  return w.blocks.map(b => `<section class="program-block compact-program"><h3>${esc(b.title)} · ${b.rounds} ${plural(b.rounds, 'круг', 'круга', 'кругов')} · ${blockDistance(b)} м</h3><div class="diary-exercises">${b.exercises.map(e => {
    const overview = resultOverview(resultDraft(e), b.rounds);
    const best = records.some(r => r.id === w.id && r.exerciseId === e.id);
    const timeLabel = overview.best === null ? '' : overview.best < 6000 ? `${(overview.best / 100).toFixed(2)} с` : formatCentiseconds(overview.best);
    const countLabel = b.rounds === 1 ? '' : e.resultMode === 'best' ? (overview.count ? 'Круг неизвестен' : '') : `${overview.count} из ${b.rounds} результатов`;
    const history = comparisons ? e.results.map(r => {
      const swim = swims.find(s => s.resultId === r.id);
      const previous = swim ? previousResult(workouts, swim) : null;
      const delta = previous ? r.timeCs - previous.timeCs : null;
      return `<li>${r.round === null ? 'Круг неизвестен' : `Круг ${r.round}`} · ${formatCentiseconds(r.timeCs)}${previous ? `<p>${delta < 0 ? 'Быстрее' : delta > 0 ? 'Дольше' : 'Без изменения'}${delta ? ' на ' + formatCentiseconds(Math.abs(delta)) : ''}. Предыдущий: ${formatCentiseconds(previous.timeCs)}.</p>` : ''}</li>`;
    }).join('') : '';
    return `<div class="diary-exercise"><button class="exercise-quick-button" data-action="quick-results" data-id="${esc(w.id)}" data-exercise-id="${esc(e.id)}" aria-label="Времена: ${e.distance} м ${STYLES[e.style]}${e.technique ? ' ' + esc(e.technique) : ''}${timeLabel ? ', ' + esc(timeLabel) : ''}"><span class="exercise-quick-info"><strong>${e.distance} м · ${STYLES[e.style]}${e.technique ? ' · ' + esc(e.technique) : ''}</strong>${e.description ? `<span class="exercise-description-caption">${esc(e.description)}</span>` : ''}${countLabel ? `<small>${esc(countLabel)}</small>` : ''}</span><span class="exercise-quick-time" ${overview.best === null ? '' : 'title="Лучшее время в этом упражнении"'}>${best ? `<span class="record-marker" aria-label="Личный рекорд">${icon('trophy')}</span>` : ''}${timeLabel ? `<span>${esc(timeLabel)}</span>` : ''}${icon('clock')}</span></button>
      ${comparisons && (history || e.plannedTimeCs || e.restAfterCs || e.legacy?.durationCs) ? `<details class="exercise-extra"><summary>Подробности</summary>${e.plannedTimeCs ? `<p>План: ${formatCentiseconds(e.plannedTimeCs)}</p>` : ''}${e.restAfterCs ? `<p>Отдых после упражнения: ${formatCentiseconds(e.restAfterCs)} (кроме последнего в круге)</p>` : ''}${e.legacy?.durationCs ? `<p>Старая продолжительность: ${formatCentiseconds(e.legacy.durationCs)}</p>` : ''}${history ? `<ul class="exercise-list">${history}</ul>` : ''}</details>` : ''}</div>`;
  }).join('')}</div>${comparisons && (b.restBetweenCs || b.restAfterCs) ? `<details class="exercise-extra"><summary>Отдых в блоке</summary>${b.rounds > 1 && b.restBetweenCs ? `<p>Между кругами: ${formatCentiseconds(b.restBetweenCs)}</p>` : ''}${b.restAfterCs ? `<p>После блока: ${formatCentiseconds(b.restAfterCs)}</p>` : ''}</details>` : ''}</section>`).join('');
}
function showQuickResults(id, exerciseId) {
  const w = workouts.find(item => item.id === id);
  const block = w?.blocks.find(b => b.exercises.some(e => e.id === exerciseId));
  const exercise = block?.exercises.find(e => e.id === exerciseId);
  if (!exercise) return toast('Упражнение уже удалено.');
  const baseline = JSON.stringify(w);
  openModal(`${exercise.distance} м · ${STYLES[exercise.style]}`, `<p class="modal-subtitle">${esc(block.title)} · ${block.rounds} ${plural(block.rounds, 'круг', 'круга', 'кругов')}${exercise.technique ? ' · ' + esc(exercise.technique) : ''}</p>
    <form id="quick-results-form" novalidate>${resultsEditorHTML(exercise, block.rounds, true)}<div id="quick-error" class="form-error" role="alert" tabindex="-1" hidden></div>${discardHTML()}<div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Отмена</button><button type="submit" class="button primary">Сохранить</button></div></form>`);
  const form = document.querySelector('#quick-results-form');
  const editor = mountResultsEditor(form.querySelector('.inline-results'), exercise, block.rounds);
  activeEditor = protectEditor(form, () => JSON.stringify(editor.getDraft()), () => closeModal(true));
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      if (JSON.stringify(workouts.find(item => item.id === id)) !== baseline) throw new Error('Тренировка изменилась в другой вкладке. Откройте её заново.');
      const updated = validateWorkout(withExerciseResults(w, exerciseId, editor.getDraft()), today);
      persist(workouts.map(item => item.id === id ? updated : item));
      closeModal(true); render();
      app.querySelectorAll('.exercise-quick-button').forEach(button => {
        if (button.dataset.id === id && button.dataset.exerciseId === exerciseId) { const disclosure = button.closest('details'); if (disclosure) disclosure.open = true; }
      });
      toast('Результаты сохранены');
    } catch (reason) { const error = form.querySelector('#quick-error'); error.textContent = reason.message; error.hidden = false; error.focus(); }
  });
}
function showDetail(id) {
  const w = workouts.find(item => item.id === id);
  if (!w) return toast('Запись уже удалена.');
  const duration = totalDuration(w);
  openModal(esc(w.title || 'Тренировка'), `
    <p class="modal-subtitle">${dateLabel(w.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${exercisesOf(w).length} ${plural(exercisesOf(w).length, 'задание', 'задания', 'заданий')}</p>
    <div class="detail-grid"><div><span>Общая дистанция</span><strong>${distanceLabel(totalDistance(w))}</strong></div><div><span>Общая продолжительность</span><strong>${formatCentiseconds(w.durationCs)} <small>${duration === null ? '' : 'мин:сек'}</small></strong></div>${w.style ? `<div><span>Стиль исходной записи</span><strong>${STYLES[w.style]}</strong></div>` : ''}</div>
    ${exercisesOf(w).length ? exerciseList(w, true) : '<p class="records-empty">Тренировка без отдельных заданий.</p>'}
    <div class="detail-comment"><span class="eyebrow">ОБЩИЙ КОММЕНТАРИЙ И САМОЧУВСТВИЕ</span><p>${w.comment ? esc(w.comment) : 'Комментария нет.'}</p></div>
    <button class="text-link" data-action="copy-template" data-id="${esc(w.id)}">${icon('plus')}Создать на основе этой тренировки</button>
    <div class="modal-actions between"><button class="button danger-quiet" data-action="delete" data-id="${esc(w.id)}">${icon('trash')}Удалить</button><button class="button secondary" data-action="edit" data-id="${esc(w.id)}">${icon('edit')}Редактировать</button></div>`);
}

function showDay(date) {
  const entries = sortedWorkouts(workouts.filter(w => w.date === date));
  openModal(dateLabel(date, { day: 'numeric', month: 'long', year: 'numeric' }), `<p class="modal-subtitle">${entries.length ? `${entries.length} ${plural(entries.length, 'тренировка', 'тренировки', 'тренировок')} в этот день` : 'В этот день записей нет'}</p>${entries.map(w => workoutRow(w, true)).join('')}${!entries.length ? `<div class="day-empty">${icon('wave')}<p>${date > today ? 'В этот день пока нет тренировок.' : 'Возможно, здесь будет ещё один хороший день в воде.'}</p></div>` : ''}<div class="modal-actions"><button class="button primary" data-action="add-date" data-date="${date}">${icon('plus')}Добавить тренировку</button></div>`);
}
function confirmDelete(id) {
  const w = workouts.find(item => item.id === id);
  if (!w) return toast('Запись уже удалена.');
  openModal('Удалить тренировку?', `<p class="modal-subtitle">${dateLabel(w.date)} · ${distanceLabel(totalDistance(w))}. Эта запись исчезнет из дневника и статистики.</p><div id="delete-error" class="form-error" role="alert" hidden></div><div class="modal-actions"><button class="button secondary" data-action="detail" data-id="${esc(id)}">Оставить</button><button class="button danger" id="confirm-delete">${icon('trash')}Удалить запись</button></div>`);
  document.querySelector('#confirm-delete').addEventListener('click', () => {
    try { persist(workouts.filter(item => item.id !== id)); closeModal(); render(); toast('Тренировка удалена'); }
    catch (error) { const element = document.querySelector('#delete-error'); element.hidden = false; element.textContent = error.message; }
  });
}
function showSettings() {
  openModal('Ваши данные', `<p class="modal-subtitle">Личный дневник остаётся личным.</p>
    <div class="privacy-note">${icon('shield')}<div><strong>На этом устройстве, в этом браузере</strong><p>Без аккаунта и облака. Очистка данных браузера удалит дневник. Время от времени сохраняйте резервную копию.</p></div></div>
    <div class="settings-item"><div><h3>Экспорт дневника</h3><p>${workouts.length} ${plural(workouts.length, 'запись', 'записи', 'записей')} · JSON${demo ? ' · пример' : ''}</p></div><button class="button secondary small" data-action="export">${icon('download')}Скачать</button></div>
    ${storageError ? '<div class="settings-item"><div><h3>Исходные данные</h3><p>Скачайте для восстановления до импорта.</p></div><button class="button secondary small" data-action="export-raw">Скачать исходник</button></div>' : ''}
    <div class="settings-item"><div><h3>Восстановление из файла</h3><p>JSON до 5 МБ. Перед заменой покажем состав копии.</p></div><button class="button secondary small" data-action="choose-import" ${demo ? 'disabled' : ''}>${icon('upload')}Импорт</button><input id="import-file" type="file" accept=".json,application/json" hidden></div>
    <div id="import-error" class="form-error" role="alert" hidden></div>
    <div class="settings-item"><div><h3>Посмотреть пример</h3><p>Знакомство с заполненным дневником.<br>Ваши записи останутся на месте.</p></div><button class="button secondary small" data-action="${demo ? 'demo-off' : 'demo-on'}">${demo ? 'Выйти' : 'Открыть'}</button></div>
    <div class="settings-footnote"><strong>Как считаем регулярность</strong><p>Среднее между уникальными днями за всю историю. Мягкое напоминание появляется, когда пауза больше 1,5 среднего интервала и больше среднего интервала на один день.</p><p>Нырок · версия 1.0 · всё в вашем ритме</p></div>`);
  document.querySelector('#import-file').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    const errorBox = document.querySelector('#import-error');
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Файл больше 5 МБ. Выберите резервную копию меньшего размера.');
      pendingImport = parseBackup(await file.text(), today);
      showImportPreview();
    } catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; event.target.value = ''; }
  });
}
function showImportPreview() {
  const stats = summary(pendingImport, today);
  openModal('Восстановить дневник?', `<p class="modal-subtitle">Файл проверен. Посмотрите, что будет загружено.</p><div class="import-summary"><strong>${pendingImport.length}</strong><span>записей</span><strong>${number(stats.distance / 1000)} км</strong><span>известная дистанция</span></div><p class="import-warning">Импорт полностью заменит текущий дневник (${workouts.length} ${plural(workouts.length, 'запись', 'записи', 'записей')}). Сохраните его резервную копию перед заменой.</p><button class="text-link" data-action="export">${icon('download')}Скачать текущий дневник</button><div id="import-confirm-error" class="form-error" role="alert" hidden></div><div class="modal-actions"><button class="button secondary" data-action="settings">Отмена</button><button class="button primary" id="confirm-import">Заменить дневник</button></div>`);
  document.querySelector('#confirm-import').addEventListener('click', () => {
    try {
      writeWorkouts(localStorage, pendingImport);
      workouts = pendingImport;
      pendingImport = null;
      storageError = '';
      filterMonth = ''; filterSearch = '';
      closeModal(); render(); toast('Дневник восстановлен из резервной копии');
    } catch (error) { const element = document.querySelector('#import-confirm-error'); element.textContent = error.message; element.hidden = false; }
  });
}
function download(text, name) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function navigate() {
  const target = location.hash.slice(1);
  if (!['dashboard', 'diary', 'stats'].includes(target)) return;
  if (!closeModal()) { history.replaceState(null, '', `#${view}`); return; }
  view = target; render(); window.scrollTo({ top: 0, behavior: 'instant' });
}
window.addEventListener('hashchange', navigate);
window.addEventListener('resize', hidePaceTooltip);
document.addEventListener('scroll', event => {
  if (!event.target.closest?.('.pace-tooltip')) hidePaceTooltip();
}, true);
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('.pace-point, .pace-tooltip')) hidePaceTooltip();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') hidePaceTooltip(); });
document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  const action = target.dataset.action;
  const id = target.dataset.id;
  if (action === 'add' || action === 'add-timed') showCreateChoice(today, action === 'add-timed');
  else if (action === 'add-date') showCreateChoice(target.dataset.date);
  else if (action === 'copy-template') {
    const source = workouts.find(item => item.id === id);
    if (source) showForm(null, today, copyWorkout(source, { today }));
    else toast('Исходная тренировка уже удалена.');
  }
  else if (action === 'close-modal') closeModal();
  else if (action === 'detail') showDetail(id);
  else if (action === 'quick-results') showQuickResults(id, target.dataset.exerciseId);
  else if (action === 'edit') { const w = workouts.find(item => item.id === id); if (w) showForm(w); }
  else if (action === 'delete') confirmDelete(id);
  else if (action === 'day') showDay(target.dataset.date);
  else if (action === 'prev-month' || action === 'next-month') { calendarMonth = monthKey(action === 'prev-month' ? -1 : 1, `${calendarMonth}-01`); render(); }
  else if (action === 'calendar-today') { calendarMonth = today.slice(0, 7); render(); }

  else if (action === 'reset-filters') { filterMonth = ''; filterSearch = ''; render(); }
  else if (action === 'stats-period') {
    statsPeriod = target.dataset.value; render();
    document.querySelector(`[data-action="stats-period"][data-value="${statsPeriod}"]`)?.focus();
  }
  else if (action === 'settings') showSettings();
  else if (action === 'export') { download(backupJSON(workouts), `nyrok-${demo ? 'example-' : ''}${today}.json`); toast('Резервная копия подготовлена'); }
  else if (action === 'export-raw') {
    try { download(localStorage.getItem(STORAGE_KEY) || '{}', `nyrok-recovery-${today}.json`); }
    catch { toast('Браузер не разрешает доступ к исходным данным.'); }
  }
  else if (action === 'choose-import') document.querySelector('#import-file').click();
  else if (action === 'demo-on') { if (!demo) { realWorkouts = workouts; workouts = createDemo(today); demo = true; } closeModal(); render(); toast('Открыт пример. Ваш дневник не изменён.'); }
  else if (action === 'demo-off') { workouts = realWorkouts; demo = false; closeModal(); render(); }
});
document.addEventListener('change', event => {
  if (event.target.id === 'diary-month') { filterMonth = event.target.value; render(); document.querySelector('#diary-month')?.focus(); }
  else if (event.target.id === 'pace-selection') { selectedPace = event.target.value; render(); document.querySelector('#pace-selection')?.focus(); }
});
document.addEventListener('input', event => {
  if (event.target.id === 'diary-search') {
    const position = event.target.selectionStart;
    filterSearch = event.target.value;
    render();
    const input = document.querySelector('#diary-search');
    input.focus(); input.setSelectionRange(position, position);
  }
});
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  try {
    const updated = readWorkouts(localStorage);
    if (demo) realWorkouts = updated; else workouts = updated;
    storageError = ''; render(); toast('Дневник обновлён в другой вкладке');
  } catch { storageError = 'Данные изменились в другой вкладке, но их не удалось прочитать. Откройте «Данные».'; render(); }
});
setInterval(() => {
  const now = dateKey();
  if (now !== today) { today = now; render(); }
}, 30000);
render();
