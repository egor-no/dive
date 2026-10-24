import test from 'node:test';
import assert from 'node:assert/strict';
import { resultDraft, resultPage, hasResultsBeyond, resizeDraft, readResultDraft, resultOverview, withExerciseResults, resultsEditorHTML } from '../src/results-editor.js';
import { editorHTML, newBlock } from '../src/editor.js';
import { validateWorkout, personalBests, totalDistance, summary } from '../src/domain.js';
import { readWorkouts, writeWorkouts } from '../src/storage.js';

const TODAY = '2026-10-21';
const exercise = (extra = {}) => ({ id: 'exercise', distance: 50, style: 'freestyle', description: '', technique: '', plannedTimeCs: null, restAfterCs: null, resultMode: 'rounds', results: [{ id: 'r1', round: 1, timeCs: 4852 }, { id: 'r3', round: 3, timeCs: 4789 }], ...extra });
const workout = (extra = {}) => ({ id: 'workout', date: '2026-10-01', title: 'Техника', status: 'COMPLETED', distance: null, durationCs: 180000, comment: 'Хорошо', style: '', createdAt: '2026-10-01T08:00:00Z', blocks: [{ id: 'block', title: 'Скорость', rounds: 4, restBetweenCs: 3000, restAfterCs: 6000, exercises: [exercise(), exercise({ id: 'other', distance: 100, results: [] })] }], ...extra });

test('four rounds produce exactly four fixed positions with optional gaps', () => {
  assert.deepEqual(resultPage(resultDraft(exercise()), 4).slots, [
    { round: 1, value: '0:48.52' }, { round: 2, value: '' }, { round: 3, value: '0:47.89' }, { round: 4, value: '' },
  ]);
  assert.equal(resultPage(resultDraft(exercise({ results: [] })), 1).slots.length, 1);
});
test('large round counts use bounded pages, preserving fixed round numbers', () => {
  const draft = resultDraft(exercise({ results: [{ id: 'last', round: 35, timeCs: 4982 }] }));
  assert.equal(resultPage(draft, 35).slots.length, 16);
  assert.equal(resultPage(draft, 35, 1).slots[0].round, 17);
  assert.deepEqual(resultPage(draft, 35, 2).slots.map(r => r.round), [33,34,35]);
  assert.equal(resultPage(draft, 35, 2).slots[2].value, '0:49.82');
  assert.equal(resultPage(draft, 1000000).slots.length, 16);
});
test('increasing rounds preserves exact times and identifiers, adds only empty positions', () => {
  const draft = resultDraft(exercise());
  const expanded = resizeDraft(draft, 6);
  assert.deepEqual(expanded, draft);
  assert.deepEqual(resultPage(expanded, 6).slots.slice(4), [{ round: 5, value: '' }, { round: 6, value: '' }]);
  assert.deepEqual(readResultDraft(expanded).results, exercise().results);
});
test('shrinking detects entered values including invalid drafts before any deletion', () => {
  const draft = resultDraft(exercise());
  const before = structuredClone(draft);
  assert.equal(hasResultsBeyond(draft, 3), false);
  assert.equal(hasResultsBeyond(draft, 2), true);
  assert.deepEqual(draft, before);
  assert.deepEqual(readResultDraft(resizeDraft(draft, 2)).results, [exercise().results[0]]);
  draft.entries.push({ id: null, round: 4, value: 'invalid' });
  assert.equal(hasResultsBeyond(draft, 3), true);
});
test('best-only always has one position and survives all changes in round count', () => {
  const draft = resultDraft(exercise({ resultMode: 'best', results: [{ id: 'best', round: null, timeCs: 4789 }] }));
  assert.equal(resultPage(draft, 20).slots.length, 1);
  assert.equal(resultPage(draft, 20).slots[0].round, null);
  assert.equal(hasResultsBeyond(draft, 1), false);
  assert.deepEqual(resizeDraft(draft, 1), draft);
  assert.equal(readResultDraft(draft).results.length, 1);
});
test('exercise header shows best valid time and count, not a personal-record claim', () => {
  const draft = resultDraft(exercise());
  draft.entries.push({ id: null, round: 4, value: 'bad' });
  assert.deepEqual(resultOverview(draft, 4), { best: 4789, count: 2, label: 'Лучшее: 47.89 с · 2 из 4' });
  assert.equal(resultOverview({ mode: 'rounds', entries: [] }, 4).label, 'Нет результатов · 0 из 4');
  assert.throws(() => readResultDraft(draft));
});
test('quick edit touches only target results, preserving structure, status and metadata', () => {
  const source = workout();
  const before = structuredClone(source);
  const draft = resultDraft(exercise());
  draft.entries[0].value = '46,82';
  draft.entries.push({ id: null, round: 4, value: '1:48.37' });
  const updated = validateWorkout(withExerciseResults(source, 'exercise', draft, () => 'new-result'), TODAY);
  assert.equal(updated.blocks[0].exercises[0].results[0].timeCs, 4682);
  assert.equal(updated.blocks[0].exercises[0].results[0].id, 'r1');
  assert.equal(updated.blocks[0].exercises[0].results[2].timeCs, 10837);
  assert.deepEqual(updated.blocks[0].exercises[1], source.blocks[0].exercises[1]);
  assert.equal(updated.status, source.status); assert.equal(updated.durationCs, source.durationCs); assert.equal(updated.comment, source.comment);
  assert.equal(totalDistance(updated), 600);
  assert.deepEqual(source, before);
  assert.throws(() => withExerciseResults(source, 'absent', draft));
});
test('clearing a result removes it and recalculates records after save', () => {
  const source = workout();
  const draft = resultDraft(exercise());
  draft.entries[1].value = '';
  const updated = withExerciseResults(source, 'exercise', draft);
  assert.equal(updated.blocks[0].exercises[0].results.length, 1);
  assert.equal(personalBests([updated])[0].timeCs, 4852);
  assert.equal(personalBests([source])[0].timeCs, 4789);
});
test('quick edit of legacy PLANNED record persists full results and immediately updates statistics', () => {
  const source = workout({ status: 'PLANNED' });
  const draft = resultDraft(exercise()); draft.entries[0].value = '46.82';
  const updated = withExerciseResults(source, 'exercise', draft);
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  writeWorkouts(storage, [updated]);
  const reopened = readWorkouts(storage);
  assert.deepEqual(reopened, [updated]);
  assert.equal(reopened[0].status, 'PLANNED');
  assert.equal(summary(reopened, TODAY).total, 1);
  assert.equal(summary(reopened, TODAY).distance, 600);
  assert.equal(personalBests(reopened)[0].timeCs, 4682);
});
test('round reduction preserves hidden rest; changing rounds only changes planned distance', () => {
  const source = workout();
  const updated = withExerciseResults(source, 'exercise', resizeDraft(resultDraft(exercise()), 1));
  updated.blocks[0].rounds = 1;
  assert.equal(validateWorkout(updated, TODAY).blocks[0].restBetweenCs, 3000);
  assert.equal(totalDistance(updated), 150);
  assert.equal(personalBests([updated])[0].timeCs, 4852);
});
test('constructor uses ordinary save actions independent of legacy status', () => {
  const b = newBlock(3);
  assert.equal(b.title, 'Блок 3');
  const html = editorHTML(workout({ status: 'PLANNED' }));
  assert.ok(!html.includes('select name="status"'));
  assert.ok(!html.includes('id="result-editors"'));
  assert.ok(!html.includes('name="result-round"'));
  assert.match(html, />Сохранить<\/button>/);
  assert.equal((html.match(/class="inline-results"/g) || []).length, 2);
  for (const status of ['PLANNED', 'COMPLETED']) {
    const editing = editorHTML(workout({ status }), { editing: true });
    assert.match(editing, />Сохранить изменения<\/button>/);
    assert.doesNotMatch(editing, /save-status|value="(?:PLANNED|COMPLETED)"|черновик|Запланирована|Выполнена|Сохранить план|Отметить выполненной|Вернуть в планы/i);
  }
});

test('one-round editor opens directly, hides mode choice and preserves either saved mode', () => {
  for (const mode of ['rounds', 'best']) {
    const original = exercise({ resultMode: mode, results: [{ id: 'saved-time', round: mode === 'best' ? null : 1, timeCs: 4982 }] });
    const html = resultsEditorHTML(original, 1);
    assert.match(html, /data-single="true" open/);
    assert.match(html, /class="result-mode-label" hidden/);
    const draft = resultDraft(original);
    const slots = resultPage(draft, 1).slots;
    assert.equal(slots.length, 1);
    assert.equal(slots[0].value, '0:49.82');
    assert.deepEqual(readResultDraft(draft), { resultMode: mode, results: original.results });
    draft.entries[0].value = '48,37';
    assert.deepEqual(readResultDraft(draft), { resultMode: mode, results: [{ id: 'saved-time', round: original.results[0].round, timeCs: 4837 }] });
    assert.equal(resultPage(resizeDraft(draft, 4), 4).slots.length, mode === 'best' ? 1 : 4);
    assert.doesNotMatch(resultsEditorHTML(original, 4), /class="result-mode-label" hidden/);
  }
});
