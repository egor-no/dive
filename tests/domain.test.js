import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validDate, dateKey, shiftDate, monthKey, validateWorkout, parseBackup, backupJSON,
  pace, formatTime, regularity, summary, personalBests, previousResult, recordKey,
  monthlySeries, weeklySeries, paceSeries, createDemo, sortedWorkouts,
} from '../src/domain.js';
const TODAY = '2026-10-20';
const workout = (overrides = {}) => ({
  id: 'one', type: 'regular', date: '2026-10-01', distance: null, duration: null,
  style: '', comment: '', createdAt: '2026-10-01T08:00:00.000Z', ...overrides,
});
const timed = (overrides = {}) => workout({ type: 'timed', distance: 100, duration: 120, style: 'freestyle', ...overrides });

test('valid dates include leap days and reject rollover, malformed and early dates', () => {
  assert.ok(validDate('2024-02-29'));
  for (const date of ['2025-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-2-1', '1899-12-31', '', null]) assert.equal(validDate(date), false);
});
test('date helpers cross months and years and use local calendar dates', () => {
  assert.equal(dateKey(new Date(2026, 0, 2, 23, 59)), '2026-01-02');
  assert.equal(shiftDate('2024-03-01', -1), '2024-02-29');
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
  assert.equal(monthKey(-1, '2026-01-31'), '2025-12');
  assert.equal(monthKey(1, '2026-01-31'), '2026-02');
});
test('regular training saves without distance, duration or style', () => {
  assert.deepEqual(validateWorkout(workout(), TODAY), workout());
});
test('timed swim needs distance, result and style', () => {
  for (const overrides of [{ distance: null }, { duration: null }, { style: '' }]) assert.throws(() => validateWorkout(timed(overrides), TODAY), /нужны/);
  assert.equal(validateWorkout(timed(), TODAY).duration, 120);
});
test('workout validation rejects unsafe and invalid field values', () => {
  for (const overrides of [
    { distance: 0 }, { distance: -1 }, { distance: 1.5 }, { distance: 100001 }, { distance: '100' },
    { duration: 0 }, { duration: Infinity }, { duration: 1.5 }, { duration: 604801 },
    { style: 'unknown' }, { style: '__proto__' }, { type: 'other' },
    { date: '2026-10-21' }, { date: '2026-02-30' },
    { comment: 'x'.repeat(2001) }, { comment: null }, { createdAt: '' },
    { id: '<script>' }, { id: '' },
  ]) assert.throws(() => validateWorkout(workout(overrides), TODAY));
  assert.throws(() => validateWorkout(null, TODAY));
});
test('normalization trims comments and excludes unknown properties', () => {
  const result = validateWorkout(workout({ comment: '  Хороший день  ', unexpected: true }), TODAY);
  assert.equal(result.comment, 'Хороший день');
  assert.equal(Object.hasOwn(result, 'unexpected'), false);
});
test('pace is calculated only for timed swims and rounds for display', () => {
  assert.equal(pace(timed({ distance: 400, duration: 600 })), 150);
  assert.equal(formatTime(pace(timed({ distance: 75, duration: 100 }))), '2:13');
  assert.equal(pace(workout({ distance: 1000, duration: 3600 })), null);
  assert.equal(formatTime(119.6), '2:00');
  assert.equal(formatTime(null), '—');
  assert.equal(formatTime(3600), '60:00');
});
test('zero or one distinct visit cannot establish regularity', () => {
  assert.equal(regularity([], TODAY).average, null);
  assert.equal(regularity([], TODAY).lastDate, null);
  assert.equal(regularity([workout(), workout({ id: 'two' })], TODAY).average, null);
});
test('regularity deduplicates days, sorts input and averages all gaps', () => {
  const entries = [workout({ date: '2026-10-09' }), workout(), workout({ id: 'two' }), workout({ date: '2026-10-05' })];
  const result = regularity(entries, TODAY);
  assert.equal(result.days, 3);
  assert.equal(result.average, 4);
  assert.equal(result.lastDate, '2026-10-09');
  assert.equal(result.elapsed, 11);
  assert.equal(result.overdue, true);
});
test('friendly reminder has a strict and documented threshold', () => {
  const entries = [workout({ date: '2026-10-01' }), workout({ id: 'two', date: '2026-10-05' })];
  assert.equal(regularity(entries, '2026-10-11').overdue, false);
  assert.equal(regularity(entries, '2026-10-12').overdue, true);
  const daily = [workout({ date: '2026-10-01' }), workout({ id: 'two', date: '2026-10-02' })];
  assert.equal(regularity(daily, '2026-10-04').overdue, false);
  assert.equal(regularity(daily, '2026-10-05').overdue, true);
});
test('calendar arithmetic is unaffected by daylight saving boundaries', () => {
  assert.equal(regularity([workout({ date: '2026-03-28' }), workout({ date: '2026-03-30' })], TODAY).average, 2);
});
test('summary counts all workouts but adds only known distance; week starts Monday', () => {
  const entries = [
    workout({ id: '1', date: '2026-09-30', distance: 500 }),
    workout({ id: '2', date: '2026-10-18', distance: 1000 }),
    workout({ id: '3', date: '2026-10-19', distance: null }),
    timed({ id: '4', date: '2026-10-19' }),
    workout({ id: '5', date: '2026-10-20', distance: 1500 }),
  ];
  const result = summary(entries, TODAY);
  assert.equal(result.total, 5);
  assert.equal(result.distance, 3100);
  assert.equal(result.monthCount, 4);
  assert.equal(result.monthDistance, 2600);
  assert.equal(result.weekCount, 3);
  assert.equal(result.days, 4);
  assert.equal(result.unknownDistance, 1);
  assert.equal(summary(entries, '2026-10-18').weekCount, 1);
});
test('future entries do not affect current summary or regularity', () => {
  const result = summary([workout(), workout({ date: '2026-11-01', distance: 900 })], TODAY);
  assert.equal(result.total, 1);
  assert.equal(result.distance, 0);
  assert.equal(result.lastDate, '2026-10-01');
});
test('personal bests remain separate by style AND distance; ties retain first', () => {
  const entries = [
    timed({ id: 'a', duration: 130 }),
    timed({ id: 'b', duration: 120, date: '2026-10-02' }),
    timed({ id: 'tie', duration: 120, date: '2026-10-03' }),
    timed({ id: 'c', duration: 240, distance: 200 }),
    timed({ id: 'd', duration: 140, style: 'breaststroke' }),
    workout({ id: 'regular', distance: 100, duration: 60, style: 'freestyle' }),
  ];
  const records = personalBests(entries);
  assert.equal(records.length, 3);
  assert.deepEqual(new Set(records.map(w => w.id)), new Set(['b', 'c', 'd']));
});
test('comparison picks the most recent earlier matching swim, including same-day order', () => {
  const current = timed({ id: 'current', date: '2026-10-10', createdAt: '2026-10-10T10:00:00Z' });
  const previous = timed({ id: 'previous', date: '2026-10-10', createdAt: '2026-10-10T09:00:00Z' });
  const entries = [
    current, previous, timed({ id: 'old', date: '2026-10-09' }),
    timed({ id: 'future', date: '2026-10-11' }),
    timed({ id: 'other', date: '2026-10-10', distance: 200 }),
  ];
  assert.equal(previousResult(entries, current).id, 'previous');
  assert.equal(previousResult([current], current), null);
});
test('monthly and weekly charts fill gaps and respect year boundaries', () => {
  const entries = [workout({ date: '2025-12-31', distance: 300 }), workout({ date: '2026-01-01' }), workout({ date: '2026-01-04', distance: 500 }), workout({ date: '2026-01-05', distance: 100 })];
  const months = monthlySeries(entries, '2026-01-05', 3);
  assert.deepEqual(months, [{ key: '2025-11', count: 0, distance: 0 }, { key: '2025-12', count: 1, distance: 300 }, { key: '2026-01', count: 3, distance: 600 }]);
  assert.deepEqual(weeklySeries(entries, '2026-01-05', 2), [{ key: '2025-12-29', count: 3 }, { key: '2026-01-05', count: 1 }]);
});
test('pace history filters both distance and style, then sorts', () => {
  const selected = timed({ id: 'a', date: '2026-10-03' });
  const entries = [selected, timed({ id: 'b', date: '2026-10-01' }), timed({ distance: 200 }), timed({ style: 'backstroke' }), workout()];
  const series = paceSeries(entries, recordKey(selected));
  assert.deepEqual(series.map(w => w.id), ['b', 'a']);
  assert.equal(series[0].pace, 120);
  assert.equal(sortedWorkouts(series)[0].id, 'a');
});
test('backup round trip preserves every supported field', () => {
  const entries = [workout({ comment: 'Заметка: вода 💧 <script>' }), timed({ id: 'two' })];
  assert.deepEqual(parseBackup(backupJSON(entries), TODAY), entries);
  assert.deepEqual(parseBackup(backupJSON([]), TODAY), []);
});
test('import rejects malformed JSON, unsupported version, duplicates and invalid entries atomically', () => {
  for (const input of ['{broken', 'null', '[]', '{}', '{"version":2,"workouts":[]}', '{"version":1,"workouts":{}}']) assert.throws(() => parseBackup(input, TODAY));
  assert.throws(() => parseBackup(backupJSON([workout(), workout()]), TODAY), /повторяется/);
  assert.throws(() => parseBackup(backupJSON([workout(), timed({ id: 'two', duration: null })]), TODAY), /Запись 2/);
  assert.throws(() => parseBackup(backupJSON(Array(10001).fill(workout())), TODAY), /10 000/);
});
test('demo dates are relative, valid, and include comparable timed results', () => {
  const demo = createDemo(TODAY);
  demo.forEach(w => assert.doesNotThrow(() => validateWorkout(w, TODAY)));
  assert.equal(demo.at(-1).date, '2026-10-19');
  assert.equal(new Set(demo.map(w => w.id)).size, demo.length);
  assert.equal(paceSeries(demo, '100:freestyle').length, 3);
});
