import test from 'node:test';
import assert from 'node:assert/strict';
import { achievementsData } from '../src/achievements.js';
import { personalBests, recordKey } from '../src/domain.js';

const TODAY = '2026-10-26';
let serial = 0;
function training({ distance = 50, style = 'freestyle', technique = '', timeCs = 5000, date = TODAY } = {}) {
  const id = `w-${++serial}`;
  return { id, date, title: '', status: 'COMPLETED', distance: null, durationCs: null, style: '', comment: '',
    createdAt: `${date}T08:00:00Z`, blocks: [{ id: `${id}-b`, title: 'Блок', rounds: 1, restBetweenCs: null, restAfterCs: null,
      exercises: [{ id: `${id}-e`, distance, style, technique, description: '', plannedTimeCs: null, restAfterCs: null,
        resultMode: 'rounds', results: [{ id: `${id}-r`, round: 1, timeCs }] }] }] };
}
const standardRecord = (data, distance, style) => data.standard.find(group => group.distance === distance).disciplines.find(item => item.style === style).record;

test('empty diary lists all 18 requested standard disciplines without fabricating results', () => {
  const entries = [];
  const data = achievementsData(entries, TODAY);
  assert.deepEqual(data.standard.map(group => [group.distance, group.disciplines.map(d => d.style)]), [
    [50, ['freestyle', 'breaststroke', 'backstroke', 'butterfly']],
    [100, ['freestyle', 'breaststroke', 'backstroke', 'butterfly', 'medley']],
    [200, ['freestyle', 'breaststroke', 'backstroke', 'butterfly', 'medley']],
    [400, ['freestyle', 'medley']], [800, ['freestyle']], [1500, ['freestyle']],
  ]);
  assert.equal(data.standard.flatMap(group => group.disciplines).length, 18);
  assert.ok(data.standard.every(group => group.disciplines.every(d => d.record === null)));
  assert.deepEqual(data.other, []);
  assert.deepEqual(entries, []);
});

test('technique records remain separate and never complete an unattempted standard discipline', () => {
  const entries = [training(), training({ technique: 'ногами с доской', timeCs: 4500 }),
    training({ style: 'breaststroke', technique: 'ногами', timeCs: 4000 }),
    training({ distance: 75 }), training({ distance: 400, style: 'backstroke' }), training({ style: 'mixed' })];
  const before = structuredClone(entries);
  const data = achievementsData(entries, TODAY);
  assert.equal(standardRecord(data, 50, 'freestyle').timeCs, 5000);
  assert.equal(standardRecord(data, 50, 'breaststroke'), null);
  assert.deepEqual(data.other.map(recordKey), personalBests(entries).filter(r => recordKey(r) !== '50:freestyle').map(recordKey));
  assert.equal(data.other.length, 5);
  assert.deepEqual(entries, before);
});

test('all history uses existing best-result selection, excludes future times and preserves workout links', () => {
  const older = training({ date: '2026-09-10', timeCs: 4800 });
  const entries = [older, training({ timeCs: 5000 }), training({ date: '2026-10-27', timeCs: 3000 }),
    training({ distance: 100, technique: ' НОГАМИ  С ДОСКОЙ ', timeCs: 9000 }),
    training({ distance: 100, technique: 'ногами с доской', timeCs: 8500 })];
  const data = achievementsData(entries, TODAY);
  const record = standardRecord(data, 50, 'freestyle');
  assert.equal(record.id, older.id);
  assert.equal(record.date, older.date);
  assert.equal(record.timeCs, 4800);
  assert.equal(record.resultId, `${older.id}-r`);
  assert.equal(data.other.length, 1);
  assert.equal(data.other[0].timeCs, 8500);
  const displayed = [...data.standard.flatMap(g => g.disciplines.map(d => d.record).filter(Boolean)), ...data.other];
  const existing = personalBests(entries.filter(w => w.date <= TODAY));
  assert.deepEqual(displayed.map(r => [recordKey(r), r.resultId]).sort(), existing.map(r => [recordKey(r), r.resultId]).sort());
});

test('every standard discipline can have a record and none is duplicated in other achievements', () => {
  const empty = achievementsData([], TODAY);
  const entries = empty.standard.flatMap(group => group.disciplines.map(({ style }) => training({ distance: group.distance, style })));
  const data = achievementsData(entries, TODAY);
  assert.equal(data.standard.flatMap(group => group.disciplines.filter(d => d.record !== null)).length, 18);
  assert.deepEqual(data.other, []);
  assert.equal(new Set(data.standard.flatMap(group => group.disciplines.map(d => d.record.resultId))).size, 18);
});
