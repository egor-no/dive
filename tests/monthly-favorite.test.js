import test from 'node:test';
import assert from 'node:assert/strict';
import { favoriteDistances } from '../src/statistics.js';
import { monthlySummary } from '../src/monthly-summary.js';
import { CARD_DESIGNS, renderMonthCard } from '../src/monthly-card.js';

let serial = 0;
const exercise = (changes = {}) => ({ id: `e-${++serial}`, distance: 100, style: 'freestyle', technique: '',
  description: '', plannedTimeCs: null, restAfterCs: null, resultMode: 'rounds', results: [], ...changes });
const block = (rounds, exercises) => ({ id: `b-${++serial}`, title: '', rounds, exercises, restBetweenCs: null, restAfterCs: null });
const workout = (date, blocks = [], changes = {}) => ({ id: `w-${++serial}`, date, blocks, status: 'COMPLETED', title: '',
  distance: null, durationCs: null, style: '', comment: '', createdAt: `${date}T08:00:00Z`, ...changes });
const october = entries => monthlySummary(entries, '2020-10', '2020-11-15');

test('monthly favorite reuses statistics ranking for the selected calendar month, including untimed and best-only rounds', () => {
  const selected = [workout('2020-10-01', [block(4, [exercise()])], { status: 'PLANNED' }),
    workout('2020-10-31', [block(3, [exercise({ resultMode: 'best', results: [{ id: 'best', round: null, timeCs: 8000 }] })])]),
    workout('2020-10-25', [block(6, [exercise({ distance: 400 })])])];
  const entries = [workout('2020-09-30', [block(99, [exercise({ distance: 50 })])]), ...selected,
    workout('2020-11-01', [block(99, [exercise({ distance: 800 })])])];
  const before = structuredClone(entries);
  const data = october(entries);
  assert.deepEqual(data.favorite, favoriteDistances(selected)[0]);
  assert.equal(data.favorite.key, '100:freestyle');
  assert.equal(data.favorite.count, 7);
  assert.equal(data.favorite.totalDistance, 700);
  assert.equal(data.distance, 3100);
  assert.equal(data.trainingCount, 3);
  assert.equal(data.newRecords, 1);
  assert.deepEqual(entries, before);
});

test('monthly favorite uses normalized techniques and existing distance/name tie breakers', () => {
  const entries = [workout('2020-10-01', [
    block(1, [exercise({ distance: 400, style: 'breaststroke', technique: ' С ЛЁГКИМИ  ЛАСТАМИ ' })]),
    block(1, [exercise({ distance: 400, style: 'breaststroke', technique: 'с легкими ластами' })]),
    block(2, [exercise({ distance: 400 }), exercise()]),
  ])];
  const favorite = october(entries).favorite;
  assert.equal(favorite.key, '400:breaststroke:с легкими ластами');
  assert.equal(favorite.technique, 'с легкими ластами');
  assert.equal(favorite.count, 2);
  assert.equal(favorite.totalDistance, 800);
});

test('monthly favorite is absent without exercises in the month and recalculates after edits', () => {
  assert.equal(october([]).favorite, null);
  assert.equal(october([workout('2020-10-01', [], { distance: 1200 })]).favorite, null);
  const entry = workout('2020-09-30', [block(4, [exercise()])]);
  assert.equal(october([entry]).favorite, null);
  entry.date = '2020-10-01';
  assert.equal(october([entry]).favorite.count, 4);
  entry.blocks[0].rounds = 6;
  assert.equal(october([entry]).favorite.totalDistance, 600);
});

// Records renderer commands, without a browser or an imitation PNG encoder.
// This checks content and shared rendering; it does not verify actual font appearance.
function recordingCanvas() {
  const written = [];
  const ctx = {
    font: '20px sans-serif',
    save() {}, restore() {}, beginPath() {}, stroke() {}, fill() {},
    fillRect() {}, moveTo() {}, lineTo() {}, bezierCurveTo() {}, arc() {}, translate() {}, rotate() {},
    measureText(value) { return { width: [...String(value)].length * Number(this.font.match(/([\d.]+)px/)[1]) * 0.6 }; },
    fillText(value, x, y) { written.push({ value: String(value), x, y, font: this.font }); },
  };
  return { canvas: { getContext: () => ctx }, written };
}

const cardData = () => october([workout('2020-10-01', [block(7, [exercise({ technique: 'ногами с доской' })])])]);

test('card favorites appear with identical data in all three shared renderers at the original image size', () => {
  const data = cardData();
  for (const design of CARD_DESIGNS) {
    const first = recordingCanvas();
    renderMonthCard(first.canvas, data, design);
    assert.equal(first.canvas.width, 1080);
    assert.equal(first.canvas.height, 1350);
    const labels = first.written.map(item => item.value);
    for (const expected of ['ЛЮБИМАЯ ДИСТАНЦИЯ', '100 м · Кроль', 'ногами с доской', '7 раз · 700 м']) {
      assert.ok(labels.includes(expected), `${design}: ${expected}`);
    }
    const second = recordingCanvas();
    renderMonthCard(second.canvas, structuredClone(data), design);
    assert.deepEqual(second.written, first.written);
  }
});

test('card favorites disappear when absent and retain the entire long technique within the reserved lines', () => {
  const data = cardData();
  const technique = 'ногами с доской и ластами '.repeat(9).slice(0, 200).trim();
  for (const design of CARD_DESIGNS) {
    const empty = recordingCanvas();
    renderMonthCard(empty.canvas, { ...data, favorite: null }, design);
    assert.ok(!empty.written.some(item => item.value === 'ЛЮБИМАЯ ДИСТАНЦИЯ'));
    for (const value of [technique, 'ш'.repeat(200), '']) {
      const recorder = recordingCanvas();
      renderMonthCard(recorder.canvas, { ...data, favorite: { ...data.favorite, technique: value } }, design);
      const labels = recorder.written.map(item => item.value);
      const start = labels.indexOf('100 м · Кроль') + 1;
      const end = labels.indexOf('7 раз · 700 м');
      const lines = labels.slice(start, end);
      assert.ok(lines.length <= (design === 'paper' ? 3 : 4));
      assert.equal(lines.join('').replace(/\s/g, ''), value.replace(/\s/g, ''));
    }
  }
});
