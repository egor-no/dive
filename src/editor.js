import { STYLES, validateWorkout, parseTime, formatCentiseconds } from './domain.js';
import { resultsEditorHTML, mountResultsEditor, discardHTML, protectEditor } from './results-editor.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const id = () => crypto.randomUUID();
const valueTime = value => value === null ? '' : formatCentiseconds(value);
const field = (name, label, value = '', attrs = '') => `<label class="field"><span>${label}</span><input name="${name}" value="${esc(value)}" ${attrs}></label>`;
const timeField = (name, label, value) => field(name, label, valueTime(value), 'inputmode="decimal" placeholder="мин:сек или секунды" maxlength="14"');
const time = (card, name) => parseTime(card.querySelector(`[name="${name}"]`).value);
const val = (card, name) => card.querySelector(`[name="${name}"]`).value;
const num = (card, name) => {
  const input = card.querySelector(`[name="${name}"]`);
  return input.validity.badInput ? NaN : input.value === '' ? null : Number(input.value);
};
const newExercise = () => ({ id: id(), distance: null, style: 'freestyle', technique: '', description: '', plannedTimeCs: null, restAfterCs: null, resultMode: 'rounds', results: [] });
export const newBlock = (number = 1) => ({ id: id(), title: `Блок ${number}`, rounds: 1, restBetweenCs: null, restAfterCs: null, exercises: [newExercise()] });
const circleLabel = n => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'круг' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'круга' : 'кругов'}`;
const tools = type => `<div class="compact-tools"><button type="button" class="icon-button" data-edit="${type}-up" aria-label="${type === 'block' ? 'Блок' : 'Упражнение'} выше">↑</button><button type="button" class="icon-button" data-edit="${type}-down" aria-label="${type === 'block' ? 'Блок' : 'Упражнение'} ниже">↓</button><button type="button" class="icon-button" data-edit="${type}-remove" aria-label="Удалить ${type === 'block' ? 'блок' : 'упражнение'}">×</button></div>`;
function exerciseHTML(e, rounds) {
  return `<details class="exercise-editor compact-exercise" data-id="${esc(e.id)}" ${e.distance === null ? 'open' : ''}><summary><span class="exercise-caption"></span><span class="exercise-description-caption"></span><span class="exercise-result-caption"></span></summary><div class="editor-body">
    <div class="exercise-main-fields">${field('exercise-distance', 'Дистанция, м', e.distance ?? '', 'type="number" min="1" max="100000" step="1" inputmode="numeric"')}
    <label class="field"><span>Стиль</span><select name="exercise-style">${Object.entries(STYLES).map(([k,v]) => `<option value="${k}" ${e.style === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
    <details class="editor-options"><summary>Техника и плановые параметры</summary><div class="form-grid">
    ${field('exercise-technique', 'Техника', e.technique, 'maxlength="200" placeholder="Ногами, с доской…"')}
    ${field('exercise-description', 'Название или описание', e.description, 'maxlength="500"')}
    ${timeField('exercise-planned', 'Плановое время', e.plannedTimeCs)}${timeField('exercise-rest', 'Отдых после упражнения', e.restAfterCs)}</div>
    ${e.legacy?.durationCs ? `<p class="exercise-hint">Продолжительность старого задания: ${formatCentiseconds(e.legacy.durationCs)}.</p>` : ''}</details>
    ${resultsEditorHTML(e, rounds)}${tools('exercise')}</div></details>`;
}
function blockHTML(b, index) {
  return `<details class="block-editor compact-block" data-id="${esc(b.id)}" data-rounds="${b.rounds}" open><summary class="block-caption"></summary><div class="editor-body">
    <div class="block-main-fields">${field('block-rounds', 'Круги', b.rounds, 'type="number" min="1" step="1" inputmode="numeric"')}
    <div class="between-rest" ${b.rounds > 1 ? '' : 'hidden'}>${timeField('block-between', 'Отдых между кругами', b.restBetweenCs)}</div></div>
    <div class="block-exercises">${b.exercises.map(e => exerciseHTML(e, b.rounds)).join('')}</div>
    <button type="button" class="text-link add-element" data-edit="add-exercise">+ Добавить упражнение</button>
    <details class="editor-options"><summary>Настройки блока</summary><div class="form-grid">${field('block-title', 'Название · необязательно', b.title || `Блок ${index + 1}`, 'maxlength="200"')}${timeField('block-after', 'Отдых после блока', b.restAfterCs)}</div><p class="exercise-hint">В конце круга отдых упражнения заменяется паузой между кругами, в конце блока — паузой после блока.</p></details>
    ${tools('block')}</div></details>`;
}
export function editorHTML(w) {
  return `<form id="workout-form" novalidate><div class="form-grid">
    ${field('date', 'Дата', w.date, 'type="date" min="1900-01-01"')}${field('title', 'Название тренировки', w.title, 'maxlength="200"')}
    </div><p class="editor-status">${w.status === 'COMPLETED' ? 'Выполнена' : 'В планах · результаты сохраняются как черновик'}</p>
    <div id="block-editors">${w.blocks.map(blockHTML).join('')}</div>
    <button type="button" class="button secondary add-element" id="add-block">+ Добавить блок</button>
    <div class="training-totals"><div id="manual-distance-field">${field('distance', 'Дистанция без блоков, м · необязательно', w.distance ?? '', 'type="number" min="1" max="100000" step="1"')}</div><p id="calculated-distance" class="calculated-total"></p></div>
    <details class="editor-options workout-extra"><summary>Продолжительность и комментарий</summary>
    ${timeField('duration', 'Общая фактическая продолжительность', w.durationCs)}
    ${w.legacy?.manualDurationCs && w.legacy.manualDurationCs !== w.durationCs ? `<p class="exercise-hint">Старое ручное значение: ${formatCentiseconds(w.legacy.manualDurationCs)}.</p>` : ''}
    ${w.style ? `<p class="exercise-hint">Стиль исходной записи: ${STYLES[w.style]}</p>` : ''}
    <label class="field comment-field"><span>Комментарий и самочувствие</span><textarea name="comment" rows="2" maxlength="2000">${esc(w.comment)}</textarea></label></details>
    <div id="form-error" class="form-error" role="alert" tabindex="-1" hidden></div>${discardHTML()}
    <div class="modal-actions editor-save-actions"><button type="button" class="button secondary" data-action="close-modal">Отмена</button>
    ${w.status === 'COMPLETED' ? '<button type="submit" class="button primary" name="save-status" value="COMPLETED">Сохранить изменения</button><button type="submit" class="text-link" name="save-status" value="PLANNED">Вернуть в планы</button>' : '<button type="submit" class="button secondary" name="save-status" value="PLANNED">Сохранить план</button><button type="submit" class="button primary" name="save-status" value="COMPLETED">Отметить выполненной</button>'}
    </div></form>`;
}
export function mountEditor(w, { today, onSave, onDiscard }) {
  const form = document.querySelector('#workout-form');
  const list = form.querySelector('#block-editors');
  const resultEditors = new Map();
  const legacy = new Map(w.blocks.flatMap(b => b.exercises.filter(e => e.legacy).map(e => [e.id, e.legacy])));
  const blocks = () => [...list.children];
  const exercises = b => [...b.querySelector('.block-exercises').children];
  const caption = e => `${val(e, 'exercise-distance') || '—'} м · ${STYLES[val(e, 'exercise-style')]}${val(e, 'exercise-technique') ? ' · ' + val(e, 'exercise-technique') : ''}`;
  const update = () => {
    let distance = 0;
    for (const [bi, b] of blocks().entries()) {
      const items = exercises(b);
      const rounds = Number(b.dataset.rounds);
      const metres = items.reduce((sum, e) => sum + (num(e, 'exercise-distance') || 0), 0) * rounds;
      distance += metres;
      b.querySelector('.block-caption').textContent = `${val(b, 'block-title').trim() || `Блок ${bi + 1}`} · ${circleLabel(rounds)} · ${metres} м`;
      b.querySelector('.between-rest').hidden = rounds <= 1;
      b.querySelector('[data-edit="block-up"]').disabled = bi === 0;
      b.querySelector('[data-edit="block-down"]').disabled = bi === blocks().length - 1;
      items.forEach((e, ei) => {
        e.querySelector('.exercise-caption').textContent = caption(e);
        e.querySelector('.exercise-description-caption').textContent = val(e, 'exercise-description');
        e.querySelector('.exercise-description-caption').hidden = !val(e, 'exercise-description');
        e.querySelector('.exercise-result-caption').textContent = resultEditors.get(e.dataset.id)?.overview().label || 'Нет результатов';
        e.querySelector('[data-edit="exercise-up"]').disabled = ei === 0;
        e.querySelector('[data-edit="exercise-down"]').disabled = ei === items.length - 1;
      });
    }
    form.querySelector('#manual-distance-field').hidden = blocks().length > 0;
    form.querySelector('#calculated-distance').textContent = blocks().length ? `Всего: ${distance} м` : '';
  };
  const mountExercise = (card, exercise, rounds) => resultEditors.set(exercise.id, mountResultsEditor(card.querySelector('.inline-results'), exercise, rounds, update));
  const syncRounds = b => {
    const next = num(b, 'block-rounds');
    const previous = Number(b.dataset.rounds);
    if (!Number.isSafeInteger(next) || next < 1 || next === previous) return;
    const affected = exercises(b).some(e => resultEditors.get(e.dataset.id).hasBeyond(next));
    if (next < previous && affected && !window.confirm('В удаляемых кругах есть результаты. Уменьшить количество кругов и удалить эти результаты из формы?')) {
      b.querySelector('[name="block-rounds"]').value = previous; return;
    }
    for (const e of exercises(b)) resultEditors.get(e.dataset.id).setRounds(next);
    b.dataset.rounds = String(next); update();
  };
  const reveal = card => { card.open = true; card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); card.querySelector('input')?.focus({ preventScroll: true }); };
  blocks().forEach((b, i) => exercises(b).forEach((e, j) => mountExercise(e, w.blocks[i].exercises[j], w.blocks[i].rounds)));
  form.querySelector('#add-block').addEventListener('click', () => {
    const block = newBlock(blocks().length + 1);
    list.insertAdjacentHTML('beforeend', blockHTML(block, blocks().length));
    const card = list.lastElementChild;
    mountExercise(exercises(card)[0], block.exercises[0], block.rounds);
    update(); reveal(card); reveal(exercises(card)[0]);
  });
  form.addEventListener('click', event => {
    const button = event.target.closest('[data-edit]');
    if (!button) return;
    const action = button.dataset.edit;
    const b = button.closest('.block-editor');
    if (action === 'add-exercise') {
      const items = b.querySelector('.block-exercises');
      for (const e of items.children) if (num(e, 'exercise-distance') > 0) e.open = false;
      const exercise = newExercise();
      items.insertAdjacentHTML('beforeend', exerciseHTML(exercise, Number(b.dataset.rounds)));
      mountExercise(items.lastElementChild, exercise, Number(b.dataset.rounds));
      update(); reveal(items.lastElementChild);
    } else {
      const card = action.startsWith('block-') ? b : button.closest('.exercise-editor');
      const parent = card.parentElement;
      if (action.endsWith('-remove')) {
        if (!window.confirm('Удалить элемент программы вместе с его результатами?')) return;
        for (const e of card === b ? exercises(b) : [card]) resultEditors.delete(e.dataset.id);
        card.remove();
      } else if (action.endsWith('-up') && card.previousElementSibling) parent.insertBefore(card, card.previousElementSibling);
      else if (action.endsWith('-down') && card.nextElementSibling) parent.insertBefore(card.nextElementSibling, card);
      update();
    }
  });
  form.addEventListener('change', event => { if (event.target.name === 'block-rounds') syncRounds(event.target.closest('.block-editor')); });
  form.addEventListener('input', update);
  update();
  const protection = protectEditor(form, () => JSON.stringify({
    fields: [...form.querySelectorAll('input,select,textarea')].filter(input => !input.closest('.inline-results')).map(input => [input.name, input.value]),
    program: blocks().map(b => [b.dataset.id, exercises(b).map(e => [e.dataset.id, resultEditors.get(e.dataset.id).getDraft()])]),
  }), onDiscard);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const error = form.querySelector('#form-error');
    try {
      blocks().forEach(syncRounds);
      const program = blocks().map((b, i) => ({ id: b.dataset.id, title: val(b, 'block-title').trim() || `Блок ${i + 1}`, rounds: num(b, 'block-rounds'),
        restBetweenCs: time(b, 'block-between'), restAfterCs: time(b, 'block-after'),
        exercises: exercises(b).map(e => ({ id: e.dataset.id, distance: num(e, 'exercise-distance'), style: val(e, 'exercise-style'),
          technique: val(e, 'exercise-technique'), description: val(e, 'exercise-description'), plannedTimeCs: time(e, 'exercise-planned'), restAfterCs: time(e, 'exercise-rest'),
          ...resultEditors.get(e.dataset.id).read(), ...(legacy.has(e.dataset.id) ? { legacy: legacy.get(e.dataset.id) } : {}),
        })),
      }));
      const status = event.submitter?.value || w.status;
      const candidate = validateWorkout({ ...w, date: val(form, 'date'), title: val(form, 'title'), status,
        blocks: program, distance: blocks().length ? w.distance : num(form, 'distance'), durationCs: time(form, 'duration'), comment: val(form, 'comment') }, today());
      onSave(candidate);
    } catch (reason) { error.textContent = reason.message; error.hidden = false; error.focus(); }
  });
  return protection;
}
