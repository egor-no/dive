import test from 'node:test';
import assert from 'node:assert/strict';
import { savedRecordNotices } from '../src/achievements.js';
import { personalBests, recordKey } from '../src/domain.js';
import { resultDraft, withExerciseResults } from '../src/results-editor.js';

const TODAY = '2026-11-16';
let serial = 0;
const exercise = (times = [], changes = {}) => ({ id: `e-${++serial}`, distance: 100, style: 'freestyle', technique: '',
  description: '', plannedTimeCs: null, restAfterCs: null, resultMode: 'rounds',
  results: times.map((timeCs, index) => ({ id: `r-${++serial}`, round: index + 1, timeCs })), ...changes });
const block = (exercises, rounds = 4) => ({ id: `b-${++serial}`, title: '', rounds, exercises, restBetweenCs: null, restAfterCs: null });
const workout = (date, blocks = [], changes = {}) => ({ id: `w-${++serial}`, date, blocks, status: 'COMPLETED', title: '',
  distance: null, durationCs: null, style: '', comment: '', createdAt: `${date}T08:00:00Z`, ...changes });
const swim = (date, times, changes = {}) => workout(date, [block([exercise(times, changes)])]);
const notices = (before, after, savedId) => savedRecordNotices(before, after, savedId, TODAY);

test('first saved result is a quiet first result, with no invented previous time or improvement', () => {
  const fresh = swim(TODAY, [8000, 7500]);
  const before = structuredClone(fresh);
  const result = notices([], [fresh], fresh.id);
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, 'first');
  assert.equal(result[0].timeCs, 7500);
  assert.equal(result[0].previousTimeCs, null);
  assert.equal(result[0].improvementCs, null);
  assert.equal(result[0].resultId, personalBests([fresh])[0].resultId);
  assert.deepEqual(fresh, before);
});

test('new strict improvement uses the existing normalized record key and exact hundredths', () => {
  const old = swim('2026-09-01', [9001], { technique: ' С ЛЁГКИМИ  ЛАСТАМИ ' });
  const slower = swim('2026-10-01', [9500], { technique: 'с легкими ластами' });
  const plain = swim('2026-10-02', [5000]);
  const future = swim('2026-11-17', [1000], { technique: 'с легкими ластами' });
  const fresh = swim(TODAY, [9000], { technique: 'с легкими ластами' });
  const before = [slower, old, plain, future];
  const result = notices(before, [...before, fresh], fresh.id);
  assert.equal(result.length, 1);
  assert.equal(recordKey(result[0]), '100:freestyle:с легкими ластами');
  assert.equal(result[0].kind, 'record');
  assert.equal(result[0].previousTimeCs, 9001);
  assert.equal(result[0].improvementCs, 1);
});

test('equal, slower and backfilled results never beat a faster existing all-time record', () => {
  const old = swim('2026-11-10', [7000]);
  for (const time of [7000, 7001, 8000]) {
    const fresh = swim('2026-09-01', [time]);
    assert.deepEqual(notices([old], [fresh, old], fresh.id), []);
  }
  const trueBest = swim('2026-09-01', [6999]);
  const result = notices([old], [trueBest, old], trueBest.id);
  assert.equal(result.length, 1);
  assert.equal(result[0].improvementCs, 1);
});

test('ordinary edits and repeated saves of existing results do not congratulate corrections', () => {
  const original = swim('2026-10-01', [8000, 8500]);
  const unchanged = structuredClone(original);
  unchanged.title = 'Новое название'; unchanged.comment = 'Другой комментарий';
  unchanged.date = '2026-10-02'; unchanged.blocks[0].exercises[0].results.reverse();
  assert.deepEqual(notices([original], [unchanged], original.id), []);
  const draft = resultDraft(original.blocks[0].exercises[0]);
  draft.entries[0].value = '1:10.00';
  const corrected = withExerciseResults(original, original.blocks[0].exercises[0].id, draft);
  assert.deepEqual(notices([original], [corrected], original.id), []);
  assert.deepEqual(notices([corrected], [structuredClone(corrected)], original.id), []);
  corrected.blocks[0].exercises[0].results[0].id = 'replacement-id';
  assert.deepEqual(notices([original], [corrected], original.id), []);
});

test('a newly filled round in a saved exercise notifies once and compares against its own old results too', () => {
  const original = swim('2026-10-01', [8000]);
  const e = original.blocks[0].exercises[0];
  const draft = resultDraft(e);
  draft.entries.push({ id: null, round: 3, value: '1:19.99' });
  const updated = withExerciseResults(original, e.id, draft, () => 'new-round');
  const result = notices([original], [updated], original.id);
  assert.equal(result.length, 1);
  assert.equal(result[0].previousTimeCs, 8000);
  assert.equal(result[0].improvementCs, 1);
  assert.equal(result[0].resultId, 'new-round');
  const resaved = withExerciseResults(updated, e.id, resultDraft(updated.blocks[0].exercises[0]));
  assert.deepEqual(notices([updated], [resaved], original.id), []);
});

test('mode conversion and reclassification of filled results never create false record notifications', () => {
  const original = swim('2026-10-01', [8000]);
  for (const changes of [
    { resultMode: 'best', results: [{ id: 'converted', round: null, timeCs: 7000 }] },
    { distance: 200, results: [{ id: 'changed-distance', round: 2, timeCs: 7000 }] },
    { style: 'breaststroke', results: [{ id: 'changed-style', round: 2, timeCs: 7000 }] },
    { technique: 'ногами с доской', results: [{ id: 'changed-technique', round: 2, timeCs: 7000 }] },
  ]) {
    const updated = structuredClone(original);
    Object.assign(updated.blocks[0].exercises[0], changes);
    assert.deepEqual(notices([original], [updated], original.id), []);
  }
  const empty = swim('2026-10-01', []);
  const filled = structuredClone(empty);
  Object.assign(filled.blocks[0].exercises[0], { resultMode: 'best', results: [{ id: 'first-best', round: null, timeCs: 7000 }] });
  assert.equal(notices([empty], [filled], filled.id)[0].kind, 'first');
});

test('one save produces one final achievement per discipline, independently of array order', () => {
  const old = swim('2026-09-01', [8000]);
  const oldBreaststroke = swim('2026-09-02', [10000], { style: 'breaststroke' });
  const a = exercise([7900, 7500, 7800]); a.results.reverse();
  const b = exercise([9500, 9100], { style: 'breaststroke' });
  const c = exercise([9000], { technique: 'ногами с доской' });
  const fresh = workout(TODAY, [block([b, a]), block([exercise([7600]), c])]);
  const before = [oldBreaststroke, old];
  const after = [fresh, old, oldBreaststroke];
  const snapshot = structuredClone(after);
  const result = notices(before, after, fresh.id);
  assert.equal(result.length, 3);
  assert.equal(new Set(result.map(recordKey)).size, 3);
  const byKey = new Map(result.map(item => [recordKey(item), item]));
  assert.equal(byKey.get('100:freestyle').timeCs, 7500);
  assert.equal(byKey.get('100:freestyle').improvementCs, 500);
  assert.equal(byKey.get('100:breaststroke').timeCs, 9100);
  assert.equal(byKey.get('100:breaststroke').improvementCs, 900);
  assert.equal(byKey.get('100:freestyle:ногами с доской').kind, 'first');
  assert.deepEqual(result.map(item => item.resultId), personalBests(after).map(item => item.resultId));
  assert.deepEqual(after, snapshot);
});

test('deleting or worsening old results cannot turn a slower new result into a celebrated record', () => {
  const original = swim('2026-10-01', [6000]);
  const updated = structuredClone(original);
  updated.blocks[0].exercises[0].results = [{ id: 'new-but-slower', round: 2, timeCs: 6500 }];
  assert.deepEqual(notices([original], [updated], original.id), []);
  const oldOther = swim('2026-10-02', [8000]);
  updated.blocks[0].exercises[0].results = [];
  assert.deepEqual(notices([original, oldOther], [updated, oldOther], original.id), []);
});

test('loading identical history, future workouts and saves without new measured results stay quiet', () => {
  const old = swim('2026-10-01', [8000]);
  assert.deepEqual(notices([old], [structuredClone(old)], old.id), []);
  assert.deepEqual(notices([], [old], undefined), []);
  const future = swim('2026-11-17', [5000]);
  assert.deepEqual(notices([old], [old, future], future.id), []);
  const noTime = workout(TODAY, [block([exercise([], { plannedTimeCs: 5000 })])]);
  assert.deepEqual(notices([old], [old, noTime], noTime.id), []);
  assert.deepEqual(notices([old], [], old.id), []);
});
