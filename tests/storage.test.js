import test from 'node:test';
import assert from 'node:assert/strict';
import { readWorkouts, writeWorkouts, STORAGE_KEY } from '../src/storage.js';
const makeStorage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};
const workout = { id: 'one', date: '2020-01-01', title: '', status: 'COMPLETED', blocks: [], distance: null, durationCs: null, style: '', comment: '', createdAt: '2020-01-01T08:00:00Z' };
test('fresh storage starts empty and survives a new read', () => {
  const storage = makeStorage();
  assert.deepEqual(readWorkouts(storage), []);
  writeWorkouts(storage, [workout]);
  assert.deepEqual(readWorkouts(storage), [workout]);
});
test('storage failure reports that changes were not saved', () => {
  const storage = { setItem() { throw new Error('QuotaExceededError'); } };
  assert.throws(() => writeWorkouts(storage, [workout]), /Изменения не сохранены/);
});
test('corrupt data is not silently replaced or erased', () => {
  const storage = makeStorage();
  storage.setItem(STORAGE_KEY, '{corrupt');
  assert.throws(() => readWorkouts(storage));
  assert.equal(storage.getItem(STORAGE_KEY), '{corrupt');
});
test('failed validation preserves previously stored data', () => {
  const storage = makeStorage();
  writeWorkouts(storage, [workout]);
  assert.throws(() => writeWorkouts(storage, [{ ...workout, distance: -1 }]));
  assert.deepEqual(readWorkouts(storage), [workout]);
});
test('duplicate ids are rejected before storage is changed', () => {
  const storage = makeStorage();
  assert.throws(() => writeWorkouts(storage, [workout, workout]), /уникальны/);
  assert.equal(storage.getItem(STORAGE_KEY), null);
});
test('existing storage migrates on read without clearing or overwriting the old data', () => {
  const storage = makeStorage();
  const old = JSON.stringify({ version: 1, workouts: [{
    id: 'old', date: '2020-01-01', type: 'timed', distance: 100, duration: 108,
    style: 'freestyle', comment: 'Старая запись', createdAt: '2020-01-01T08:00:00Z',
  }] });
  storage.setItem(STORAGE_KEY, old);
  const migrated = readWorkouts(storage);
  assert.equal(migrated[0].blocks[0].exercises[0].results[0].timeCs, 10800);
  assert.equal(storage.getItem(STORAGE_KEY), old);
  writeWorkouts(storage, migrated);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).version, 3);
  assert.deepEqual(readWorkouts(storage), migrated);
});

test('nested v2 records migrate without writes, then persist results, plan and status on reload', () => {
  const storage = makeStorage();
  const raw = JSON.stringify({ version: 2, workouts: [{
    id: 'old', date: '2020-01-01', title: 'Интервалы', distance: null, duration: 1800,
    style: '', comment: 'Самочувствие', createdAt: '2020-01-01T08:00:00Z',
    exercises: [{ id: 'e1', distance: 100, style: 'freestyle', description: 'Спринт', timed: true, result: 108, duration: 300 }],
  }] });
  storage.setItem(STORAGE_KEY, raw);
  const records = readWorkouts(storage);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  const w = records[0];
  w.status = 'PLANNED';
  w.blocks[0].rounds = 3;
  w.blocks[0].exercises[0].plannedTimeCs = 12000;
  w.blocks[0].exercises[0].results.push({ id: 'new-result', round: 3, timeCs: 10789 });
  writeWorkouts(storage, records);
  assert.deepEqual(readWorkouts(storage), records);
  w.status = 'COMPLETED';
  writeWorkouts(storage, records);
  assert.deepEqual(readWorkouts(storage), records);
});

test('invalid second record prevents any storage change or partial import', () => {
  const storage = makeStorage();
  writeWorkouts(storage, [workout]);
  const before = storage.getItem(STORAGE_KEY);
  assert.throws(() => writeWorkouts(storage, [workout, { ...workout, id: 'bad', status: 'unknown' }]));
  assert.equal(storage.getItem(STORAGE_KEY), before);
});
