import test from 'node:test';
import assert from 'node:assert/strict';
import { newBlock, exerciseNeedsDeleteConfirmation, blockNeedsDeleteConfirmation } from '../src/editor.js';
import { resultDraft } from '../src/results-editor.js';

const blankExercise = () => newBlock().exercises[0];
const blankFields = () => ({ title: 'Блок 3', rounds: '1', restBetweenCs: '', restAfterCs: '' });

test('fresh defaults and unfilled result slots do not require confirmation', () => {
  const exercise = blankExercise();
  const draft = resultDraft(exercise);
  draft.entries = [{ round: 1, value: '' }, { round: 20, value: '  ' }];
  assert.equal(exerciseNeedsDeleteConfirmation(exercise, draft), false);
  assert.equal(blockNeedsDeleteConfirmation(blankFields(), 'Блок 3', false), false);
  // The remembered automatic title stays the same after moving the card.
  assert.equal(blockNeedsDeleteConfirmation({ ...blankFields(), title: 'Блок 3' }, 'Блок 3', false), false);
});

test('exercise data, invalid input and legacy duration are protected', () => {
  const empty = blankExercise();
  for (const fields of [
    { distance: '50' }, { distance: '0' }, { badInput: true },
    { style: 'breaststroke' }, { technique: 'С доской' }, { description: 'Не спешить' },
    { plannedTimeCs: 'bad time' }, { restAfterCs: '0' }, { legacy: { durationCs: 4500 } },
  ]) {
    assert.equal(exerciseNeedsDeleteConfirmation({ ...empty, ...fields }, resultDraft(empty)), true, JSON.stringify(fields));
  }
  assert.equal(exerciseNeedsDeleteConfirmation({ ...empty, description: '  ' }, resultDraft(empty)), false);
});

test('results on any page and both result modes require confirmation without validation', () => {
  const empty = blankExercise();
  for (const draft of [
    { mode: 'rounds', entries: [{ round: 33, value: '47.89' }] },
    { mode: 'rounds', entries: [{ round: 1, value: 'invalid' }] },
    { mode: 'best', entries: [{ round: null, value: '48,5' }] },
    { mode: 'best', entries: [] },
  ]) {
    const before = structuredClone(draft);
    assert.equal(exerciseNeedsDeleteConfirmation(empty, draft), true);
    assert.deepEqual(draft, before);
  }
});

test('block settings and one filled nested exercise require confirmation', () => {
  for (const fields of [
    { title: 'Разминка' }, { title: 'Блок 9' }, { rounds: '2' }, { rounds: '0' },
    { badInput: true }, { restBetweenCs: '15' }, { restAfterCs: 'invalid' },
  ]) {
    assert.equal(blockNeedsDeleteConfirmation({ ...blankFields(), ...fields }, 'Блок 3', false), true, JSON.stringify(fields));
  }
  const exercises = [blankExercise(), { ...blankExercise(), description: 'Работа ногами' }];
  const hasFilledExercise = exercises.some(e => exerciseNeedsDeleteConfirmation(e, resultDraft(e)));
  assert.equal(blockNeedsDeleteConfirmation(blankFields(), 'Блок 3', hasFilledExercise), true);
});

test('saved elements remain protected even if cleared; new empty elements do not', () => {
  const empty = blankExercise();
  assert.equal(exerciseNeedsDeleteConfirmation(empty, resultDraft(empty), true), true);
  assert.equal(blockNeedsDeleteConfirmation(blankFields(), 'Блок 3', false, true), true);
  assert.equal(exerciseNeedsDeleteConfirmation(empty, resultDraft(empty), false), false);
  assert.equal(blockNeedsDeleteConfirmation(blankFields(), 'Блок 3', false, false), false);
});
