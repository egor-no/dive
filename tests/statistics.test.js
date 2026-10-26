import test from 'node:test';
import assert from 'node:assert/strict';
import { recordKey, shiftDate } from '../src/domain.js';
import { statisticsWorkouts, statisticsData, dailyPaceSeries } from '../src/statistics.js';

let serial = 0;
const training = (date, changes = {}) => ({
  id: `w-${++serial}`, date, title: '', status: 'COMPLETED', blocks: [], distance: null,
  durationCs: null, style: '', comment: '', createdAt: `${date}T08:00:00Z`, ...changes,
});
const timed = (date, times, exerciseChanges = {}, workoutChanges = {}) => training(date, {
  blocks: [{ id: `b-${++serial}`, title: 'Блок', rounds: Math.max(1, times.length), restBetweenCs: null, restAfterCs: null,
    exercises: [{ id: `e-${++serial}`, distance: 100, style: 'freestyle', technique: '', description: '',
      plannedTimeCs: null, restAfterCs: null, resultMode: 'rounds',
      results: times.map((timeCs, index) => ({ id: `r-${++serial}`, timeCs, round: index + 1 })), ...exerciseChanges }] }],
  ...workoutChanges,
});

test('periods use local calendar dates, Monday boundaries and include today but never the future', () => {
  const dates = ['2025-12-28', '2025-12-29', '2025-12-31', '2026-01-01', '2026-01-02'];
  const entries = dates.map(date => training(date));
  // Timestamp timezone must not shift the explicitly saved local workout date.
  entries[3].createdAt = '2025-12-31T23:30:00Z';
  const before = structuredClone(entries);
  const selectedDates = period => statisticsWorkouts(entries, period, '2026-01-01').map(w => w.date);
  assert.deepEqual(selectedDates('week'), dates.slice(1, 4));
  assert.deepEqual(selectedDates('month'), ['2026-01-01']);
  assert.deepEqual(selectedDates('all'), dates.slice(0, 4));
  assert.deepEqual(entries, before);
  assert.deepEqual(statisticsWorkouts(entries, 'week', '2025-12-29').map(w => w.date), ['2025-12-29']);
  assert.deepEqual(statisticsWorkouts(entries, 'week', '2026-01-04').map(w => w.date), dates.slice(1));
});

test('averages count unique days, include unknown-distance visits and stay inside the period', () => {
  const entries = [training('2026-09-30', { distance: 9000 }), training('2026-10-15', { distance: 500 }),
    training('2026-10-19', { distance: 1000, status: 'PLANNED' }), training('2026-10-19'),
    training('2026-10-21', { distance: 500 }), training('2026-10-22', { distance: 9999 })];
  const week = statisticsData(entries, 'week', '2026-10-21').stats;
  assert.equal(week.total, 3);
  assert.equal(week.distance, 1500);
  assert.equal(week.days, 2);
  assert.equal(week.average, 2);
  assert.equal(week.averageDistance, 500);
  assert.equal(week.unknownDistance, 1);
  const month = statisticsData(entries, 'month', '2026-10-21').stats;
  assert.equal(month.total, 4);
  assert.equal(month.distance, 2000);
  assert.equal(month.average, 3);
  assert.equal(month.averageDistance, 500);
  const empty = statisticsData([], 'all', '2026-10-21').stats;
  assert.equal(empty.average, null);
  assert.equal(empty.averageDistance, 0);
  const sameDay = statisticsData(entries.slice(2, 4), 'week', '2026-10-21').stats;
  assert.equal(sameDay.average, null);
  assert.equal(sameDay.averageDistance, 500);
});

test('weekly charts contain all seven dates and distinguish future days from zero visits', () => {
  const entries = [training('2026-10-18', { distance: 999 }), training('2026-10-19', { distance: 100 }),
    training('2026-10-19'), training('2026-10-21', { distance: 300 }), training('2026-10-22', { distance: 999 })];
  const { chartSeries } = statisticsData(entries, 'week', '2026-10-21');
  assert.deepEqual(chartSeries.map(p => p.key), Array.from({ length: 7 }, (_, i) => shiftDate('2026-10-19', i)));
  assert.deepEqual(chartSeries.map(p => p.count), [2, 0, 1, null, null, null, null]);
  assert.deepEqual(chartSeries.map(p => p.distance), [100, 0, 300, null, null, null, null]);
  assert.deepEqual(chartSeries.map(p => p.future), [false, false, false, true, true, true, true]);
});

test('all keeps six monthly buckets while month charts use full weeks, including leap day', () => {
  const entries = [training('2023-08-31', { distance: 900 }), training('2023-09-01', { distance: 100 }),
    training('2024-01-31', { distance: 200 }), training('2024-02-29', { distance: 300 }),
    training('2024-03-01', { distance: 999 })];
  const month = statisticsData(entries, 'month', '2024-02-29');
  const all = statisticsData(entries, 'all', '2024-02-29');
  assert.deepEqual(all.chartSeries.map(p => p.key), ['2023-09', '2023-10', '2023-11', '2023-12', '2024-01', '2024-02']);
  assert.deepEqual(all.chartSeries.map(p => p.distance), [100, 0, 0, 0, 200, 300]);
  assert.deepEqual(month.chartSeries.map(p => [p.key, p.end]), [
    ['2024-01-29', '2024-02-04'], ['2024-02-05', '2024-02-11'], ['2024-02-12', '2024-02-18'],
    ['2024-02-19', '2024-02-25'], ['2024-02-26', '2024-03-03'],
  ]);
  assert.deepEqual(month.chartSeries.map(p => p.count), [1, 0, 0, 0, 1]);
  assert.deepEqual(month.chartSeries.map(p => p.distance), [200, 0, 0, 0, 300]);
  assert.equal(month.stats.distance, 300);
  assert.equal(all.stats.distance, 1500);
  assert.equal(month.stats.total, 1);
  assert.equal(month.stats.average, null);
});

test('month charts include adjacent-month days through today and leave future weeks without data', () => {
  const entries = [training('2026-09-30', { distance: 999 }), training('2026-10-01', { distance: 100 }),
    training('2026-10-04', { distance: 200 }), training('2026-10-05', { distance: 500 }),
    training('2026-10-19', { distance: 300 }), training('2026-10-19'), training('2026-10-21', { distance: 500 }),
    training('2026-10-22', { distance: 999 }), training('2026-10-27', { distance: 999 }),
    training('2026-11-01', { distance: 999 })];
  const { chartSeries, stats } = statisticsData(entries, 'month', '2026-10-21');
  assert.deepEqual(chartSeries.map(p => [p.key, p.end]), [
    ['2026-09-28', '2026-10-04'], ['2026-10-05', '2026-10-11'], ['2026-10-12', '2026-10-18'],
    ['2026-10-19', '2026-10-25'], ['2026-10-26', '2026-11-01'],
  ]);
  assert.deepEqual(chartSeries.map(p => p.count), [3, 1, 0, 3, null]);
  assert.deepEqual(chartSeries.map(p => p.distance), [1299, 500, 0, 800, null]);
  assert.deepEqual(chartSeries.map(p => p.future), [false, false, false, false, true]);
  assert.equal(stats.total, 6);
  assert.equal(stats.distance, 1600);
});

test('month charts cover four or six full weeks, including weeks crossing a year boundary', () => {
  for (const [first, last, ranges] of [
    ['2021-02-01', '2021-02-28', [[1, 7], [8, 14], [15, 21], [22, 28]]],
    ['2026-03-01', '2026-03-31', [[23, 1], [2, 8], [9, 15], [16, 22], [23, 29], [30, 5]]],
    ['2026-01-01', '2026-01-31', [[29, 4], [5, 11], [12, 18], [19, 25], [26, 1]]],
  ]) {
    const entries = [training(shiftDate(first, -1), { distance: 999 }), training(first, { distance: 100 }),
      training(last, { distance: 200 }), training(shiftDate(last, 1), { distance: 999 })];
    const { chartSeries } = statisticsData(entries, 'month', last);
    assert.deepEqual(chartSeries.map(p => [Number(p.key.slice(-2)), Number(p.end.slice(-2))]), ranges);
    const includesPreviousMonth = chartSeries[0].key < first;
    assert.equal(chartSeries[0].count, includesPreviousMonth ? 2 : 1);
    assert.equal(chartSeries.at(-1).count, 1);
    assert.equal(chartSeries.reduce((sum, p) => sum + p.distance, 0), includesPreviousMonth ? 1299 : 300);
    chartSeries.forEach(p => {
      assert.equal(new Date(`${p.key}T12:00:00Z`).getUTCDay(), 1);
      assert.equal(p.end, shiftDate(p.key, 6));
    });
    assert.ok(chartSeries.every(p => !p.future));
  }
});

test('month chart expansion never changes monthly metrics, records or pace selection', () => {
  const previous = timed('2026-09-30', [7000]);
  const current = timed('2026-10-01', [8000]);
  const entries = [timed('2026-09-27', [6000]), previous, current, timed('2026-10-02', [5000])];
  const { chartSeries, selected, stats, records } = statisticsData(entries, 'month', '2026-10-01');
  assert.equal(chartSeries[0].count, 2);
  assert.equal(chartSeries[0].distance, 200);
  assert.ok(chartSeries.slice(1).every(p => p.future && p.count === null && p.distance === null));
  assert.deepEqual(selected, [current]);
  assert.equal(stats.total, 1);
  assert.equal(stats.distance, 100);
  assert.equal(stats.averageDistance, 100);
  assert.equal(stats.average, null);
  assert.equal(records[0].timeCs, 8000);
  assert.deepEqual(dailyPaceSeries(selected, '100:freestyle').map(p => [p.date, p.timeCs]), [['2026-10-01', 8000]]);
});

test('daily pace takes the best actual time across rounds, exercises, blocks and workouts without mutation', () => {
  const first = timed('2026-10-17', [8000, 7800]);
  const later = timed('2026-10-17', [7600]);
  first.blocks.push(...timed('2026-10-17', [7900]).blocks);
  first.blocks[0].exercises.push(...timed('2026-10-17', [7700]).blocks[0].exercises);
  const bestOnly = timed('2026-10-20', [], { resultMode: 'best', results: [{ id: 'best', round: null, timeCs: 7500 }] });
  const noResult = timed('2026-10-18', [], { plannedTimeCs: 5000 });
  const entries = [bestOnly, later, noResult, first, timed('2026-10-15', [8100])];
  const before = structuredClone(entries);
  const series = dailyPaceSeries(entries, '100:freestyle');
  assert.deepEqual(series.map(p => [p.date, p.timeCs, p.pace]), [
    ['2026-10-15', 8100, 81], ['2026-10-17', 7600, 76], ['2026-10-20', 7500, 75],
  ]);
  assert.deepEqual(entries, before);
  assert.equal(dailyPaceSeries([first, later], '100:freestyle').length, 1);
  assert.deepEqual(dailyPaceSeries([noResult], '100:freestyle'), []);
});

test('daily pace ignores invalid times and keeps distance, style and normalized technique separate', () => {
  const entries = [timed('2026-10-17', [0, -1, NaN, Infinity, 1.5, null, '7000', 60480001, 8000]),
    timed('2026-10-17', [5000], { distance: 50 }), timed('2026-10-17', [7000], { style: 'breaststroke' }),
    timed('2026-10-17', [7500], { technique: ' НОГАМИ  с доской ' }),
    timed('2026-10-17', [7400], { technique: 'ногами с доской' })];
  assert.equal(dailyPaceSeries(entries, '100:freestyle')[0].timeCs, 8000);
  assert.equal(dailyPaceSeries(entries, '50:freestyle')[0].timeCs, 5000);
  assert.equal(dailyPaceSeries(entries, '100:breaststroke')[0].timeCs, 7000);
  assert.equal(dailyPaceSeries(entries, '100:freestyle:ногами с доской')[0].timeCs, 7400);
});

test('records and daily pace use the same selected period and exclude faster future results', () => {
  const entries = [timed('2026-09-30', [7000]), timed('2026-10-17', [7600]), timed('2026-10-19', [7800]),
    timed('2026-10-21', [7900]), timed('2026-10-22', [6000]), timed('2026-09-30', [4900], { distance: 50 })];
  for (const [period, expectedTime, expectedDates, recordCount] of [
    ['week', 7800, ['2026-10-19', '2026-10-21'], 1],
    ['month', 7600, ['2026-10-17', '2026-10-19', '2026-10-21'], 1],
    ['all', 7000, ['2026-09-30', '2026-10-17', '2026-10-19', '2026-10-21'], 2],
  ]) {
    const { selected, records } = statisticsData(entries, period, '2026-10-21');
    assert.equal(records.length, recordCount);
    assert.equal(records.find(r => recordKey(r) === '100:freestyle').timeCs, expectedTime);
    assert.deepEqual(dailyPaceSeries(selected, '100:freestyle').map(p => p.date), expectedDates);
  }
});
