import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validDate, dateKey, shiftDate, monthKey, validateWorkout, validateExercise,
  parseBackup, backupJSON, pace, formatTime, regularity, summary, personalBests,
  previousResult, recordKey, monthlySeries, weeklySeries, paceSeries, createDemo,
  totalDistance, totalDuration, hasCompleteDurations, timedResults,
  migrateLegacyWorkout, copyWorkout, templateWorkouts,
} from '../src/domain.js';
const TODAY = '2026-10-20';
const training = (overrides = {}) => ({
  id: 'one', date: '2026-10-01', title: '', distance: null, duration: null,
  style: '', comment: '', exercises: [], createdAt: '2026-10-01T08:00:00.000Z', ...overrides,
});
const exercise = (overrides = {}) => ({
  id: 'e1', distance: 100, style: 'freestyle', description: 'Разминка',
  duration: null, timed: false, result: null, ...overrides,
});
const timed = (overrides = {}) => exercise({ timed: true, result: 120, ...overrides });
const legacy = (overrides = {}) => ({
  id: 'old', type: 'regular', date: '2026-10-01', distance: null, duration: null,
  style: '', comment: '', createdAt: '2026-10-01T08:00:00.000Z', ...overrides,
});
const example = () => training({ title: 'Техника', comment: 'Самочувствие отличное', duration: 1800, exercises: [
  exercise({ id: 'e1', description: 'Разминка' }),
  timed({ id: 'e2', description: 'Спринт 100', result: 108 }),
  timed({ id: 'e3', description: 'Спринт 50', distance: 50, result: 49 }),
  exercise({ id: 'e4', description: 'Спокойное плавание', distance: 200 }),
] });
const copyOptions = () => {
  let sequence = 0;
  return { today: TODAY, now: `${TODAY}T12:00:00.000Z`, createId: () => `copy-${++sequence}` };
};

test('dates reject rollovers and handle leap years, month and year boundaries', () => {
  assert.ok(validDate('2024-02-29'));
  for (const value of ['2025-02-29', '2026-04-31', '2026-13-01', '2026-2-1', null]) assert.equal(validDate(value), false);
  assert.equal(dateKey(new Date(2026, 0, 2, 23, 59)), '2026-01-02');
  assert.equal(shiftDate('2024-03-01', -1), '2024-02-29');
  assert.equal(monthKey(-1, '2026-01-31'), '2025-12');
  assert.equal(monthKey(1, '2026-01-31'), '2026-02');
});
test('training without exercises permits unknown or manual totals', () => {
  assert.deepEqual(validateWorkout(training(), TODAY), training());
  assert.equal(totalDistance(training()), null);
  assert.equal(totalDuration(training()), null);
  assert.equal(totalDistance(training({ distance: 1500 })), 1500);
  assert.equal(totalDuration(training({ duration: 3600 })), 3600);
});
test('training preserves ordered exercises and sums 450 metres without double counting', () => {
  const w = validateWorkout(example(), TODAY);
  assert.deepEqual(w.exercises.map(e => e.id), ['e1', 'e2', 'e3', 'e4']);
  assert.equal(totalDistance(w), 450);
  assert.equal(totalDistance({ ...w, distance: 9000 }), 450);
  assert.equal(summary([w], TODAY).distance, 450);
  assert.equal(summary([w], TODAY).total, 1);
});
test('complete exercise durations override the manual total', () => {
  const w = training({ duration: 9000, exercises: [exercise({ duration: 300 }), exercise({ id: 'e2', duration: 120 })] });
  assert.equal(hasCompleteDurations(w), true);
  assert.equal(totalDuration(w), 420);
});
test('partial durations are not presented as a complete total', () => {
  const w = training({ exercises: [exercise({ duration: 300 }), exercise({ id: 'e2' })] });
  assert.equal(hasCompleteDurations(w), false);
  assert.equal(totalDuration(w), null);
  assert.equal(totalDuration({ ...w, duration: 1800 }), 1800);
});
test('timed result is never used as exercise or training duration', () => {
  const w = training({ exercises: [timed({ result: 108 })] });
  assert.equal(totalDuration(w), null);
  assert.equal(pace(w.exercises[0]), 108);
  assert.equal(totalDuration(training({ exercises: [timed({ duration: 300, result: 108 })] })), 300);
});
test('pending timed exercises can be saved but contribute no result or record', () => {
  const w = validateWorkout(training({ exercises: [timed({ result: null })] }), TODAY);
  assert.equal(totalDistance(w), 100);
  assert.deepEqual(timedResults([w]), []);
  assert.deepEqual(personalBests([w]), []);
  assert.deepEqual(paceSeries([w], '100:freestyle'), []);
});
test('exercise validation rejects invalid fields and results without timed flag', () => {
  for (const change of [
    { id: '' }, { distance: null }, { distance: 0 }, { distance: 1.5 }, { distance: '100' },
    { style: '__proto__' }, { style: '' }, { description: 'x'.repeat(501) },
    { duration: 0 }, { duration: Infinity }, { result: 1 }, { timed: 'yes' },
  ]) assert.throws(() => validateExercise(exercise(change)));
  assert.throws(() => validateExercise(timed({ result: -1 })));
});
test('training validation rejects malformed fields and duplicate exercise ids', () => {
  for (const change of [
    { id: '<script>' }, { title: null }, { title: 'x'.repeat(201) },
    { comment: 'x'.repeat(2001) }, { date: '2026-10-21' }, { date: '2026-02-30' },
    { distance: -1 }, { duration: 0 }, { exercises: null }, { createdAt: '' },
  ]) assert.throws(() => validateWorkout(training(change), TODAY));
  assert.throws(() => validateWorkout(training({ exercises: [exercise(), exercise()] }), TODAY), /повторяется/);
});
test('pace uses timed results, rounds seconds and never uses duration', () => {
  assert.equal(pace(timed({ distance: 400, result: 600, duration: 3600 })), 150);
  assert.equal(formatTime(pace(timed({ distance: 75, result: 100 }))), '2:13');
  assert.equal(pace(exercise({ duration: 100 })), null);
  assert.equal(formatTime(119.6), '2:00');
  assert.equal(formatTime(null), '—');
});
test('zero or one distinct visit cannot establish regularity', () => {
  assert.equal(regularity([], TODAY).average, null);
  assert.equal(regularity([training(), training({ id: 'two' })], TODAY).average, null);
});
test('regularity ignores exercise count and duplicate dates', () => {
  const result = regularity([example(), training({ id: 'two' }), training({ date: '2026-10-05' }), training({ date: '2026-10-09' })], TODAY);
  assert.equal(result.days, 3);
  assert.equal(result.average, 4);
  assert.equal(result.elapsed, 11);
  assert.equal(result.overdue, true);
});
test('reminder threshold and daylight saving date arithmetic remain unchanged', () => {
  const entries = [training(), training({ id: 'two', date: '2026-10-05' })];
  assert.equal(regularity(entries, '2026-10-11').overdue, false);
  assert.equal(regularity(entries, '2026-10-12').overdue, true);
  assert.equal(regularity([training({ date: '2026-03-28' }), training({ date: '2026-03-30' })], TODAY).average, 2);
});
test('summary counts trainings and known totals; week starts on Monday', () => {
  const entries = [
    training({ id: '1', date: '2026-09-30', distance: 500 }),
    training({ id: '2', date: '2026-10-18', distance: 1000 }),
    training({ id: '3', date: '2026-10-19' }),
    { ...example(), id: '4', date: '2026-10-19' },
    training({ id: '5', date: '2026-10-20', distance: 1500 }),
  ];
  const result = summary(entries, TODAY);
  assert.equal(result.total, 5);
  assert.equal(result.distance, 3450);
  assert.equal(result.monthDistance, 2950);
  assert.equal(result.weekCount, 3);
  assert.equal(result.days, 4);
  assert.equal(result.unknownDistance, 1);
  assert.equal(summary(entries, '2026-10-18').weekCount, 1);
});
test('multiple timed exercises produce separate results, grouped by distance and style', () => {
  const w = example();
  w.exercises.push(timed({ id: 'other-style', style: 'breaststroke', result: 140 }));
  const records = personalBests([w]);
  assert.equal(records.length, 3);
  assert.deepEqual(new Set(records.map(e => e.exerciseId)), new Set(['e2', 'e3', 'other-style']));
  assert.equal(timedResults([w]).length, 3);
});
test('editing or deleting an exercise recomputes personal bests', () => {
  const w = training({ exercises: [timed({ id: 'a', result: 120 }), timed({ id: 'b', result: 110 })] });
  assert.equal(personalBests([w])[0].exerciseId, 'b');
  w.exercises[1].result = 130;
  assert.equal(personalBests([w])[0].exerciseId, 'a');
  w.exercises.shift();
  assert.equal(personalBests([w])[0].exerciseId, 'b');
  w.exercises[0].timed = false;
  w.exercises[0].result = null;
  assert.deepEqual(personalBests([w]), []);
});
test('equal results preserve first exercise; previous result respects exercise order', () => {
  const w = training({ exercises: [timed({ id: 'first' }), timed({ id: 'second' })] });
  assert.equal(personalBests([w])[0].exerciseId, 'first');
  const swims = timedResults([w]);
  assert.equal(previousResult([w], swims[1]).exerciseId, 'first');
  assert.equal(previousResult([w], swims[0]), null);
});
test('comparison uses the most recent matching result across trainings', () => {
  const first = training({ id: 'a', exercises: [timed()] });
  const next = training({ id: 'b', date: '2026-10-05', exercises: [timed(), timed({ id: 'other', distance: 200 })] });
  assert.equal(previousResult([next, first], timedResults([next])[0]).id, 'a');
});
test('pace history separates styles and distances, with several points on one date', () => {
  const w = training({ exercises: [timed({ id: 'a' }), timed({ id: 'b', result: 110 }), timed({ id: 'c', distance: 200 })] });
  assert.deepEqual(paceSeries([w], '100:freestyle').map(e => e.pace), [120, 110]);
  assert.equal(recordKey(timedResults([w])[2]), '200:freestyle');
});
test('monthly and weekly charts use training totals and fill empty periods', () => {
  const entries = [training({ date: '2025-12-31', distance: 300 }), { ...example(), date: '2026-01-01' }, training({ date: '2026-01-05' })];
  assert.deepEqual(monthlySeries(entries, '2026-01-05', 3), [
    { key: '2025-11', count: 0, distance: 0 }, { key: '2025-12', count: 1, distance: 300 }, { key: '2026-01', count: 2, distance: 450 },
  ]);
  assert.deepEqual(weeklySeries(entries, '2026-01-05', 2), [{ key: '2025-12-29', count: 2 }, { key: '2026-01-05', count: 1 }]);
});
test('legacy regular training preserves id, date, distance, duration, style and comment', () => {
  const old = legacy({ distance: 1500, duration: 3600, style: 'breaststroke', comment: 'Заметка' });
  const migrated = migrateLegacyWorkout(old, TODAY);
  for (const field of ['id', 'date', 'style', 'comment', 'createdAt']) assert.equal(migrated[field], old[field]);
  assert.equal(totalDistance(migrated), 1500);
  assert.equal(totalDuration(migrated), 3600);
  assert.deepEqual(migrated.exercises, []);
});
test('legacy timed training becomes one exercise with result but unknown duration', () => {
  const old = legacy({ type: 'timed', distance: 100, duration: 108, style: 'freestyle', comment: 'Рекорд' });
  const migrated = migrateLegacyWorkout(old, TODAY);
  assert.equal(migrated.exercises.length, 1);
  assert.equal(migrated.exercises[0].result, 108);
  assert.equal(migrated.exercises[0].duration, null);
  assert.equal(totalDuration(migrated), null);
  assert.equal(personalBests([migrated])[0].result, 108);
  assert.equal(migrated.comment, 'Рекорд');
  assert.deepEqual(migrateLegacyWorkout(old, TODAY), migrated);
});
test('version 1 import migrates to version 2 without changing raw source', () => {
  const raw = JSON.stringify({ version: 1, workouts: [legacy(), legacy({ id: 'timed', type: 'timed', distance: 50, duration: 49, style: 'freestyle' })] });
  const parsed = parseBackup(raw, TODAY);
  const exported = backupJSON(parsed);
  assert.equal(JSON.parse(exported).version, 2);
  assert.deepEqual(parseBackup(exported, TODAY), parsed);
  assert.equal(JSON.parse(raw).version, 1);
  assert.equal(summary(parsed, TODAY).total, 2);
});
test('new backup round trip preserves order, independent durations and pending results', () => {
  const w = example();
  w.exercises[0].duration = 300;
  w.exercises[2].result = null;
  assert.deepEqual(parseBackup(backupJSON([w]), TODAY), [w]);
  assert.deepEqual(parseBackup(backupJSON([]), TODAY), []);
});
test('import rejects malformed files, duplicate ids and invalid nested data atomically', () => {
  for (const raw of ['{broken', 'null', '[]', '{}', '{"version":3,"workouts":[]}', '{"version":2,"workouts":{}}']) assert.throws(() => parseBackup(raw, TODAY));
  assert.throws(() => parseBackup(backupJSON([training(), training()]), TODAY), /повторяется/);
  assert.throws(() => parseBackup(backupJSON([training(), training({ id: 'bad', exercises: [exercise({ distance: -1 })] })]), TODAY), /Запись 2: Задание 1/);
  assert.throws(() => parseBackup(backupJSON(Array(10001).fill(training())), TODAY), /10 000/);
});
test('copy keeps the title, ordered plans and timed flags, assigning fresh ids', () => {
  const source = example();
  source.exercises[0].duration = 300;
  const result = copyWorkout(source, copyOptions());
  assert.equal(result.date, TODAY);
  assert.equal(result.title, source.title);
  assert.notEqual(result.id, source.id);
  assert.equal(new Set([result.id, ...result.exercises.map(e => e.id)]).size, 5);
  result.exercises.forEach((e, index) => {
    const original = source.exercises[index];
    assert.notEqual(e.id, original.id);
    for (const field of ['distance', 'style', 'description', 'timed']) assert.equal(e[field], original[field]);
    assert.equal(e.duration, null);
    assert.equal(e.result, null);
  });
  assert.equal(result.duration, null);
  assert.equal(result.comment, '');
  assert.equal(totalDistance(result), 450);
  assert.equal(totalDuration(result), null);
  assert.doesNotThrow(() => validateWorkout(result, TODAY));
});
test('copy is deeply independent and does not modify the source', () => {
  const source = example();
  const before = structuredClone(source);
  source.exercises.forEach(Object.freeze);
  Object.freeze(source.exercises);
  Object.freeze(source);
  const result = copyWorkout(source, copyOptions());
  result.title = 'Другое название';
  result.exercises[0].description = 'Другое задание';
  result.exercises[0].distance = 500;
  result.exercises.reverse();
  result.exercises.pop();
  assert.deepEqual(source, before);
  assert.notEqual(source.exercises, result.exercises);
});
test('unsaved copy changes no collection; saved copy adds one training and no old records', () => {
  const source = example();
  const workouts = [source];
  const result = copyWorkout(source, copyOptions());
  assert.equal(workouts.length, 1);
  assert.deepEqual(personalBests([result]), []);
  assert.deepEqual(paceSeries([result], '100:freestyle'), []);
  const saved = [...workouts, validateWorkout(result, TODAY)];
  assert.equal(summary(saved, TODAY).total, 2);
  assert.equal(summary(saved, TODAY).distance, 900);
  assert.equal(summary(saved, TODAY).days, 2);
  assert.deepEqual(personalBests(saved), personalBests(workouts));
  assert.equal(paceSeries(saved, '100:freestyle').length, 1);
  saved[1].exercises[1].result = 105;
  assert.equal(personalBests(saved).find(e => e.distance === 100).result, 105);
});
test('copy without exercises keeps manual planned distance but clears elapsed time', () => {
  const result = copyWorkout(training({ distance: 1500, duration: 3600, comment: 'Самочувствие' }), copyOptions());
  assert.deepEqual(result.exercises, []);
  assert.equal(totalDistance(result), 1500);
  assert.equal(totalDuration(result), null);
  assert.equal(result.comment, '');
});
test('template list is newest first and searches titles case-insensitively only', () => {
  const entries = [
    training({ id: 'a', title: 'Техника' }),
    training({ id: 'b', title: 'Утро', date: '2026-10-19', comment: 'Техника' }),
    training({ id: 'c', title: 'Техника и скорость', date: '2026-10-05' }),
  ];
  assert.deepEqual(templateWorkouts(entries).map(w => w.id), ['b', 'c', 'a']);
  assert.deepEqual(templateWorkouts(entries, ' ТЕХНИКА ').map(w => w.id), ['c', 'a']);
  assert.deepEqual(entries.map(w => w.id), ['a', 'b', 'c']);
});
test('demo migrates to the current schema and retains comparable results', () => {
  const entries = createDemo(TODAY);
  entries.forEach(w => assert.doesNotThrow(() => validateWorkout(w, TODAY)));
  assert.equal(paceSeries(entries, '100:freestyle').length, 3);
});
