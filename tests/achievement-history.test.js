import test from 'node:test';
import assert from 'node:assert/strict';
import { achievementHistory } from '../src/achievements.js';
import { personalBests, recordKey } from '../src/domain.js';

const TODAY = '2026-11-08';
const KEY = '100:freestyle';
let serial = 0;
const exercise = (times, changes = {}) => ({ id: `e-${++serial}`, distance: 100, style: 'freestyle', technique: '',
  description: '', plannedTimeCs: null, restAfterCs: null, resultMode: 'rounds',
  results: times.map((timeCs, index) => ({ id: `r-${++serial}`, round: index + 1, timeCs })), ...changes });
const block = (exercises, rounds = 1) => ({ id: `b-${++serial}`, title: 'Блок', rounds, exercises, restBetweenCs: null, restAfterCs: null });
const workout = (date, blocks, changes = {}) => ({ id: `w-${++serial}`, date, blocks, status: 'COMPLETED', title: '',
  comment: '', distance: null, durationCs: null, style: '', createdAt: `${date}T08:00:00Z`, ...changes });
const swim = (date, timeCs, changes = {}) => workout(date, [block([exercise([timeCs], changes)])]);

test('empty and single-result histories contain no invented events or chart points', () => {
  const plannedOnly = workout('2026-10-01', [block([exercise([], { plannedTimeCs: 5000 })])]);
  assert.deepEqual(achievementHistory([plannedOnly], KEY, TODAY), { first: null, best: null, improvementCs: null, events: [], daily: [] });
  const one = swim('2026-10-02', 8051);
  const history = achievementHistory([plannedOnly, one], KEY, TODAY);
  assert.equal(history.first.timeCs, 8051);
  assert.equal(history.best.timeCs, 8051);
  assert.equal(history.improvementCs, 0);
  assert.equal(history.events.length, 1);
  assert.equal(history.events[0].improvementCs, null);
  assert.equal(history.events[0].id, one.id);
  assert.equal(history.daily.length, 1);
  assert.equal(history.daily[0].date, '2026-10-02');
});

test('timeline contains only strict improvements, retains exact hundredths, and chart includes slower/tied days', () => {
  const entries = [swim('2026-10-01', 10001), swim('2026-10-02', 10000), swim('2026-10-03', 10000),
    swim('2026-10-04', 11000), swim('2026-10-06', 9999)];
  const before = structuredClone(entries);
  const history = achievementHistory(entries, KEY, TODAY);
  assert.deepEqual(history.events.map(e => [e.date, e.timeCs, e.improvementCs]), [
    ['2026-10-06', 9999, 1], ['2026-10-02', 10000, 1], ['2026-10-01', 10001, null],
  ]);
  assert.equal(history.improvementCs, 2);
  assert.deepEqual(history.daily.map(p => [p.date, p.timeCs]), entries.map(w => [w.date, w.blocks[0].exercises[0].results[0].timeCs]));
  assert.equal(history.best.resultId, personalBests(entries)[0].resultId);
  assert.deepEqual(entries, before);
});

test('same-day ordering follows workout creation, blocks, rounds and exercises before daily reduction', () => {
  const a = exercise([8000, 7700]);
  a.results.reverse(); // Storage array order is not execution order.
  const b = exercise([7900, 7800]);
  const middle = workout('2026-10-17', [block([a, b], 2), block([exercise([7600])])], { createdAt: '2026-10-17T09:00:00Z' });
  const early = swim('2026-10-17', 9000);
  const late = workout('2026-10-17', [block([exercise([7500])])], { createdAt: '2026-10-17T10:00:00Z' });
  const entries = [late, middle, early];
  const history = achievementHistory(entries, KEY, TODAY);
  assert.deepEqual(history.events.map(e => e.timeCs), [7500, 7600, 7700, 7900, 8000, 9000]);
  assert.deepEqual(history.events.map(e => e.improvementCs), [100, 100, 200, 100, 1000, null]);
  assert.equal(history.first.id, early.id);
  assert.equal(history.best.id, late.id);
  assert.equal(history.best.resultId, personalBests(entries)[0].resultId);
  assert.equal(history.daily.length, 1);
  assert.equal(history.daily[0].timeCs, 7500);
});

test('normalized techniques share history while ordinary strokes, other styles and distances stay separate', () => {
  const key = '100:freestyle:ногами с доской';
  const entries = [swim('2026-09-01', 9000, { technique: ' НОГАМИ  С ДОСКОЙ ' }),
    swim('2026-10-01', 8500, { technique: 'ногами с доской' }), swim('2026-10-02', 3000),
    swim('2026-10-02', 4000, { distance: 50, technique: 'ногами с доской' }),
    swim('2026-10-02', 5000, { style: 'breaststroke', technique: 'ногами с доской' })];
  const history = achievementHistory(entries, key, TODAY);
  assert.equal(history.first.date, '2026-09-01');
  assert.deepEqual(history.events.map(e => e.timeCs), [8500, 9000]);
  assert.ok(history.daily.every(p => recordKey(p) === key));
  assert.equal(history.best.resultId, personalBests(entries).find(r => recordKey(r) === key).resultId);
});

test('future and invalid results are excluded and best-only results keep their original identity', () => {
  const invalid = workout('2026-10-01', [block([exercise([0, -1, 123.5, null, Infinity, NaN, 60480001, 6000])], 8)]);
  const bestOnly = exercise([], { resultMode: 'best', results: [{ id: 'best-only', round: null, timeCs: 5001 }] });
  const entries = [invalid, workout(TODAY, [block([bestOnly], 4)]), swim('2026-11-09', 3000)];
  const history = achievementHistory(entries, KEY, TODAY);
  assert.deepEqual(history.events.map(e => e.timeCs), [5001, 6000]);
  assert.equal(history.improvementCs, 999);
  assert.equal(history.best.resultId, 'best-only');
  assert.equal(history.best.round, null);
  assert.deepEqual(history.daily.map(p => [p.date, p.timeCs]), [['2026-10-01', 6000], [TODAY, 5001]]);
});
