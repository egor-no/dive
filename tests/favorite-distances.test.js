import test from 'node:test';
import assert from 'node:assert/strict';
import { totalDistance } from '../src/domain.js';
import { favoriteDistances, statisticsData } from '../src/statistics.js';

let serial = 0;
const exercise = (changes = {}) => ({ id: `e-${++serial}`, distance: 100, style: 'freestyle', technique: '',
  description: '', plannedTimeCs: null, restAfterCs: null, resultMode: 'rounds', results: [], ...changes });
const block = (rounds, exercises) => ({ id: `b-${++serial}`, title: '', rounds, exercises, restBetweenCs: null, restAfterCs: null });
const workout = (date, blocks = [], changes = {}) => ({ id: `w-${++serial}`, date, blocks, status: 'COMPLETED', title: '',
  distance: null, durationCs: null, style: '', comment: '', createdAt: `${date}T08:00:00Z`, ...changes });

test('favorite distances count all rounds across blocks and workouts, including unrecorded and best-only repeats', () => {
  const bestOnly = exercise({ resultMode: 'best', results: [{ id: 'best', round: null, timeCs: 8000 }] });
  const entries = [workout('2026-10-01', [block(4, [exercise()]), block(1, [exercise({ distance: 400 })]), block(2, [bestOnly])]),
    workout('2026-10-02', [block(3, [exercise(), exercise()])], { status: 'PLANNED' })];
  const before = structuredClone(entries);
  const favorites = statisticsData(entries, 'month', '2026-10-02').favorites;
  assert.deepEqual(favorites.map(item => [item.distance, item.count, item.totalDistance]), [[100, 12, 1200], [400, 1, 400]]);
  assert.equal(favorites.reduce((sum, item) => sum + item.totalDistance, 0), entries.reduce((sum, entry) => sum + totalDistance(entry), 0));
  assert.deepEqual(entries, before);
});

test('favorite distances normalize techniques while keeping ordinary strokes and different styles separate', () => {
  const entries = [workout('2026-10-01', [block(2, [exercise(), exercise({ technique: ' С ЛЁГКИМИ   ластами ' })])]),
    workout('2026-10-02', [block(1, [exercise({ technique: '   ' }), exercise({ technique: 'с легкими ластами' }),
      exercise({ style: 'breaststroke', technique: 'с легкими ластами' })])])];
  const favorites = favoriteDistances(entries);
  assert.deepEqual(favorites.map(item => [item.key, item.count]), [
    ['100:freestyle', 3], ['100:freestyle:с легкими ластами', 3], ['100:breaststroke:с легкими ластами', 1],
  ]);
  assert.equal(favorites[0].technique, '');
  assert.equal(favorites[1].technique, 'с легкими ластами');
});

test('favorite distances rank by count, then total metres, then Russian name and return at most three', () => {
  const exercises = [
    block(3, [exercise(), exercise({ style: 'mixed' }), exercise({ style: 'breaststroke' })]),
    block(2, [exercise({ distance: 800 })]),
    block(4, [exercise({ distance: 50, style: 'backstroke' })]),
    block(3, [exercise({ distance: 400 })]),
  ];
  const entries = [workout('2026-10-01', exercises)];
  const expected = [['50:backstroke', 4, 200], ['400:freestyle', 3, 1200], ['100:breaststroke', 3, 300]];
  const result = () => favoriteDistances(entries).map(item => [item.key, item.count, item.totalDistance]);
  assert.deepEqual(result(), expected);
  exercises.reverse();
  assert.deepEqual(result(), expected);
});

test('favorite distances use strict numeric-statistic periods, not expanded month-chart weeks or future dates', () => {
  const entries = [
    ['2025-12-01', 1], ['2026-09-27', 2], ['2026-09-28', 3], ['2026-09-30', 4], ['2026-10-01', 5], ['2026-10-02', 9],
  ].map(([date, rounds]) => workout(date, [block(rounds, [exercise()])]));
  for (const [period, count] of [['week', 12], ['month', 5], ['all', 15]]) {
    const data = statisticsData(entries, period, '2026-10-01');
    assert.equal(data.favorites.length, 1);
    assert.equal(data.favorites[0].count, count);
    assert.equal(data.favorites[0].totalDistance, count * 100);
    assert.equal(data.stats.distance, count * 100);
  }
  const month = statisticsData(entries, 'month', '2026-10-01');
  assert.equal(month.chartSeries[0].distance, 1200);
  assert.equal(month.favorites[0].totalDistance, 500);
});

test('favorite distances return only available exercises and never invent entries for legacy workout totals', () => {
  assert.deepEqual(favoriteDistances([]), []);
  assert.deepEqual(favoriteDistances([workout('2026-10-01', [], { distance: 1200 }), workout('2026-10-02')]), []);
  const entry = workout('2026-10-01', [block(1, [exercise()])]);
  assert.equal(favoriteDistances([entry]).length, 1);
  entry.blocks[0].exercises.push(exercise({ distance: 400 }));
  assert.equal(favoriteDistances([entry]).length, 2);
});
