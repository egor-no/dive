import {
  STYLES, dateKey, monthKey, validateWorkout, summary, sortedWorkouts, formatTime,
  pace, personalBests, previousResult, monthlySeries, weeklySeries, paceSeries,
  recordKey, createDemo, parseBackup, backupJSON, totalDistance, totalDuration,
  hasCompleteDurations, timedResults, copyWorkout, templateWorkouts,
} from './domain.js';
import { readWorkouts, writeWorkouts, STORAGE_KEY } from './storage.js';

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
let filterType = 'all';
let filterMonth = '';
let filterSearch = '';
let chartPeriod = 'month';
let selectedPace = '';
let toastTimer;
let lastFocus;
let pendingImport = null;
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
  if (!stats.lastDate) return { title: 'У каждого ритма есть начало', text: 'Запишите первое посещение — и здесь появится ваша история плавания.', tag: 'Первый шаг' };
  if (stats.average === null) return { title: 'Начало положено', text: 'После второго дня в бассейне мы рассчитаем ваш привычный интервал.', tag: 'В своём темпе' };
  if (stats.overdue) return { title: 'Кажется, пора поплавать!', text: `Ваш привычный интервал — ${number(stats.average)} дн. Возможно, самое время запланировать встречу с водой.`, tag: 'Вода подождёт вас' };
  return { title: stats.elapsed === 0 ? 'Сегодня вы уже были в воде' : 'Вы находите свой ритм', text: `В среднем вы возвращаетесь в бассейн каждые ${number(stats.average)} дн. Продолжайте так, как комфортно вам.`, tag: 'Без спешки и давления' };
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
      <a class="brand" href="#dashboard" aria-label="Нырок — на главную"><span class="brand-symbol">${icon('wave')}</span><span>нырок<span class="brand-dot">.</span><small>дневник плавания</small></span></a>
      <div class="sidebar-label">ВАШ ДНЕВНИК</div>
      <nav aria-label="Основная навигация">${nav.map(([key, symbol, label]) => `<a href="#${key}" class="nav-item ${view === key ? 'active' : ''}" ${view === key ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span>${view === key ? '<span class="nav-dot"></span>' : ''}</a>`).join('')}</nav>
      <div class="sidebar-note"><div class="small-waves">${icon('wave')}</div><p>Не быстрее других.<br>Ближе к себе.</p><span>Плывите в своём ритме</span></div>
      <div class="sidebar-bottom"><button class="nav-item" data-action="settings">${icon('settings')}<span>Данные и настройки</span></button><div class="local-label"><span class="status-dot"></span>Хранится на этом устройстве</div></div>
    </aside>
    <main id="main" tabindex="-1">
      ${demo ? `<div class="demo-banner"><span>Вы смотрите пример. Эти записи не сохраняются в вашем дневнике.</span><button data-action="demo-off">Вернуться к моим данным ${icon('close')}</button></div>` : ''}
      ${storageError ? `<div class="error-banner" role="alert">${esc(storageError)} <button data-action="settings">Открыть данные</button></div>` : ''}
      <header class="page-header"><div><p class="eyebrow">${titles[view][0]}</p><h1>${titles[view][1]}<span class="title-dot">.</span></h1><p class="header-date">${view === 'dashboard' ? `Привет! Сегодня ${dateLabel(today, { weekday: 'long', day: 'numeric', month: 'long' })}.` : view === 'diary' ? 'Место для больших дистанций и маленьких побед.' : 'Замечайте изменения, наслаждайтесь процессом.'}</p></div><button class="button primary" data-action="add">${icon('plus')}<span>Добавить тренировку</span></button></header>
      ${view === 'dashboard' ? dashboard(stats) : view === 'diary' ? diary() : statistics(stats)}
      <footer class="page-footer"><span>НЫРОК <span class="footer-dot">•</span> В своём ритме</span><span>${icon('shield')} Только вы и ваша история</span></footer>
    </main>
    <nav class="mobile-nav" aria-label="Мобильная навигация">${nav.map(([key, symbol, label]) => `<a href="#${key}" class="${view === key ? 'active' : ''}" ${view === key ? 'aria-current="page"' : ''}>${icon(symbol)}${label}</a>`).join('')}<button data-action="settings">${icon('settings')}Данные</button></nav>`;
}
function poolArt() {
  return `<svg class="pool-art" viewBox="0 0 440 230" aria-hidden="true">
    <defs><clipPath id="pool-clip"><rect x="35" y="20" width="365" height="195" rx="95"/></clipPath></defs>
    <rect x="25" y="10" width="385" height="215" rx="105" fill="#d5e2e5" stroke="#f8f7f4" stroke-width="2"/>
    <g clip-path="url(#pool-clip)"><rect x="35" y="20" width="365" height="195" fill="#aec7ce"/>
    <g stroke="#eef4f4" stroke-width="2" opacity=".7"><path d="M45 62h350M35 115h365M45 168h350"/></g>
    <g stroke="#698d9b" stroke-width="4" stroke-dasharray="4 7" opacity=".7"><path d="M35 87h365M35 142h365"/></g>
    <g fill="none" stroke="#d9e8e9" stroke-width="1.5"><path d="M88 37q20-9 40 0t40 0M257 191q20-9 40 0t40 0M62 189q20-9 40 0M325 40q20-9 40 0M280 103q20-9 40 0"/></g>
    <g transform="translate(228 112) rotate(-9)"><ellipse cx="-18" cy="1" rx="32" ry="13" fill="none" stroke="#e7f1f1"/><path d="m-16-3-29-7m29 14-28 11" stroke="#f4f1e9" stroke-width="6" stroke-linecap="round"/><path d="m-12-2 22-7 17-14M-8 4 13 13l19-1" stroke="#f4f1e9" stroke-width="6" fill="none" stroke-linecap="round"/><ellipse cx="-7" cy="0" rx="15" ry="7" fill="#667f91"/><circle cx="15" cy="0" r="8" fill="#D66A65"/></g></g>
    <path d="M352 185v32m14-38v32m-14-17h14m-14 10h14" stroke="#f8f7f4" stroke-width="3" fill="none" stroke-linecap="round"/>
  </svg>`;
}
function dashboard(stats) {
  const rhythm = regularityText(stats);
  return `<section class="hero"><div class="hero-copy"><span class="pill">${icon('wave')} ВАШ ЛИЧНЫЙ РИТМ</span><h2>Больше воды.<br><span>Меньше суеты.</span></h2><p>Здесь важен каждый заплыв.<br>И то, как вы себя после него чувствуете.</p></div>${poolArt()}<span class="hero-caption">ВДОХ. ВЫДОХ. ПЛЫВЁМ.</span></section>
    <div class="section-intro"><h2>Этот месяц <span>/ ${dateLabel(`${today.slice(0, 7)}-01`, { month: 'long' })}</span></h2><a href="#stats" class="text-link">Вся статистика ${icon('arrow')}</a></div>
    <section class="stats-grid" aria-label="Краткая статистика">
      ${statCard('Тренировки', number(stats.monthCount), plural(stats.monthCount, 'тренировка', 'тренировки', 'тренировок'), 'Каждое посещение в счёт', 'wave')}
      ${statCard('Дистанция', number(stats.monthDistance / 1000), 'км', 'Все известные метры за месяц', 'drop')}
      ${statCard('Последний раз', stats.lastDate ? dateLabel(stats.lastDate, { day: 'numeric', month: 'short' }).replace('.', '') : '—', '', stats.lastDate ? stats.elapsed === 0 ? 'Сегодня. Время выдохнуть' : `${stats.elapsed} ${plural(stats.elapsed, 'день', 'дня', 'дней')} назад` : 'Ваша история ещё впереди', 'calendar')}
      ${statCard('Ваш интервал', stats.average === null ? '—' : number(stats.average), stats.average === null ? '' : 'дн.', stats.average === null ? 'Нужно два разных дня в воде' : 'В среднем между посещениями', 'rhythm')}
    </section>
    <section class="dashboard-bottom">
      <article class="panel calendar-panel"><div class="panel-heading"><div><p class="eyebrow">ШАГ ЗА ШАГОМ</p><h2>Дни в воде</h2></div><span class="legend"><i></i> Тренировка</span></div>${calendar()}</article>
      <div class="dashboard-right"><article class="rhythm-card"><span class="rhythm-icon">${icon('rhythm')}</span><div><p class="eyebrow">${rhythm.tag}</p><h3>${rhythm.title}</h3><p>${rhythm.text}</p></div></article>
      <article class="panel recent-panel"><div class="panel-heading"><h2>Последние тренировки</h2><a class="icon-button" href="#diary" aria-label="Открыть дневник">${icon('arrow')}</a></div>${workouts.length ? `<div class="recent-list">${sortedWorkouts(workouts).slice(0, 3).map(w => workoutRow(w, true)).join('')}</div>` : emptyState('Первый заплыв — начало истории', 'Необязательно помнить метры и минуты. Достаточно просто отметить, что вы плавали.', 'add', 'Записать первый заплыв')}</article></div>
    </section>
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
  const isTimed = w.exercises.some(exercise => exercise.timed);
  const best = isTimed && personalBests(workouts).some(item => item.id === w.id);
  const duration = totalDuration(w);
  const row = `<button class="workout-row ${compact ? 'compact' : ''}" data-action="detail" data-id="${esc(w.id)}">
    <span class="workout-symbol ${isTimed ? 'timed' : ''}">${icon(isTimed ? 'clock' : 'wave')}</span>
    <span class="workout-description"><span class="workout-title">${esc(w.title || (w.style ? STYLES[w.style] : 'Тренировка'))}${best ? `<span class="record-marker" aria-label="Личный рекорд">${icon('trophy')}</span>` : ''}</span><span class="workout-subtitle">${dateLabel(w.date)} · ${w.exercises.length} ${plural(w.exercises.length, 'задание', 'задания', 'заданий')}</span>${!compact && w.comment ? `<span class="workout-comment">${esc(w.comment)}</span>` : ''}</span>
    <span class="workout-numbers"><strong>${distanceLabel(totalDistance(w))}</strong><span>${duration !== null ? `${formatTime(duration)} мин:сек` : 'В своём ритме'}</span></span>${icon('right', 'row-arrow')}</button>`;
  return compact ? row : `<div class="diary-entry">${row}${w.exercises.length ? `<details class="exercise-disclosure"><summary>Задания (${w.exercises.length})</summary>${exerciseList(w)}</details>` : ''}</div>`;
}
function diary() {
  const months = [...new Set(workouts.map(w => w.date.slice(0, 7)))].sort().reverse();
  const items = sortedWorkouts(workouts.filter(w =>
    (filterType === 'all' || w.exercises.some(e => e.timed) === (filterType === 'timed')) &&
    (!filterMonth || w.date.startsWith(filterMonth)) &&
    (!filterSearch || `${w.title} ${w.comment} ${STYLES[w.style] || ''} ${totalDistance(w) || ''} ${w.exercises.map(e => `${e.description} ${STYLES[e.style]} ${e.distance}`).join(' ')}`.toLocaleLowerCase('ru').includes(filterSearch.toLocaleLowerCase('ru')))));
  const groups = new Map();
  items.forEach(w => { const key = w.date.slice(0, 7); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(w); });
  return `<div class="diary-toolbar"><div class="segmented" aria-label="Тип тренировки">${[['all', 'Все тренировки'], ['regular', 'Обычные'], ['timed', 'На время']].map(([key, label]) => `<button data-action="filter-type" data-value="${key}" aria-pressed="${filterType === key}" class="${filterType === key ? 'selected' : ''}">${label}</button>`).join('')}</div><div class="diary-inputs"><label class="search-box">${icon('search')}<input id="diary-search" type="search" placeholder="Найти в дневнике" aria-label="Поиск по комментариям, стилю и дистанции" maxlength="200" value="${esc(filterSearch)}"></label><select id="diary-month" aria-label="Месяц тренировок"><option value="">Все месяцы</option>${months.map(key => `<option value="${key}" ${filterMonth === key ? 'selected' : ''}>${monthLabel(key)}</option>`).join('')}</select></div></div>
    <div class="diary-count">${items.length} ${plural(items.length, 'запись', 'записи', 'записей')} <span>Всё начинается с одного заплыва</span></div>
    ${items.length ? [...groups].map(([key, entries]) => `<section class="diary-group"><div class="section-intro"><h2>${monthLabel(key)}</h2><span class="muted">${number(entries.reduce((sum, w) => sum + (totalDistance(w) || 0), 0))} м</span></div><div class="panel diary-list">${entries.map(w => workoutRow(w)).join('')}</div></section>`).join('') : `<section class="panel">${emptyState(workouts.length ? 'Таких записей пока нет' : 'Ваша история начинается здесь', workouts.length ? 'Попробуйте другой месяц, тип тренировки или поисковый запрос.' : 'Добавляйте тренировки с результатами или просто отмечайте дни, проведённые в бассейне.', workouts.length ? 'reset-filters' : 'add', workouts.length ? 'Сбросить фильтры' : 'Добавить тренировку', 'book')}</section>`}`;
}
function barChart(series, metric, label, unit, weekly = false) {
  const max = Math.max(...series.map(item => item[metric]), 1);
  return `<div class="bar-chart" role="img" aria-label="${label}: ${series.map(item => `${item.key} — ${item[metric]} ${unit}`).join('; ')}"><div class="chart-gridlines"><span>${number(max)}</span><span>${number(max / 2)}</span><span>0</span></div><div class="bars">${series.map(item => `<div class="bar-column"><span class="bar-number">${number(item[metric])}</span><div class="bar-track"><div class="bar ${item.key.startsWith(today.slice(0, 7)) && !weekly ? 'current' : ''}" style="height:${item[metric] ? Math.max(2, item[metric] / max * 100) : 0}%"></div></div><span class="bar-label">${weekly ? dateLabel(item.key, { day: 'numeric', month: 'short' }).replace('.', '') : dateLabel(`${item.key}-01`, { month: 'short' }).replace('.', '')}</span></div>`).join('')}</div></div>`;
}
function statistics(stats) {
  const records = personalBests(workouts);
  if (!records.some(w => recordKey(w) === selectedPace)) selectedPace = records[0] ? recordKey(records[0]) : '';
  const months = monthlySeries(workouts, today);
  return `<section class="stats-grid full-stats">
    ${statCard('Всего тренировок', number(stats.total), '', `${stats.days} ${plural(stats.days, 'день', 'дня', 'дней')} посещения бассейна`, 'wave')}
    ${statCard('Вся дистанция', number(stats.distance / 1000), 'км', stats.unknownDistance ? `${stats.unknownDistance} ${plural(stats.unknownDistance, 'запись', 'записи', 'записей')} без дистанции` : 'Каждый известный метр', 'drop')}
    ${statCard('Неделя / месяц', `${stats.weekCount}<span class="stat-divider">/</span>${stats.monthCount}`, '', 'Неделя начинается в понедельник', 'calendar')}
    ${statCard('Средний интервал', stats.average === null ? '—' : number(stats.average), stats.average === null ? '' : 'дн.', 'По уникальным дням за всё время', 'rhythm')}
    </section>
    <section class="charts-grid"><article class="panel chart-panel"><div class="panel-heading"><div><p class="eyebrow">РЕГУЛЯРНОСТЬ</p><h2>Встречи с водой</h2></div><div class="segmented small">${[['week', 'Недели'], ['month', 'Месяцы']].map(([key, label]) => `<button data-action="chart-period" data-value="${key}" class="${chartPeriod === key ? 'selected' : ''}" aria-pressed="${chartPeriod === key}">${label}</button>`).join('')}</div></div><p class="chart-description">Количество тренировок · ${chartPeriod === 'week' ? '8 последних недель' : '6 последних месяцев'}</p>${barChart(chartPeriod === 'week' ? weeklySeries(workouts, today) : months, 'count', 'Количество тренировок', 'тренировок', chartPeriod === 'week')}</article>
    <article class="panel chart-panel"><div class="panel-heading"><div><p class="eyebrow">ДИСТАНЦИЯ</p><h2>Метр за метром</h2></div><span class="chart-unit">метры</span></div><p class="chart-description">Известная дистанция · 6 последних месяцев</p>${barChart(months, 'distance', 'Дистанция по месяцам', 'м')}</article></section>
    <article class="panel pace-panel"><div class="panel-heading"><div><p class="eyebrow">ЗАПЛЫВЫ НА ВРЕМЯ</p><h2>Как меняется ваш темп</h2></div>${records.length ? `<select id="pace-selection" aria-label="Дистанция и стиль для графика темпа">${records.map(w => `<option value="${recordKey(w)}" ${recordKey(w) === selectedPace ? 'selected' : ''}>${w.distance} м · ${STYLES[w.style]}</option>`).join('')}</select>` : ''}</div><p class="chart-description">Минуты и секунды на 100 м. Меньше время — быстрее заплыв.</p>${records.length ? paceChart(paceSeries(workouts, selectedPace)) : emptyState('У вашего прогресса будет своя линия', 'Добавьте заплыв на время. Результаты сравниваются только на одинаковой дистанции и в одном стиле.', 'add-timed', 'Записать результат', 'chart')}</article>
    <article class="panel records-panel"><div class="panel-heading"><div><p class="eyebrow">ЛИЧНЫЕ ДОСТИЖЕНИЯ</p><h2>Ваши лучшие заплывы</h2></div><span class="record-badge">${icon('trophy')} Маленькие победы</span></div>${records.length ? `<div class="table-wrap"><table><thead><tr><th>Дистанция и стиль</th><th>Результат</th><th>Темп / 100 м</th><th>Дата</th><th><span class="sr-only">Подробнее</span></th></tr></thead><tbody>${records.map(w => `<tr><td><strong>${w.distance} м</strong><span class="table-style">${STYLES[w.style]}</span></td><td class="best-time">${formatTime(w.result)}</td><td>${formatTime(pace(w))}</td><td>${dateLabel(w.date, { day: 'numeric', month: 'short', year: 'numeric' })}</td><td><button class="icon-button" data-action="detail" data-id="${esc(w.id)}" aria-label="Открыть рекорд ${w.distance} м ${STYLES[w.style]}">${icon('arrow')}</button></td></tr>`).join('')}</tbody></table></div>` : `<p class="records-empty">Здесь появятся лучшие результаты для каждой дистанции и стиля. Соревнуйтесь только с собой — и только если хочется.</p>`}</article>`;
}
function paceChart(series) {
  const width = 820, height = 190, pad = 35;
  const min = Math.max(0, Math.floor(Math.min(...series.map(w => w.pace)) / 10) * 10 - 10);
  const max = Math.ceil(Math.max(...series.map(w => w.pace)) / 10) * 10 + 10;
  const x = i => series.length === 1 ? width / 2 : 66 + i / (series.length - 1) * (width - 100);
  const y = value => pad + (max - value) / (max - min) * (height - pad * 2);
  return `${series.length === 1 ? '<p class="single-point-note">Первая точка есть. После следующего такого заплыва появится линия прогресса.</p>' : ''}
    <div class="pace-chart"><svg viewBox="0 0 ${width} ${height + 30}" role="img" aria-label="Динамика темпа: ${series.map(w => `${dateLabel(w.date)}, ${formatTime(w.pace)} на 100 метров`).join('; ')}">
    ${[min, (min + max) / 2, max].map(value => `<line x1="58" x2="${width - 20}" y1="${y(value)}" y2="${y(value)}" stroke="#e8ecec" stroke-dasharray="4 5"/><text x="0" y="${y(value) + 4}" fill="#6b7d86" font-size="12">${formatTime(value)}</text>`).join('')}
    ${series.length > 1 ? `<polyline points="${series.map((w, i) => `${x(i)},${y(w.pace)}`).join(' ')}" fill="none" stroke="#667f91" stroke-width="3" stroke-linejoin="round"/>` : ''}
    ${series.map((w, i) => `<circle cx="${x(i)}" cy="${y(w.pace)}" r="5" fill="${i === series.length - 1 ? '#D66A65' : '#667f91'}" stroke="#fff" stroke-width="2"><title>${dateLabel(w.date)}: ${formatTime(w.pace)} / 100 м</title></circle>${series.length <= 8 || i === 0 || i === series.length - 1 ? `<text x="${x(i)}" y="${height + 14}" text-anchor="middle" fill="#6b7d86" font-size="12">${dateLabel(w.date, { day: 'numeric', month: 'short' })}</text>` : ''}`).join('')}
    </svg></div><details class="chart-data"><summary>Все результаты на этой дистанции (${series.length})</summary><div class="table-wrap"><table><thead><tr><th>Дата</th><th>Результат</th><th>Темп / 100 м</th></tr></thead><tbody>${series.map(w => `<tr><td>${dateLabel(w.date, { day: 'numeric', month: 'long', year: 'numeric' })}</td><td>${formatTime(w.result)}</td><td>${formatTime(w.pace)}</td></tr>`).join('')}</tbody></table></div></details>`;
}
function openModal(title, body, wide = false) {
  lastFocus = document.activeElement;
  modalRoot.innerHTML = `<dialog class="modal ${wide ? 'wide' : ''}" aria-labelledby="modal-title"><div class="modal-heading"><h2 id="modal-title">${title}</h2><button class="icon-button" data-action="close-modal" aria-label="Закрыть окно">${icon('close')}</button></div>${body}</dialog>`;
  const dialog = modalRoot.querySelector('dialog');
  document.body.classList.add('modal-open');
  dialog.showModal();
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeModal(); });
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closeModal();
  });
}
function closeModal() {
  modalRoot.querySelector('dialog')?.close();
  modalRoot.innerHTML = '';
  document.body.classList.remove('modal-open');
  if (lastFocus?.isConnected) lastFocus.focus();
}
function showCreateChoice(initialDate = today, timed = false) {
  openModal('Добавить тренировку', `<p class="modal-subtitle">Начните с пустой формы или возьмите за основу знакомый план.</p>
    <div class="creation-options">
      <button class="button secondary creation-option" id="create-empty">${icon('plus')}<span>Новая тренировка<small>Пустая форма с возможностью добавить задания</small></span></button>
      <button class="button secondary creation-option" id="create-template">${icon('book')}<span>На основе предыдущей<small>Выбрать тренировку и скопировать её план</small></span></button>
    </div>`);
  document.querySelector('#create-empty').addEventListener('click', () => {
    const seed = timed ? { exercises: [newExercise(true)] } : null;
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
    document.querySelector('#template-results').innerHTML = items.length ? items.map(w => `<button class="template-row" data-action="copy-template" data-id="${esc(w.id)}"><span><strong>${esc(w.title || 'Без названия')}</strong><small>${dateLabel(w.date, { day: 'numeric', month: 'long', year: 'numeric' })}</small></span><span><strong>${distanceLabel(totalDistance(w))}</strong><small>${w.exercises.length} ${plural(w.exercises.length, 'задание', 'задания', 'заданий')}</small></span>${icon('right')}</button>`).join('') : `<p class="records-empty">${workouts.length ? 'Тренировки с таким названием не найдены.' : 'Сохранённых тренировок пока нет. Начните с новой тренировки.'}</p>`;
  };
  renderTemplates('');
  document.querySelector('#template-search').addEventListener('input', event => renderTemplates(event.target.value));
}
function newExercise(timed = false) {
  return { id: crypto.randomUUID(), distance: null, style: 'freestyle', description: '', duration: null, timed, result: null };
}
function timeInputs(name, value, label) {
  return `<div class="duration-inputs"><div class="input-unit"><input name="${name}-minutes" aria-label="${label}: минуты" type="number" min="0" max="10080" step="1" inputmode="numeric" placeholder="00" value="${value === null ? '' : Math.floor(value / 60)}"><span>мин</span></div><span>:</span><div class="input-unit"><input name="${name}-seconds" aria-label="${label}: секунды" type="number" min="0" max="59" step="1" inputmode="numeric" placeholder="00" value="${value === null ? '' : value % 60}"><span>сек</span></div></div>`;
}
function exerciseEditor(exercise) {
  return `<fieldset class="exercise-editor" data-id="${esc(exercise.id)}"><legend>Задание</legend>
    <div class="exercise-toolbar"><span class="eyebrow exercise-number"></span><div>
      <button type="button" class="icon-button" data-exercise-action="up" aria-label="Переместить задание выше">↑</button>
      <button type="button" class="icon-button" data-exercise-action="down" aria-label="Переместить задание ниже">↓</button>
      <button type="button" class="icon-button" data-exercise-action="remove" aria-label="Удалить задание">${icon('trash')}</button>
    </div></div>
    <label class="field"><span>Название или описание <small>необязательно</small></span><input name="exercise-description" maxlength="500" placeholder="Например, разминка или работа над техникой" value="${esc(exercise.description)}"></label>
    <div class="form-grid exercise-fields"><label class="field"><span>Дистанция задания <b>*</b></span><div class="input-unit"><input name="exercise-distance" type="number" min="1" max="100000" step="1" inputmode="numeric" placeholder="100" value="${exercise.distance ?? ''}" required><span>м</span></div></label>
    <label class="field"><span>Стиль плавания <b>*</b></span><select name="exercise-style">${Object.entries(STYLES).map(([key, name]) => `<option value="${key}" ${exercise.style === key ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
    <div class="field"><span>Продолжительность задания <small>необязательно</small></span>${timeInputs('exercise-duration', exercise.duration, 'Продолжительность задания')}</div>
    <label class="timed-toggle"><input name="exercise-timed" type="checkbox" ${exercise.timed ? 'checked' : ''}>${icon('clock')} На время</label></div>
    <div class="exercise-result" ${exercise.timed ? '' : 'hidden'}><div class="field"><span>Результат заплыва <small>можно заполнить позже</small></span>${timeInputs('exercise-result', exercise.result, 'Результат заплыва')}</div><p class="exercise-pace"></p></div>
    <p class="exercise-hint">Продолжительность задания и результат заплыва учитываются отдельно.</p>
  </fieldset>`;
}
function readTime(container, name, label, strict = true) {
  const min = container.querySelector(`[name="${name}-minutes"]`);
  const sec = container.querySelector(`[name="${name}-seconds"]`);
  const invalid = min.validity.badInput || sec.validity.badInput ||
    (min.value && !/^\d+$/.test(min.value)) || (sec.value && !/^\d+$/.test(sec.value)) || Number(sec.value) > 59;
  if (invalid) {
    if (strict) throw new Error(`${label}: минуты — целое неотрицательное число, секунды — от 0 до 59.`);
    return null;
  }
  return min.value || sec.value ? Number(min.value) * 60 + Number(sec.value) : null;
}
function showForm(existing = null, initialDate = today, seed = null) {
  const w = structuredClone(existing || {
    id: crypto.randomUUID(), date: initialDate, title: '', distance: null, duration: null,
    style: '', comment: '', exercises: [], createdAt: new Date().toISOString(), ...seed,
  });
  const baseline = existing ? JSON.stringify(existing) : null;
  openModal(existing ? 'Редактировать тренировку' : seed?.title ? 'Тренировка на основе предыдущей' : 'Новая тренировка', `
    <p class="modal-subtitle">Задания — ваш план. Результаты — ваша новая история.</p>
    <form id="workout-form" novalidate>
      <div class="form-grid"><label class="field"><span>Дата <b>*</b></span><input name="date" type="date" value="${w.date}" min="1900-01-01" max="${today}" required></label>
      <label class="field"><span>Название тренировки <small>необязательно</small></span><input name="title" maxlength="200" placeholder="Например, техника и выносливость" value="${esc(w.title)}"></label></div>
      <div class="section-intro"><h2>Задания</h2><button type="button" class="text-link" id="add-exercise">${icon('plus')}Добавить задание</button></div>
      <p id="no-exercises" class="chart-description">Можно сохранить тренировку без заданий и указать общие значения вручную.</p>
      <div id="exercise-editors">${w.exercises.map(exerciseEditor).join('')}</div>
      <div class="form-grid training-totals">
        <div><label class="field" id="manual-distance-field"><span>Общая дистанция <small>необязательно</small></span><div class="input-unit"><input name="distance" type="number" min="1" max="100000" step="1" inputmode="numeric" value="${w.distance ?? ''}"><span>м</span></div></label><div id="calculated-distance" class="calculated-total" hidden></div></div>
        <div><div class="field" id="manual-duration-field"><span>Общая продолжительность <small>необязательно</small></span>${timeInputs('training-duration', w.duration, 'Общая продолжительность')}</div><div id="calculated-duration" class="calculated-total" hidden></div></div>
      </div>
      <p id="duration-note" class="chart-description"></p>
      ${w.style ? `<label class="field legacy-style-field"><span>Стиль исходной записи</span><select name="legacy-style"><option value="">Не указан</option>${Object.entries(STYLES).map(([key, name]) => `<option value="${key}" ${w.style === key ? 'selected' : ''}>${name}</option>`).join('')}</select></label>` : ''}
      <label class="field comment-field"><span>Общий комментарий и самочувствие <small>необязательно</small></span><textarea name="comment" rows="3" maxlength="2000" placeholder="Как прошла тренировка?">${esc(w.comment)}</textarea></label>
      <p class="form-note">${icon('shield')}${demo ? 'Режим примера: запись останется только в этой сессии.' : 'Запись сохранится только после нажатия кнопки сохранения.'}</p>
      <div id="form-error" class="form-error" role="alert" tabindex="-1" hidden></div>
      <div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Отмена</button><button type="submit" class="button primary">${icon('check')}${existing ? 'Сохранить изменения' : 'Сохранить тренировку'}</button></div>
    </form>`, true);
  const form = document.querySelector('#workout-form');
  const list = document.querySelector('#exercise-editors');
  const readExercises = (strict = true) => [...list.children].map((card, index) => {
    const field = name => card.querySelector(`[name="exercise-${name}"]`);
    if (strict && field('distance').validity.badInput) throw new Error(`Задание ${index + 1}: введите корректную дистанцию.`);
    return {
      id: card.dataset.id, description: field('description').value, style: field('style').value,
      distance: field('distance').value ? Number(field('distance').value) : null,
      duration: readTime(card, 'exercise-duration', `Задание ${index + 1}`, strict),
      timed: field('timed').checked,
      result: field('timed').checked ? readTime(card, 'exercise-result', `Результат задания ${index + 1}`, strict) : null,
    };
  });
  const updateTotals = () => {
    const exercises = readExercises(false);
    [...list.children].forEach((card, index) => {
      const exercise = exercises[index];
      card.querySelector('legend').textContent = `Задание ${index + 1}`;
      card.querySelector('.exercise-number').textContent = `${index + 1} / ${exercises.length}`;
      card.querySelector('[data-exercise-action="up"]').disabled = index === 0;
      card.querySelector('[data-exercise-action="down"]').disabled = index === exercises.length - 1;
      card.querySelector('.exercise-result').hidden = !exercise.timed;
      const value = pace(exercise);
      card.querySelector('.exercise-pace').textContent = value === null ? 'Без результата задание не участвует в рекордах.' : `Темп: ${formatTime(value)} / 100 м`;
    });
    document.querySelector('#no-exercises').hidden = exercises.length > 0;
    document.querySelector('#manual-distance-field').hidden = exercises.length > 0;
    const distance = document.querySelector('#calculated-distance');
    distance.hidden = !exercises.length;
    distance.innerHTML = `<span>Общая дистанция · из заданий</span><strong>${exercises.every(e => e.distance > 0) ? distanceLabel(totalDistance({ exercises })) : 'Укажите дистанции заданий'}</strong>`;
    const complete = hasCompleteDurations({ exercises }) && exercises.every(e => e.duration > 0);
    document.querySelector('#manual-duration-field').hidden = complete;
    const duration = document.querySelector('#calculated-duration');
    duration.hidden = !complete;
    duration.innerHTML = `<span>Общая продолжительность · из заданий</span><strong>${complete ? formatTime(totalDuration({ exercises })) + ' мин:сек' : '—'}</strong>`;
    document.querySelector('#duration-note').textContent = complete ? 'У всех заданий указана продолжительность — суммируем её автоматически.' : exercises.length ? 'Продолжительность заполнена не у всех заданий. При желании укажите общее время вручную.' : 'Дистанцию и продолжительность можно оставить пустыми.';
  };
  document.querySelector('#add-exercise').addEventListener('click', () => {
    list.insertAdjacentHTML('beforeend', exerciseEditor(newExercise()));
    updateTotals();
    list.lastElementChild.querySelector('input').focus();
  });
  list.addEventListener('click', event => {
    const button = event.target.closest('[data-exercise-action]');
    if (!button) return;
    const card = button.closest('.exercise-editor');
    if (button.dataset.exerciseAction === 'remove') card.remove();
    else if (button.dataset.exerciseAction === 'up' && card.previousElementSibling) list.insertBefore(card, card.previousElementSibling);
    else if (button.dataset.exerciseAction === 'down' && card.nextElementSibling) list.insertBefore(card.nextElementSibling, card);
    updateTotals();
  });
  form.addEventListener('input', updateTotals);
  form.addEventListener('change', updateTotals);
  updateTotals();
  form.addEventListener('submit', event => {
    event.preventDefault();
    const errorBox = document.querySelector('#form-error');
    try {
      const data = new FormData(form);
      const exercises = readExercises();
      if (!exercises.length && form.elements.distance.validity.badInput) throw new Error('Введите корректную общую дистанцию.');
      const candidate = validateWorkout({
        ...w, date: data.get('date'), title: data.get('title'), comment: data.get('comment'), exercises,
        distance: exercises.length ? null : data.get('distance').trim() ? Number(data.get('distance')) : null,
        duration: hasCompleteDurations({ exercises }) ? null : readTime(form, 'training-duration', 'Общая продолжительность'),
        style: data.get('legacy-style') ?? w.style,
      }, today);
      if (existing && JSON.stringify(workouts.find(item => item.id === existing.id)) !== baseline) throw new Error('Эта запись изменилась в другой вкладке. Закройте окно и откройте запись заново.');
      persist(existing ? workouts.map(item => item.id === candidate.id ? candidate : item) : [...workouts, candidate]);
      closeModal(); render();
      toast(existing ? 'Изменения сохранены' : demo ? 'Тренировка добавлена в пример' : 'Тренировка сохранена');
    } catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; errorBox.focus(); }
  });
}
function exerciseList(w, comparisons = false) {
  const records = personalBests(workouts);
  const swims = timedResults([w]);
  return `<ol class="exercise-list">${w.exercises.map(exercise => {
    const swim = swims.find(item => item.exerciseId === exercise.id);
    const best = records.some(item => item.id === w.id && item.exerciseId === exercise.id);
    const previous = comparisons && swim ? previousResult(workouts, swim) : null;
    const difference = previous ? exercise.result - previous.result : null;
    return `<li><div class="exercise-summary"><strong>${esc(exercise.description || 'Задание')} ${best ? `<span class="record-marker" aria-label="Личный рекорд">${icon('trophy')}</span>` : ''}</strong><span>${distanceLabel(exercise.distance)} · ${STYLES[exercise.style]}</span></div>
      <p>Продолжительность: ${exercise.duration === null ? 'не указана' : `${formatTime(exercise.duration)} мин:сек`}</p>
      ${exercise.timed ? `<p class="exercise-result-text">На время · ${exercise.result === null ? 'результат пока не указан' : `${formatTime(exercise.result)} · темп ${formatTime(pace(exercise))} / 100 м`}</p>` : ''}
      ${comparisons && swim ? `<p class="exercise-comparison">${previous ? `${difference < 0 ? 'Быстрее' : difference > 0 ? 'Дольше' : 'Без изменения'}${difference ? ` на ${formatTime(Math.abs(difference))}` : ''}. Предыдущий результат: ${formatTime(previous.result)}, ${dateLabel(previous.date)}.` : 'Первый результат на этой дистанции в этом стиле.'}</p>` : ''}</li>`;
  }).join('')}</ol>`;
}
function showDetail(id) {
  const w = workouts.find(item => item.id === id);
  if (!w) return toast('Запись уже удалена.');
  const duration = totalDuration(w);
  openModal(esc(w.title || 'Тренировка'), `
    <p class="modal-subtitle">${dateLabel(w.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${w.exercises.length} ${plural(w.exercises.length, 'задание', 'задания', 'заданий')}</p>
    <div class="detail-grid"><div><span>Общая дистанция</span><strong>${distanceLabel(totalDistance(w))}</strong></div><div><span>Общая продолжительность</span><strong>${formatTime(duration)} <small>${duration === null ? '' : 'мин:сек'}</small></strong></div>${w.style ? `<div><span>Стиль исходной записи</span><strong>${STYLES[w.style]}</strong></div>` : ''}</div>
    ${w.exercises.length ? exerciseList(w, true) : '<p class="records-empty">Тренировка без отдельных заданий.</p>'}
    <div class="detail-comment"><span class="eyebrow">ОБЩИЙ КОММЕНТАРИЙ И САМОЧУВСТВИЕ</span><p>${w.comment ? esc(w.comment) : 'Комментария нет.'}</p></div>
    <button class="text-link" data-action="copy-template" data-id="${esc(w.id)}">${icon('plus')}Создать на основе этой тренировки</button>
    <div class="modal-actions between"><button class="button danger-quiet" data-action="delete" data-id="${esc(w.id)}">${icon('trash')}Удалить</button><button class="button secondary" data-action="edit" data-id="${esc(w.id)}">${icon('edit')}Редактировать</button></div>`);
}

function showDay(date) {
  const entries = sortedWorkouts(workouts.filter(w => w.date === date));
  openModal(dateLabel(date, { day: 'numeric', month: 'long', year: 'numeric' }), `<p class="modal-subtitle">${entries.length ? `${entries.length} ${plural(entries.length, 'тренировка', 'тренировки', 'тренировок')} в этот день` : 'В этот день записей нет'}</p>${entries.map(w => workoutRow(w, true)).join('')}${!entries.length ? `<div class="day-empty">${icon('wave')}<p>${date > today ? 'История появится, когда этот день наступит.' : 'Возможно, здесь будет ещё один хороший день в воде.'}</p></div>` : ''}${date <= today ? `<div class="modal-actions"><button class="button primary" data-action="add-date" data-date="${date}">${icon('plus')}Добавить тренировку</button></div>` : ''}`);
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
  openModal('Восстановить дневник?', `<p class="modal-subtitle">Файл проверен. Посмотрите, что будет загружено.</p><div class="import-summary"><strong>${stats.total}</strong><span>${plural(stats.total, 'тренировка', 'тренировки', 'тренировок')}</span><strong>${number(stats.distance / 1000)} км</strong><span>известная дистанция</span></div><p class="import-warning">Импорт полностью заменит текущий дневник (${workouts.length} ${plural(workouts.length, 'запись', 'записи', 'записей')}). Сохраните его резервную копию перед заменой.</p><button class="text-link" data-action="export">${icon('download')}Скачать текущий дневник</button><div id="import-confirm-error" class="form-error" role="alert" hidden></div><div class="modal-actions"><button class="button secondary" data-action="settings">Отмена</button><button class="button primary" id="confirm-import">Заменить дневник</button></div>`);
  document.querySelector('#confirm-import').addEventListener('click', () => {
    try {
      writeWorkouts(localStorage, pendingImport);
      workouts = pendingImport;
      pendingImport = null;
      storageError = '';
      filterMonth = ''; filterType = 'all'; filterSearch = '';
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
  view = target; closeModal(); render(); window.scrollTo({ top: 0, behavior: 'instant' });
}
window.addEventListener('hashchange', navigate);
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
  else if (action === 'edit') { const w = workouts.find(item => item.id === id); if (w) showForm(w); }
  else if (action === 'delete') confirmDelete(id);
  else if (action === 'day') showDay(target.dataset.date);
  else if (action === 'prev-month' || action === 'next-month') { calendarMonth = monthKey(action === 'prev-month' ? -1 : 1, `${calendarMonth}-01`); render(); }
  else if (action === 'calendar-today') { calendarMonth = today.slice(0, 7); render(); }
  else if (action === 'filter-type') { filterType = target.dataset.value; render(); }
  else if (action === 'reset-filters') { filterType = 'all'; filterMonth = ''; filterSearch = ''; render(); }
  else if (action === 'chart-period') { chartPeriod = target.dataset.value; render(); }
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
