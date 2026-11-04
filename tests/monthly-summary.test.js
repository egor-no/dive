import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, monthKey, recordKey } from '../src/domain.js';
import { monthLastDay, latestSummaryMonth, isSummaryMonthAvailable, monthlySummary, summaryAnnouncementMonth } from '../src/monthly-summary.js';
import { renderMonthCard, monthCardPNG } from '../src/monthly-card.js';

let serial = 0;
const exercise = (times = [], changes = {}) => ({ id: `e-${++serial}`, distance: 100, style: 'freestyle', technique: '',
  description: '', plannedTimeCs: null, restAfterCs: null, resultMode: 'rounds',
  results: times.map((timeCs, index) => ({ id: `r-${++serial}`, round: index + 1, timeCs })), ...changes });
const block = (exercises, rounds = 1) => ({ id: `b-${++serial}`, title: '', rounds, exercises, restBetweenCs: null, restAfterCs: null });
const workout = (date, blocks = [], changes = {}) => ({ id: `w-${++serial}`, date, blocks, status: 'COMPLETED', title: '',
  comment: '', distance: null, durationCs: null, style: '', createdAt: `${date}T08:00:00Z`, ...changes });
const swim = (date, timeCs, changes = {}) => workout(date, [block([exercise([timeCs], changes)])]);
const october = entries => monthlySummary(entries, '2026-10', '2026-11-15');

test('availability uses the local calendar and opens the current month on its last day', () => {
  assert.equal(latestSummaryMonth('2026-11-15'), '2026-10');
  assert.equal(isSummaryMonthAvailable('2026-11', '2026-11-29'), false);
  const localMidnight = dateKey(new Date(2026, 10, 30, 0, 1));
  assert.equal(latestSummaryMonth(localMidnight), '2026-11');
  assert.equal(isSummaryMonthAvailable('2026-11', localMidnight), true);
  assert.equal(latestSummaryMonth('2026-12-01'), '2026-11');
  assert.equal(isSummaryMonthAvailable('2026-12', localMidnight), false);
  assert.equal(isSummaryMonthAvailable('2020-01', localMidnight), true);
  for (const invalid of ['', '2026-13', '2026-00', '2026-1', '1899-12', 'garbage']) {
    assert.equal(isSummaryMonthAvailable(invalid, localMidnight), false);
  }
});

test('February, leap years and December/January boundaries are handled', () => {
  assert.equal(monthLastDay('2024-02'), '2024-02-29');
  assert.equal(monthLastDay('2026-02'), '2026-02-28');
  assert.equal(monthLastDay('1900-02'), '1900-02-28');
  assert.equal(monthLastDay('2000-02'), '2000-02-29');
  assert.equal(latestSummaryMonth('2024-02-28'), '2024-01');
  assert.equal(latestSummaryMonth('2024-02-29'), '2024-02');
  assert.equal(latestSummaryMonth('2027-01-01'), '2026-12');
  assert.equal(latestSummaryMonth('2026-12-31'), '2026-12');
  assert.equal(isSummaryMonthAvailable('2027-01', '2026-12-31'), false);
});

test('monthly totals reuse full block distance and count every visit, including unknown distance and old statuses', () => {
  const entries = [
    workout('2026-09-30', [], { distance: 400 }),
    workout('2026-10-01', [block([exercise([], { distance: 50 }), exercise([], { distance: 100 })], 4)], { status: 'PLANNED' }),
    workout('2026-10-01'),
    workout('2026-10-31', [], { distance: 200 }),
    workout('2026-11-01', [], { distance: 900 }),
  ];
  const data = october(entries);
  assert.equal(data.trainingCount, 3);
  assert.equal(data.distance, 800);
  assert.equal(data.averageDistance, 800 / 3);
  assert.equal(data.newRecords, 0);
  assert.equal(data.previousDistance, 400);
  assert.equal(data.distanceChangePercent, 100);
  assert.equal(data.previousMonth, '2026-09');
});

test('empty months, missing/zero previous distance and negative change never produce NaN or infinity', () => {
  const empty = october([]);
  assert.equal(empty.distance, 0);
  assert.equal(empty.trainingCount, 0);
  assert.equal(empty.averageDistance, 0);
  assert.equal(empty.newRecords, 0);
  assert.equal(empty.distanceChangePercent, null);
  assert.equal(october([workout('2026-09-01'), workout('2026-10-01', [], { distance: 100 })]).distanceChangePercent, null);
  assert.equal(october([workout('2026-09-01', [], { distance: 100 })]).distanceChangePercent, -100);
  const january = monthlySummary([workout('2026-12-31', [], { distance: 100 }), workout('2027-01-01', [], { distance: 50 })], '2027-01', '2027-01-31');
  assert.equal(january.previousMonth, '2026-12');
  assert.equal(january.distanceChangePercent, -50);
});

test('record events use prior history, count every strict improvement and retain events superseded later', () => {
  const repeats = exercise([8901, 8900, 8900, 9000, 8899]);
  repeats.results.reverse();
  const entries = [swim('2026-09-30', 9000), workout('2026-10-17', [block([repeats], 5)]),
    swim('2026-10-18', 9000), swim('2026-11-01', 5000), swim('2027-01-01', 4000)];
  assert.equal(october(entries).newRecords, 3);
  assert.equal(october([workout('2026-10-01', [block([exercise([9000, 8900, 8800, 8700])], 4)])]).newRecords, 4);
});

test('within-day order uses workout creation, blocks, rounds and exercises, rather than storage order', () => {
  const a = exercise([8000, 7700]); a.results.reverse();
  const b = exercise([7900, 7800]);
  const middle = workout('2026-10-17', [block([a, b], 2), block([exercise([7600])])], { createdAt: '2026-10-17T09:00:00Z' });
  const early = swim('2026-10-17', 9000);
  const late = workout('2026-10-17', [block([exercise([7500])])], { createdAt: '2026-10-17T10:00:00Z' });
  assert.equal(october([late, middle, early]).newRecords, 6);
});

test('normalized techniques share a record, while distances, strokes and ordinary swimming stay separate', () => {
  const entries = [swim('2026-09-01', 8000, { technique: ' НОГАМИ  С ДОСКОЙ ' }),
    swim('2026-10-01', 8500, { technique: 'ногами с доской' }), // Slower than previous month.
    swim('2026-10-02', 7900, { technique: 'ногами с доской' }),
    swim('2026-10-02', 3000), swim('2026-10-02', 4000, { distance: 50 }),
    swim('2026-10-02', 5000, { style: 'breaststroke' })];
  assert.equal(october(entries).newRecords, 4);
});

test('invalid times and planned values are ignored; best-only measured results count', () => {
  const invalid = exercise([null, 0, -1, 100.5, Infinity, NaN, 60480001], { plannedTimeCs: 2000, restAfterCs: 1000 });
  const best = exercise([], { resultMode: 'best', results: [{ id: 'best', round: null, timeCs: 6001 }] });
  assert.equal(october([workout('2026-10-01', [block([invalid], 7), block([best], 4)], { durationCs: 100000 })]).newRecords, 1);
});

test('editing/deleting older entries recalculates summaries without mutating or caching workouts', () => {
  const baseline = swim('2026-09-01', 8000);
  const current = swim('2026-10-01', 8500);
  const entries = [baseline, current];
  const snapshot = structuredClone(entries);
  assert.equal(october(entries).newRecords, 0);
  assert.deepEqual(entries, snapshot);
  baseline.blocks[0].exercises[0].results[0].timeCs = 9000;
  assert.equal(october(entries).newRecords, 1);
  assert.equal(october([current]).newRecords, 1);
  current.blocks[0].rounds = 3;
  assert.equal(october(entries).distance, 300);
  assert.equal(october([baseline]).trainingCount, 0);
});

test('unavailable months are rejected by calculations, rendering and the PNG export entry point', async () => {
  assert.throws(() => monthlySummary([], '2026-11', '2026-11-29'), /последнего календарного дня/);
  const future = monthKey(1, dateKey());
  const canvas = { getContext() { assert.fail('An unavailable month must never reach rendering'); } };
  assert.throws(() => renderMonthCard(canvas, { month: future }), /последнего календарного дня/);
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { fonts: { ready: Promise.resolve() } } });
  try {
    await assert.rejects(monthCardPNG(canvas, [], future, 'paper'), /последнего календарного дня/);
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete globalThis.document;
  }
});

test('monthly record list compares against the best of all dates strictly before the month', () => {
  const entries = [swim('2026-06-01', 8001), swim('2026-09-30', 9000),
    swim('2026-10-01', 8500), swim('2026-10-02', 8001), swim('2026-10-31', 8000),
    swim('2026-11-01', 5000),
    swim('2025-12-01', 10000, { style: 'breaststroke' }),
    swim('2026-10-01', 9999, { style: 'breaststroke' })];
  const data = october(entries);
  assert.equal(data.records.length, 2);
  const freestyle = data.records.find(record => record.style === 'freestyle');
  assert.equal(freestyle.previousBestCs, 8001);
  assert.equal(freestyle.timeCs, 8000);
  assert.equal(freestyle.improvementCs, 1);
  assert.equal(freestyle.eventCount, 1);
  const breaststroke = data.records.find(record => record.style === 'breaststroke');
  assert.equal(breaststroke.previousBestCs, 10000);
  assert.equal(breaststroke.improvementCs, 1);
  assert.equal(data.newRecords, 2);
});

test('monthly record list collapses repeated improvements but keeps the first result and event count semantics', () => {
  const repeats = exercise([9000, 8800, 8800, 8900, 8700]);
  repeats.results.reverse();
  const data = october([workout('2026-10-01', [block([repeats], 5)]), swim('2026-10-02', 8600)]);
  assert.equal(data.records.length, 1);
  assert.equal(data.records[0].timeCs, 8600);
  assert.equal(data.records[0].previousBestCs, null);
  assert.equal(data.records[0].improvementCs, null);
  assert.equal(data.records[0].eventCount, 4);
  assert.equal(data.newRecords, 4);
  const withBaseline = october([swim('2026-05-01', 10001), workout('2026-10-01', [block([repeats], 5)])]);
  assert.equal(withBaseline.records[0].eventCount, 3);
  assert.equal(withBaseline.records[0].improvementCs, 1301);
  assert.equal(withBaseline.newRecords, 3);
});

test('monthly record list normalizes techniques without combining distinct disciplines or including ties', () => {
  const entries = [swim('2026-07-01', 8000, { technique: ' НОГАМИ  С ДОСКОЙ ' }),
    swim('2026-10-01', 7999, { technique: 'ногами с доской' }),
    swim('2026-10-02', 7900, { technique: 'Ногами с доской' }),
    swim('2026-10-02', 3000), swim('2026-10-02', 4000, { distance: 50 }),
    swim('2026-08-01', 6000, { style: 'backstroke' }),
    swim('2026-10-01', 6000, { style: 'backstroke' }), swim('2026-10-02', 6500, { style: 'backstroke' })];
  const data = october(entries);
  assert.deepEqual(new Set(data.records.map(recordKey)), new Set(['100:freestyle:ногами с доской', '100:freestyle', '50:freestyle']));
  const technique = data.records.find(record => record.technique);
  assert.equal(technique.timeCs, 7900);
  assert.equal(technique.improvementCs, 100);
  assert.equal(technique.eventCount, 2);
  assert.equal(data.newRecords, data.records.reduce((sum, record) => sum + record.eventCount, 0));
});

test('monthly record list is empty without strict improvements and recalculates after historical edits or deletion', () => {
  const old = swim('2025-01-01', 8000);
  const current = swim('2026-10-01', 8500);
  const entries = [old, current];
  const before = structuredClone(entries);
  assert.deepEqual(october([]).records, []);
  assert.deepEqual(october(entries).records, []);
  assert.deepEqual(entries, before);
  old.blocks[0].exercises[0].results[0].timeCs = 9001;
  assert.equal(october(entries).records[0].improvementCs, 501);
  assert.equal(october([current]).records[0].previousBestCs, null);
  assert.equal(october([current]).records[0].eventCount, 1);
  assert.deepEqual(october([old]).records, []);
});

test('summary announcement is shown only on local days 1 through 7 with previous-month visits', () => {
  const entries = [workout('2026-10-31')];
  const firstLocalDay = dateKey(new Date(2026, 10, 1, 0, 1));
  assert.equal(summaryAnnouncementMonth(entries, firstLocalDay), '2026-10');
  assert.equal(summaryAnnouncementMonth(entries, '2026-11-07'), '2026-10');
  assert.equal(summaryAnnouncementMonth(entries, '2026-11-08'), null);
  assert.equal(summaryAnnouncementMonth(entries, '2026-11-30'), null);
  assert.equal(summaryAnnouncementMonth([], firstLocalDay), null);
  assert.equal(summaryAnnouncementMonth([workout('2026-09-30'), workout('2026-11-01'), workout('2026-12-01')], firstLocalDay), null);
  // During the entire announcement window the existing #month route defaults to this month.
  assert.equal(latestSummaryMonth(firstLocalDay), summaryAnnouncementMonth(entries, firstLocalDay));
  assert.equal(latestSummaryMonth('2026-11-07'), summaryAnnouncementMonth(entries, '2026-11-07'));
});

test('summary announcement handles year/leap boundaries and recomputes from visits without requiring distances or results', () => {
  const entries = [workout('2026-12-31', [], { status: 'PLANNED' })];
  assert.equal(summaryAnnouncementMonth(entries, '2027-01-01'), '2026-12');
  assert.equal(summaryAnnouncementMonth([workout('2024-02-29')], '2024-03-07'), '2024-02');
  entries[0].date = '2027-01-01';
  assert.equal(summaryAnnouncementMonth(entries, '2027-01-01'), null);
});
