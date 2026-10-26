import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecordPreview } from '../src/statistics.js';
import { recordKey } from '../src/domain.js';

const records = Array.from({ length: 10 }, (_, index) => ({
  distance: 50 + index * 25, style: 'freestyle', technique: '',
  timeCs: 5000 + index * 100, id: `workout-${index}`, resultId: `result-${index}`, date: '2026-10-26',
}));

test('preview samples six unique records and preserves the input ordering without mutation', () => {
  const before = structuredClone(records);
  const preview = createRecordPreview(records, () => 0);
  const chosen = preview(records);
  assert.equal(chosen.length, 6);
  assert.equal(new Set(chosen.map(recordKey)).size, 6);
  assert.deepEqual(chosen, records.slice(1, 7));
  assert.deepEqual(records, before);
  assert.deepEqual(preview([...records].reverse()), [...chosen].reverse());
});

test('zero to six eligible records are all shown, without duplicate disciplines', () => {
  const preview = createRecordPreview(records, () => 0.5);
  for (let count = 0; count <= 6; count++) assert.deepEqual(preview(records.slice(0, count)), records.slice(0, count));
  assert.deepEqual(preview([records[0], records[0], records[1]]), records.slice(0, 2));
});

test('period changes and rerenders retain priorities, returning only current-period results', () => {
  let draws = 0;
  const preview = createRecordPreview(records, () => { draws++; return 0; });
  const initialDraws = draws;
  const all = preview(records);
  const month = records.slice(3).map(record => ({ ...record, id: 'month-' + record.id, timeCs: record.timeCs + 200 }));
  const monthlyPreview = preview(month);
  assert.equal(monthlyPreview.length, 6);
  assert.ok(monthlyPreview.every(record => month.includes(record)));
  assert.deepEqual(preview(month), monthlyPreview);
  assert.deepEqual(preview(records), all);
  assert.equal(draws, initialDraws);
});

test('updated results stay fresh and a new visit can draw a different selection', () => {
  const preview = createRecordPreview(records, () => 0);
  const chosenKeys = preview(records).map(recordKey);
  const updated = records.map(record => ({ ...record, timeCs: record.timeCs - 50, resultId: 'updated-' + record.resultId }));
  const extra = { ...records[0], distance: 1000, resultId: 'new' };
  assert.deepEqual(preview([...updated, extra]).map(recordKey), chosenKeys);
  assert.ok(preview(updated).every(record => updated.includes(record)));
  assert.notDeepEqual(createRecordPreview(records, () => 0.999)(records).map(recordKey), chosenKeys);
});
