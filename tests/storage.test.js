import test from 'node:test';
import assert from 'node:assert/strict';
import { readWorkouts, writeWorkouts, STORAGE_KEY } from '../src/storage.js';
const makeStorage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};
const workout = { id: 'one', type: 'regular', date: '2020-01-01', distance: null, duration: null, style: '', comment: '', createdAt: '2020-01-01T08:00:00Z' };
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
