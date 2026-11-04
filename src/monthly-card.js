import { assertSummaryMonthAvailable, monthlySummary } from './monthly-summary.js';

export const CARD_DESIGNS = ['paper', 'night', 'poster'];
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;
const C = { paper: '#F3EFE4', ink: '#203B4D', coral: '#C75C48', blue: '#9FB7BE', sand: '#D5BB8F' };
const sans = '"Segoe UI", Arial, sans-serif';
const serif = 'Georgia, "Times New Roman", serif';
const numeral = '"Arial Black", "Segoe UI", Arial, sans-serif';
const number = (value, decimals = 0) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: decimals }).format(value);
export const summaryMonthLabel = month => new Date(`${month}-01T12:00:00`).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(' г.', '');
export function summaryComparison(data) {
  if (data.distanceChangePercent === null) return '';
  const value = data.distanceChangePercent;
  if (value === 0) return 'Та же дистанция, что и месяцем раньше';
  const magnitude = Math.abs(value);
  const percent = magnitude < 0.1 ? '<0,1' : number(magnitude, 1);
  return `${value > 0 ? '+' : '−'}${percent}% дистанции к прошлому месяцу`;
}

function text(ctx, value, x, y, size, width, options = {}) {
  ctx.save();
  ctx.fillStyle = options.color || C.ink;
  ctx.textAlign = options.align || 'left';
  ctx.textBaseline = 'alphabetic';
  const font = px => `${options.italic ? 'italic ' : ''}${options.weight || 600} ${px}px ${options.family || sans}`;
  ctx.font = font(size);
  const measured = ctx.measureText(String(value)).width;
  if (measured > width) ctx.font = font(size * width / measured);
  ctx.fillText(String(value), x, y);
  ctx.restore();
}
function line(ctx, x1, y1, x2, y2, color = C.ink, width = 1) {
  ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function circle(ctx, x, y, radius, color, stroke = false, width = 1) {
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
  if (stroke) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
  else { ctx.fillStyle = color; ctx.fill(); }
}
function base(ctx, color, grain) {
  ctx.fillStyle = color; ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  // A fixed sequence makes the paper grain deterministic and independent of data.
  let seed = 1970;
  const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  ctx.save(); ctx.fillStyle = grain; ctx.globalAlpha = 0.07;
  for (let i = 0; i < 6500; i++) ctx.fillRect(next() * CARD_WIDTH, next() * CARD_HEIGHT, 1 + next() * 1.5, 1);
  ctx.restore();
}
function masthead(ctx, data, color) {
  text(ctx, 'нырок.', 64, 94, 49, 250, { family: serif, italic: true, weight: 700, color });
  text(ctx, summaryMonthLabel(data.month).toLocaleUpperCase('ru-RU'), 1016, 87, 25, 575, { align: 'right', color, weight: 500 });
  line(ctx, 64, 121, 1016, 121, color);
}

// PAPER: an open, asymmetric magazine cover with staggered editorial captions.
function drawPaper(ctx, data) {
  base(ctx, C.paper, C.ink);
  masthead(ctx, data, C.ink);
  text(ctx, 'МЕСЯЦ', 64, 233, 91, 560, { weight: 800 });
  text(ctx, 'в воде.', 64, 330, 108, 540, { family: serif, italic: true });
  circle(ctx, 860, 268, 102, C.coral);
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
    ctx.moveTo(675, 324 + i * 15);
    ctx.bezierCurveTo(780, 255 + i * 15, 887, 405 + i * 15, 1016, 319 + i * 15); ctx.stroke();
  }
  text(ctx, 'ДИСТАНЦИЯ · МЕТРЫ', 66, 426, 23, 850, { weight: 500 });
  text(ctx, number(data.distance), 52, 602, 206, 963, { family: numeral, weight: 900 });
  line(ctx, 64, 639, 1016, 639);
  text(ctx, number(data.trainingCount), 64, 771, 111, 280, { family: numeral, weight: 800 });
  text(ctx, 'ТРЕНИРОВОК', 68, 814, 23, 280, { weight: 500 });
  line(ctx, 405, 682, 405, 931, C.blue);
  text(ctx, `${number(data.averageDistance, 1)} м`, 436, 886, 78, 565, { weight: 700 });
  text(ctx, 'В СРЕДНЕМ ЗА ТРЕНИРОВКУ', 438, 927, 21, 565, { weight: 500 });
  for (let i = 0; i < 5; i++) {
    ctx.beginPath(); ctx.strokeStyle = i === 0 ? C.coral : C.blue; ctx.lineWidth = 12;
    ctx.moveTo(64, 1007 + i * 29);
    ctx.bezierCurveTo(190, 930 + i * 29, 310, 1117 + i * 29, 507, 1020 + i * 29); ctx.stroke();
  }
  text(ctx, number(data.newRecords), 685, 1085, 122, 330, { family: serif, italic: true, color: C.coral });
  text(ctx, 'НОВЫХ ЛИЧНЫХ', 687, 1129, 21, 330, { weight: 500 });
  text(ctx, 'РЕКОРДОВ', 687, 1159, 21, 330, { weight: 500 });
  line(ctx, 64, 1210, 1016, 1210);
  text(ctx, summaryComparison(data) || 'Больше воды. Меньше суеты.', 64, 1255, 25, 950, { weight: 400 });
  text(ctx, 'ЛИЧНЫЙ ДНЕВНИК ПЛАВАНИЯ / В СВОЁМ РИТМЕ', 64, 1300, 17, 950, { weight: 500 });
}

// NIGHT: intersecting pool rings, with measures inside differently scaled circles.
function drawNight(ctx, data) {
  base(ctx, C.ink, C.paper);
  masthead(ctx, data, C.paper);
  text(ctx, 'МЕСЯЦ В ВОДЕ', 64, 207, 59, 950, { color: C.paper, weight: 700 });
  for (let i = 0; i < 5; i++) circle(ctx, 411, 626, 294 + i * 18, i % 2 ? C.blue : C.sand, true, 2);
  circle(ctx, 848, 366, 154, C.coral);
  circle(ctx, 848, 366, 169, C.coral, true, 2);
  text(ctx, number(data.trainingCount), 848, 386, 111, 246, { family: numeral, color: C.paper, align: 'center', weight: 800 });
  text(ctx, 'ТРЕНИРОВОК', 848, 432, 21, 245, { color: C.paper, align: 'center', weight: 500 });
  text(ctx, number(data.distance), 411, 633, 156, 535, { family: numeral, color: C.paper, align: 'center', weight: 900 });
  text(ctx, 'МЕТРОВ ЗА МЕСЯЦ', 411, 684, 24, 500, { color: C.sand, align: 'center', weight: 500 });
  line(ctx, 311, 729, 511, 729, C.sand);
  circle(ctx, 848, 982, 157, C.sand);
  circle(ctx, 848, 982, 173, C.blue, true, 2);
  text(ctx, number(data.newRecords), 848, 987, 107, 235, { family: serif, italic: true, align: 'center' });
  text(ctx, 'НОВЫХ ЛИЧНЫХ', 848, 1032, 19, 242, { align: 'center', weight: 500 });
  text(ctx, 'РЕКОРДОВ', 848, 1061, 19, 242, { align: 'center', weight: 500 });
  text(ctx, `${number(data.averageDistance, 1)} м`, 64, 1113, 77, 561, { color: C.paper });
  text(ctx, 'В СРЕДНЕМ ЗА ТРЕНИРОВКУ', 67, 1157, 22, 550, { color: C.sand, weight: 500 });
  line(ctx, 64, 1210, 1016, 1210, C.blue);
  text(ctx, summaryComparison(data) || 'Вдох. Выдох. Ещё одна дорожка.', 64, 1260, 25, 950, { color: C.paper, weight: 400 });
  text(ctx, 'ЛИЧНЫЙ ДНЕВНИК ПЛАВАНИЯ', 64, 1305, 17, 950, { color: C.blue, weight: 500 });
}

// POSTER: a diagonal distance band, oversized visits and a contrasting footer.
function drawPoster(ctx, data) {
  base(ctx, C.coral, C.paper);
  masthead(ctx, data, C.ink);
  text(ctx, 'МЕСЯЦ В ВОДЕ', 64, 208, 82, 950, { weight: 900 });
  ctx.save(); ctx.translate(540, 472); ctx.rotate(-0.12);
  ctx.fillStyle = C.paper; ctx.fillRect(-650, -163, 1300, 326);
  line(ctx, -650, -149, 650, -149, C.ink, 2);
  text(ctx, number(data.distance), -455, 35, 209, 910, { family: numeral, weight: 900 });
  text(ctx, 'МЕТРОВ / МОЯ ДИСТАНЦИЯ', -449, 104, 25, 880, { weight: 600 });
  ctx.restore();
  text(ctx, summaryComparison(data) || 'Каждый метр — часть вашей истории.', 64, 723, 25, 950, { weight: 500 });
  text(ctx, number(data.trainingCount), 54, 947, 199, 493, { family: numeral, weight: 900 });
  text(ctx, 'ТРЕНИРОВОК', 67, 1000, 30, 480, { weight: 700 });
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.strokeStyle = C.paper; ctx.lineWidth = 17;
    ctx.moveTo(625, 833 + i * 42);
    ctx.bezierCurveTo(758, 736 + i * 42, 842, 940 + i * 42, 1088, 811 + i * 42); ctx.stroke();
  }
  ctx.fillStyle = C.ink; ctx.fillRect(0, 1080, 1080, 270);
  text(ctx, `${number(data.averageDistance, 1)} м`, 64, 1214, 85, 529, { color: C.paper, weight: 700 });
  text(ctx, 'В СРЕДНЕМ ЗА ТРЕНИРОВКУ', 67, 1260, 22, 530, { color: C.paper, weight: 500 });
  line(ctx, 628, 1124, 628, 1290, C.blue);
  text(ctx, number(data.newRecords), 674, 1214, 96, 340, { color: C.paper, family: serif, italic: true });
  text(ctx, 'НОВЫХ ЛИЧНЫХ РЕКОРДОВ', 677, 1260, 20, 337, { color: C.paper, weight: 500 });
}

export function renderMonthCard(canvas, data, design = 'paper') {
  assertSummaryMonthAvailable(data.month);
  if (!CARD_DESIGNS.includes(design)) throw new Error('Выберите один из трёх вариантов оформления.');
  canvas.width = CARD_WIDTH; canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Браузер не поддерживает создание карточки. Попробуйте другой браузер.');
  ({ paper: drawPaper, night: drawNight, poster: drawPoster })[design](ctx, data);
}

export async function monthCardPNG(canvas, workouts, month, design) {
  // Never trust an old preview or a caller's calculated summary at the export boundary.
  await document.fonts.ready;
  const data = monthlySummary(workouts, month);
  renderMonthCard(canvas, data, design);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(value => value ? resolve(value) : reject(new Error('Не удалось создать PNG. Попробуйте скачать ещё раз.')), 'image/png');
  });
  assertSummaryMonthAvailable(month);
  return { blob, data, filename: `nyrok-${month}-${design}.png` };
}
