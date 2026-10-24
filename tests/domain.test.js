import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validDate, dateKey, shiftDate, monthKey, validateWorkout, validateExercise,
  parseBackup, backupJSON, pace, formatTime, parseTime, formatCentiseconds,
  regularity, summary, personalBests, previousResult, recordKey,
  monthlySeries, weeklySeries, paceSeries, createDemo, totalDistance, totalDuration,
  blockDistance, executionSequence, timedResults, migrateLegacyWorkout, migrateV2Workout,
  copyWorkout, templateWorkouts,
} from '../src/domain.js';
const TODAY = '2026-10-21';
const result = (timeCs = 10837, round = 1, id = 'r1') => ({ id, round, timeCs });
const exercise = (changes = {}) => ({ id: 'e1', distance: 100, style: 'freestyle', technique: '', description: '', plannedTimeCs: null, restAfterCs: null, resultMode: 'rounds', results: [], ...changes });
const block = (changes = {}) => ({ id: 'b1', title: 'Техника', rounds: 1, exercises: [exercise()], restBetweenCs: null, restAfterCs: null, ...changes });
const training = (changes = {}) => ({ id: 'w1', date: '2026-10-01', title: 'Тренировка', status: 'COMPLETED', blocks: [], distance: null, durationCs: null, style: '', comment: '', createdAt: '2026-10-01T08:00:00Z', ...changes });
const oldExercise = (changes = {}) => ({ id: 'e1', distance: 100, style: 'freestyle', description: 'Техника', timed: false, result: null, duration: null, ...changes });
const oldTraining = (changes = {}) => ({ id: 'w1', date: '2026-10-01', title: 'Старая', exercises: [], distance: null, duration: null, style: '', comment: 'Самочувствие', createdAt: '2026-10-01T08:00:00Z', ...changes });
const legacy = (changes = {}) => ({ id: 'old', date: '2026-10-01', type: 'regular', distance: null, duration: null, style: '', comment: '', createdAt: '2026-10-01T08:00:00Z', ...changes });
const example = () => training({ title: 'Техника и скорость', blocks: [
  block({ id: 'warm', title: 'Разминка', exercises: [exercise({ id: 'warm1' }), exercise({ id: 'warm2', distance: 200, style: 'breaststroke' })] }),
  block({ id: 'tech', rounds: 3, exercises: [exercise({ id: 'legs', technique: 'ногами' }), exercise({ id: 'arms', technique: 'руками' })] }),
  block({ id: 'speed', title: 'Скорость', rounds: 4, exercises: [
    exercise({ id: 's50', distance: 50, results: [result(4852, 1, 'r50-1'), result(4789, 3, 'r50-3')] }),
    exercise({ id: 's100', results: [result(10937, 2, 'r100-2')] }),
  ] }),
] });
const copyOptions = () => { let n = 0; return { today: TODAY, now: `${TODAY}T12:00:00Z`, createId: () => `copy-${++n}` }; };

test('dates validate leap years and calendar boundaries', () => {
  assert.ok(validDate('2024-02-29'));
  for (const d of ['2025-02-29', '2026-04-31', '2026-13-01', '2026-2-1', null]) assert.equal(validDate(d), false);
  assert.equal(dateKey(new Date(2026, 0, 2, 23, 59)), '2026-01-02');
  assert.equal(shiftDate('2024-03-01', -1), '2024-02-29');
  assert.equal(monthKey(-1, '2026-01-31'), '2025-12');
  assert.equal(monthKey(1, '2026-01-31'), '2026-02');
});
test('one exercise, one round and optional manual totals', () => {
  assert.deepEqual(validateWorkout(training(), TODAY), training());
  assert.equal(totalDistance(training()), null);
  assert.equal(totalDistance(training({ distance: 1500 })), 1500);
  assert.equal(totalDistance(training({ blocks: [block()], distance: 9999 })), 100);
  assert.equal(blockDistance(block()), 100);
});
test('mixed styles retain per-exercise distances and sequence', () => {
  const b = block({ exercises: [exercise({ distance: 50 }), exercise({ id: 'e2', style: 'breaststroke' }), exercise({ id: 'e3', distance: 200, style: 'backstroke' })] });
  assert.equal(blockDistance(b), 350);
  assert.deepEqual(validateWorkout(training({ blocks: [b] }), TODAY).blocks[0], b);
});
test('three rounds repeat the whole sequence and never duplicate rest', () => {
  const b = block({ rounds: 3, restBetweenCs: 3000, restAfterCs: 6000, exercises: [exercise({ restAfterCs: 1000 }), exercise({ id: 'e2', restAfterCs: 9900 })] });
  assert.equal(blockDistance(b), 600);
  assert.deepEqual([...executionSequence(b)].map(s => [s.exerciseId, s.round, s.restAfterCs]), [
    ['e1', 1, 1000], ['e2', 1, 3000], ['e1', 2, 1000], ['e2', 2, 3000], ['e1', 3, 1000], ['e2', 3, 6000],
  ]);
  assert.equal([...executionSequence(block({ restBetweenCs: 4000 }))][0].restAfterCs, null);
});
test('specified 1500 m program retains partial results and record 47.89', () => {
  const w = validateWorkout(example(), TODAY);
  assert.equal(totalDistance(w), 1500);
  assert.deepEqual(w.blocks.map(blockDistance), [300, 600, 600]);
  assert.equal(timedResults([w]).length, 3);
  assert.equal(personalBests([w]).find(r => r.distance === 50).timeCs, 4789);
  assert.deepEqual(timedResults([w]).map(r => r.round), [1, 3, 2]);
  assert.equal(summary([w], TODAY).distance, 1500);
  assert.equal(summary([w], TODAY).total, 1);
});
test('one known result among eight swims does not change total distance', () => {
  const w = training({ blocks: [block({ rounds: 4, exercises: [exercise({ distance: 50, results: [result(4982, 4)] }), exercise({ id: 'e2' })] })] });
  assert.doesNotThrow(() => validateWorkout(w, TODAY));
  assert.equal(timedResults([w]).length, 1);
  assert.equal(totalDistance(w), 600);
});
test('best-only result is counted once, with unknown round', () => {
  const e = exercise({ resultMode: 'best', results: [result(4789, null)] });
  const w = training({ blocks: [block({ rounds: 4, exercises: [e] })] });
  assert.doesNotThrow(() => validateWorkout(w, TODAY));
  assert.equal(timedResults([w]).length, 1);
  assert.equal(personalBests([w])[0].round, null);
  assert.equal(paceSeries([w], '100:freestyle').length, 1);
  assert.throws(() => validateExercise({ ...e, results: [result(4789, null), result(4900, 1, 'r2')] }, 4));
  assert.throws(() => validateExercise({ ...e, results: [result(4789, null), result(4900, null, 'r2')] }, 4));
});
test('centisecond parsing, formatting, old seconds and locale comma are exact', () => {
  for (const [text, cs] of [['49.82', 4982], ['1:48.37', 10837], ['12:35.06', 75506], ['1:48', 10800], ['1:48.00', 10800], ['0.01', 1], ['49,8', 4980]]) assert.equal(parseTime(text), cs);
  assert.equal(parseTime(''), null);
  assert.equal(formatCentiseconds(10800), '1:48.00');
  assert.equal(formatCentiseconds(75506), '12:35.06');
  assert.equal(formatCentiseconds(null), '—');
  for (const text of ['1:60', '49.821', '-1', 'Infinity', '2:3:4', '1e2', '0', '604801', '.']) assert.throws(() => parseTime(text));
});
test('pace uses actual result only, without changing record precision', () => {
  assert.equal(pace({ distance: 50, timeCs: 4982 }), 99.64);
  assert.equal(pace(exercise({ plannedTimeCs: 5000 })), null);
  assert.equal(formatCentiseconds(pace({ distance: 75, timeCs: 10000 }) * 100), '2:13.33');
  assert.equal(formatTime(119.6), '2:00');
});
test('known times do not become overall duration; completed needs no results', () => {
  const w = example();
  assert.equal(totalDuration(w), null);
  w.durationCs = 180037;
  assert.equal(totalDuration(w), 1800.37);
  const noResults = training({ blocks: [block()] });
  assert.equal(summary([noResults], TODAY).total, 1);
  assert.deepEqual(personalBests([noResults]), []);
});
test('editing and deleting results recalculates records to the hundredth', () => {
  const w = training({ blocks: [block({ rounds: 2, exercises: [exercise({ results: [result(10837), result(10836, 2, 'r2')] })] })] });
  assert.equal(personalBests([w])[0].resultId, 'r2');
  w.blocks[0].exercises[0].results[1].timeCs = 10838;
  assert.equal(personalBests([w])[0].resultId, 'r1');
  w.blocks[0].exercises[0].results.shift();
  assert.equal(personalBests([w])[0].timeCs, 10838);
  w.blocks[0].exercises[0].results = [];
  assert.deepEqual(personalBests([w]), []);
});
test('technique has a stable separate record key; style and distance stay distinct', () => {
  const w = training({ blocks: [block({ exercises: [
    exercise({ results: [result()] }),
    exercise({ id: 'legs1', technique: ' НОГАМИ  с   доской ', results: [result(12000, 1, 'r2')] }),
    exercise({ id: 'legs2', technique: 'ногами с доской', results: [result(11900, 1, 'r3')] }),
    exercise({ id: 'other', style: 'breaststroke', results: [result(14000, 1, 'r4')] }),
    exercise({ id: 'short', distance: 50, results: [result(4900, 1, 'r5')] }),
  ] })] });
  const best = personalBests([w]);
  assert.equal(best.length, 4);
  assert.equal(best.find(r => recordKey(r) === '100:freestyle:ногами с доской').timeCs, 11900);
  assert.equal(best.find(r => recordKey(r) === '100:freestyle').timeCs, 10837);
});
test('comparison follows round sequence, while ties preserve earlier result', () => {
  const w = training({ blocks: [block({ rounds: 2, exercises: [
    exercise({ results: [result(10800, 2, 'a2'), result(10800, 1, 'a1')] }),
    exercise({ id: 'e2', results: [result(10800, 1, 'b1')] }),
  ] })] });
  const history = paceSeries([w], '100:freestyle');
  assert.deepEqual(history.map(r => r.resultId), ['a1', 'b1', 'a2']);
  assert.equal(personalBests([w])[0].resultId, 'a1');
  assert.equal(previousResult([w], history[2]).resultId, 'b1');
});
test('legacy PLANNED records contribute to every metric exactly like COMPLETED', () => {
  const w = { ...example(), status: 'PLANNED' };
  assert.equal(summary([w], TODAY).total, 1);
  assert.equal(summary([w], TODAY).distance, 1500);
  assert.equal(regularity([w], TODAY).days, 1);
  assert.equal(personalBests([w]).find(r => r.distance === 50).timeCs, 4789);
  assert.equal(paceSeries([w], '50:freestyle').length, 2);
  for (const calculate of [summary, regularity, personalBests, timedResults, monthlySeries, weeklySeries]) {
    assert.deepEqual(calculate([w], TODAY), calculate([example()], TODAY));
  }
});
test('legacy status metadata has no effect on visits or records', () => {
  const w = { ...example(), status: 'PLANNED' };
  const before = structuredClone(w.blocks);
  w.status = 'COMPLETED';
  assert.equal(summary([w], TODAY).distance, 1500);
  assert.equal(personalBests([w]).length, 2);
  w.status = 'PLANNED';
  assert.equal(summary([w], TODAY).total, 1);
  assert.equal(personalBests([w]).length, 2);
  assert.deepEqual(w.blocks, before);
});
test('existing future dates survive JSON round trips regardless of legacy status', () => {
  for (const status of ['PLANNED', 'COMPLETED']) {
    const w = training({ status, date: '2027-01-01' });
    assert.deepEqual(parseBackup(backupJSON([w]), TODAY), [w]);
  }
});
test('regularity uses unique dates of both legacy statuses and retains reminder threshold', () => {
  assert.equal(regularity([], TODAY).average, null);
  assert.equal(regularity([training(), training({ id: 'two' })], TODAY).average, null);
  const entries = [training(), training({ id: 'duplicate' }), training({ id: 'two', date: '2026-10-05' }), training({ id: 'plan', status: 'PLANNED', date: '2026-10-03' })];
  assert.equal(regularity(entries, '2026-10-08').average, 2);
  assert.equal(regularity(entries, '2026-10-08').days, 3);
  assert.equal(regularity(entries, '2026-10-08').overdue, false);
  assert.equal(regularity(entries, '2026-10-09').overdue, true);
  assert.equal(regularity([training({ date: '2026-03-28' }), training({ date: '2026-03-30' })], TODAY).average, 2);
});
test('summary counts known distances and Monday-based weeks', () => {
  const entries = [training({ id: 'a', date: '2026-09-30', distance: 500 }), training({ id: 'b', date: '2026-10-18', distance: 1000 }), training({ id: 'c', date: '2026-10-19' }), { ...example(), date: '2026-10-19' }];
  const stats = summary(entries, TODAY);
  assert.equal(stats.total, 4); assert.equal(stats.distance, 3000); assert.equal(stats.monthDistance, 2500);
  assert.equal(stats.weekCount, 2); assert.equal(stats.unknownDistance, 1); assert.equal(stats.days, 3);
});
test('charts fill empty months and handle year boundaries', () => {
  const entries = [training({ date: '2025-12-31', distance: 300 }), training({ date: '2026-01-01', distance: 450 }), training({ date: '2026-01-05' })];
  assert.deepEqual(monthlySeries(entries, '2026-01-05', 3), [{ key: '2025-11', count: 0, distance: 0 }, { key: '2025-12', count: 1, distance: 300 }, { key: '2026-01', count: 2, distance: 450 }]);
  assert.deepEqual(weeklySeries(entries, '2026-01-05', 2), [{ key: '2025-12-29', count: 2 }, { key: '2026-01-05', count: 1 }]);
});
test('invalid program fields and ambiguous results are rejected', () => {
  for (const changes of [{ distance: null }, { distance: 0 }, { distance: 1.5 }, { style: '__proto__' }, { style: ['freestyle'] }, { technique: null }, { description: 'x'.repeat(501) }, { plannedTimeCs: 1.5 }, { restAfterCs: -1 }, { resultMode: 'unknown' }, { results: null }, { results: [result(1.5)] }, { results: [result(100, 2)] }, { results: [result(100, null)] }, { results: [result(), result(12000, 1, 'r2')] }]) assert.throws(() => validateExercise(exercise(changes)));
  for (const changes of [{ rounds: 0 }, { rounds: 1.5 }, { rounds: Number.MAX_SAFE_INTEGER + 1 }, { title: '' }, { exercises: [] }, { restBetweenCs: -1 }]) assert.throws(() => validateWorkout(training({ blocks: [block(changes)] }), TODAY));
  for (const changes of [{ status: '' }, { id: '<script>' }, { date: '2026-02-30' }, { title: null }, { blocks: null }, { distance: -1 }, { durationCs: 0 }, { comment: 'x'.repeat(2001) }, { createdAt: '' }]) assert.throws(() => validateWorkout(training(changes), TODAY));
});
test('all object identifiers must be unique within a training', () => {
  assert.throws(() => validateWorkout(training({ blocks: [block(), block()] }), TODAY), /идентификатор/);
  assert.throws(() => validateWorkout(training({ blocks: [block({ exercises: [exercise(), exercise()] })] }), TODAY), /идентификатор/);
  assert.throws(() => validateWorkout(training({ blocks: [block({ exercises: [exercise({ results: [result(100, 1, 'w1')] })] })] }), TODAY), /идентификатор/);
});
test('v2 exercises migrate to individual blocks with actual durations preserved', () => {
  const old = oldTraining({ duration: 1800, distance: 9000, exercises: [oldExercise({ duration: 300 }), oldExercise({ id: 'e2', timed: true, result: 108 })] });
  const before = structuredClone(old);
  const w = migrateV2Workout(old, TODAY);
  assert.equal(w.status, 'COMPLETED'); assert.equal(w.id, old.id); assert.equal(w.title, old.title); assert.equal(w.comment, old.comment);
  assert.equal(w.blocks.length, 2); assert.equal(totalDistance(w), 200); assert.equal(totalDuration(w), 1800);
  assert.equal(w.distance, 9000);
  assert.equal(w.blocks[0].exercises[0].legacy.durationCs, 30000);
  assert.equal(w.blocks[0].exercises[0].plannedTimeCs, null);
  assert.equal(w.blocks[1].exercises[0].results[0].timeCs, 10800);
  assert.deepEqual(old, before); assert.deepEqual(migrateV2Workout(old, TODAY), w);
});
test('v2 derived duration and formerly overridden manual duration both survive migration', () => {
  const w = migrateV2Workout(oldTraining({ duration: 9000, exercises: [oldExercise({ duration: 300 }), oldExercise({ id: 'e2', duration: 120 })] }), TODAY);
  assert.equal(totalDuration(w), 420);
  assert.equal(w.legacy.manualDurationCs, 900000);
  assert.deepEqual(parseBackup(backupJSON([w]), TODAY), [w]);
});
test('migration resolves legacy id collisions deterministically', () => {
  const w = migrateV2Workout(oldTraining({ id: 'migrated-1', exercises: [oldExercise({ id: 'migrated-1', timed: true, result: 108 }), oldExercise({ id: 'migrated-2' })] }), TODAY);
  assert.doesNotThrow(() => validateWorkout(w, TODAY));
  assert.equal(w.blocks[0].exercises[0].legacy.id, 'migrated-1');
});
test('v1 regular and timed records preserve semantics without inventing durations', () => {
  const regular = migrateLegacyWorkout(legacy({ distance: 1500, duration: 3600, style: 'breaststroke', comment: 'Заметка' }), TODAY);
  assert.equal(totalDistance(regular), 1500); assert.equal(totalDuration(regular), 3600); assert.equal(regular.style, 'breaststroke'); assert.equal(regular.comment, 'Заметка');
  const timed = migrateLegacyWorkout(legacy({ type: 'timed', distance: 100, duration: 108, style: 'freestyle' }), TODAY);
  assert.equal(totalDuration(timed), null); assert.equal(personalBests([timed])[0].timeCs, 10800);
  assert.equal(summary([timed], TODAY).total, 1);
});
test('v1, v2 and v3 backups round trip through validated v3 export', () => {
  for (const [version, entry] of [[1, legacy()], [2, oldTraining({ exercises: [oldExercise()] })], [3, example()]]) {
    const source = JSON.stringify({ version, workouts: [entry] });
    const parsed = parseBackup(source, TODAY);
    const exported = backupJSON(parsed);
    assert.equal(JSON.parse(exported).version, 3);
    assert.deepEqual(parseBackup(exported, TODAY), parsed);
    assert.equal(JSON.parse(source).version, version);
  }
  assert.deepEqual(parseBackup(backupJSON([]), TODAY), []);
});
test('invalid backups fail as a whole, including nested duplicates and old corrupt data', () => {
  for (const raw of ['{bad', 'null', '[]', '{}', '{"version":4,"workouts":[]}', '{"version":3,"workouts":{}}']) assert.throws(() => parseBackup(raw, TODAY));
  assert.throws(() => parseBackup(backupJSON([training(), training()]), TODAY), /повторяется/);
  assert.throws(() => parseBackup(backupJSON([training(), training({ id: 'bad', blocks: [block({ rounds: 0 })] })]), TODAY), /Запись 2/);
  assert.throws(() => parseBackup(JSON.stringify({ version: 2, workouts: [oldTraining({ exercises: [oldExercise({ distance: -1 })] })] }), TODAY));
  assert.throws(() => parseBackup(backupJSON(Array(10001).fill(training())), TODAY), /10 000/);
});
test('copy preserves ordered program and plans, with new ids and no actual data', () => {
  const source = example(); source.durationCs = 180000; source.comment = 'Самочувствие';
  source.blocks[0].restBetweenCs = 3000; source.blocks[0].restAfterCs = 5000;
  source.blocks[0].exercises[0].plannedTimeCs = 12000; source.blocks[0].exercises[0].restAfterCs = 2000;
  const copy = copyWorkout(source, copyOptions());
  assert.equal(copy.status, 'COMPLETED'); assert.equal(copy.date, TODAY); assert.equal(copy.durationCs, null); assert.equal(copy.comment, '');
  assert.equal(totalDistance(copy), 1500); assert.equal(copy.title, source.title);
  const ids = [copy.id];
  copy.blocks.forEach((b,i) => {
    ids.push(b.id); assert.notEqual(b.id, source.blocks[i].id);
    for (const k of ['title', 'rounds', 'restBetweenCs', 'restAfterCs']) assert.equal(b[k], source.blocks[i][k]);
    b.exercises.forEach((e,j) => {
      ids.push(e.id); assert.notEqual(e.id, source.blocks[i].exercises[j].id);
      for (const k of ['distance', 'style', 'technique', 'description', 'plannedTimeCs', 'restAfterCs', 'resultMode']) assert.equal(e[k], source.blocks[i].exercises[j][k]);
      assert.deepEqual(e.results, []); assert.equal(e.legacy, undefined);
    });
  });
  assert.equal(new Set(ids).size, ids.length); assert.doesNotThrow(() => validateWorkout(copy, TODAY));
  assert.deepEqual(personalBests([source, copy]), personalBests([source]));
  assert.equal(summary([source, copy], TODAY).distance, 3000);
  assert.equal(summary([source, copy], TODAY).total, 2);
});

test('trainings without measured times count as visits and contribute full known distance', () => {
  const entries = [
    training({ id: 'old-plan', status: 'PLANNED', date: '2026-10-19', blocks: [block({ rounds: 3 })] }),
    training({ id: 'ordinary', date: TODAY, distance: 700 }),
    training({ id: 'unknown', status: 'PLANNED', date: TODAY }),
  ];
  const stats = summary(entries, TODAY);
  assert.equal(stats.total, 3); assert.equal(stats.weekCount, 3); assert.equal(stats.monthCount, 3);
  assert.equal(stats.distance, 1000); assert.equal(stats.monthDistance, 1000);
  assert.equal(stats.days, 2); assert.equal(stats.average, 2); assert.equal(stats.unknownDistance, 1);
  assert.deepEqual(personalBests(entries), []);
});

test('mixed legacy statuses and missing status import without losing results or fields', () => {
  const entries = [
    { ...example(), id: 'old-plan', status: 'PLANNED' },
    { ...example(), id: 'old-completed' },
    { ...example(), id: 'no-status' },
  ];
  delete entries[2].status;
  const raw = backupJSON(entries);
  const imported = parseBackup(raw, TODAY);
  assert.equal(imported[0].status, 'PLANNED');
  assert.equal(imported[1].status, 'COMPLETED');
  assert.equal(imported[2].status, 'COMPLETED');
  entries.forEach((entry, i) => assert.deepEqual(imported[i].blocks, entry.blocks));
  assert.equal(summary(imported, TODAY).total, 3);
  assert.equal(summary(imported, TODAY).distance, 4500);
  assert.equal(timedResults(imported).length, 9);
  assert.deepEqual(parseBackup(backupJSON(imported), TODAY), imported);
});
test('copy is deeply independent and unsaved copy changes no collection', () => {
  const source = example(); const before = structuredClone(source); const collection = [source];
  const copy = copyWorkout(source, copyOptions());
  copy.blocks[0].exercises[0].distance = 900; copy.blocks[0].exercises.reverse(); copy.blocks.reverse();
  copy.blocks[0].exercises[0].results.push(result()); copy.blocks.pop();
  assert.deepEqual(source, before); assert.equal(collection.length, 1);
});
test('copy of migrated workout clears old actual metadata and keeps manual distance', () => {
  const source = migrateV2Workout(oldTraining({ distance: 1500, duration: 3600 }), TODAY);
  const copy = copyWorkout(source, copyOptions());
  assert.equal(totalDistance(copy), 1500); assert.equal(copy.durationCs, null); assert.equal(copy.legacy, undefined);
});
test('template list searches titles only and sorts newest first', () => {
  const entries = [training({ id: 'a', title: 'Техника' }), training({ id: 'b', title: 'Утро', date: '2026-10-19', comment: 'Техника' }), training({ id: 'c', title: 'Техника и скорость', date: '2026-10-05' })];
  assert.deepEqual(templateWorkouts(entries).map(w => w.id), ['b','c','a']);
  assert.deepEqual(templateWorkouts(entries, ' ТЕХНИКА ').map(w => w.id), ['c','a']);
});
test('demo uses the current schema and comparable results', () => {
  const entries = createDemo(TODAY); entries.forEach(w => assert.doesNotThrow(() => validateWorkout(w, TODAY)));
  assert.equal(paceSeries(entries, '100:freestyle').length, 3);
});
