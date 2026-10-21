import { parseTime, formatCentiseconds } from './domain.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PAGE_SIZE = 16;
export const resultDraft = exercise => ({ mode: exercise.resultMode, entries: exercise.results.map(r => ({ id: r.id, round: r.round, value: formatCentiseconds(r.timeCs) })) });
export const hasResultsBeyond = (draft, rounds) => draft.mode === 'rounds' && draft.entries.some(r => r.round > rounds && r.value.trim());
export const resizeDraft = (draft, rounds) => ({ ...draft, entries: draft.entries.filter(r => draft.mode === 'best' || r.round <= rounds).map(r => ({ ...r })) });
export function resultPage(draft, rounds, requestedPage = 0) {
  const count = draft.mode === 'best' ? 1 : rounds;
  const page = Math.max(0, Math.min(requestedPage, Math.ceil(count / PAGE_SIZE) - 1));
  const start = page * PAGE_SIZE;
  const slots = Array.from({ length: Math.min(PAGE_SIZE, count - start) }, (_, i) => {
    const round = draft.mode === 'best' ? null : start + i + 1;
    return { round, value: draft.entries.find(r => r.round === round)?.value || '' };
  });
  return { count, page, start, slots };
}
export function readResultDraft(draft, createId = () => crypto.randomUUID()) {
  return { resultMode: draft.mode, results: draft.entries.filter(r => r.value.trim()).map(r => ({ id: r.id || createId(), round: draft.mode === 'best' ? null : r.round, timeCs: parseTime(r.value) })) };
}
export function resultOverview(draft, rounds) {
  const times = draft.entries.flatMap(r => {
    try { const value = parseTime(r.value); return value === null ? [] : [value]; } catch { return []; }
  });
  const best = times.length ? times.reduce((min, time) => Math.min(min, time)) : null;
  const label = best === null ? 'Нет результатов' : `Лучшее: ${best < 6000 ? (best / 100).toFixed(2) + ' с' : formatCentiseconds(best)}`;
  return { best, count: times.length, label: `${label} · ${draft.mode === 'best' ? 'круг неизвестен' : `${times.length} из ${rounds}`}` };
}
export function withExerciseResults(workout, exerciseId, draft, createId) {
  let found = false;
  const blocks = workout.blocks.map(b => ({ ...b, exercises: b.exercises.map(e => {
    if (e.id !== exerciseId) return e;
    found = true;
    return { ...e, ...readResultDraft(draft, createId) };
  }) }));
  if (!found) throw new Error('Упражнение уже удалено. Откройте тренировку заново.');
  return { ...workout, blocks };
}
export function resultsEditorHTML(exercise, rounds, open = false) {
  return `<details class="inline-results" data-single="${rounds === 1}" ${open || rounds === 1 ? 'open' : ''}><summary>Времена <span class="result-count">${esc(resultOverview(resultDraft(exercise), rounds).label)}</span></summary><div class="results-body">
    <label class="result-mode-label" ${rounds === 1 ? 'hidden' : ''}>Записать <select name="result-mode"><option value="rounds" ${exercise.resultMode === 'rounds' ? 'selected' : ''}>По кругам</option><option value="best" ${exercise.resultMode === 'best' ? 'selected' : ''}>Только лучший</option></select></label>
    <div class="result-grid"></div><div class="result-pages" hidden><button type="button" class="icon-button" data-results-page="prev" aria-label="Предыдущие круги">←</button><span></span><button type="button" class="icon-button" data-results-page="next" aria-label="Следующие круги">→</button></div>
    <p class="result-hint">Неизвестное время оставьте пустым. Например: 49.82 или 1:48.37.</p></div></details>`;
}
export function mountResultsEditor(root, exercise, initialRounds, onChange = () => {}) {
  let draft = resultDraft(exercise);
  let rounds = initialRounds;
  let page = 0;
  const grid = root.querySelector('.result-grid');
  const select = root.querySelector('[name="result-mode"]');
  const pages = root.querySelector('.result-pages');
  const updateSummary = () => { root.querySelector('.result-count').textContent = resultOverview(draft, rounds).label; };
  const render = () => {
    // Hide the choice for one round without converting previously saved modes.
    root.dataset.single = String(rounds === 1);
    root.querySelector('.result-mode-label').hidden = rounds === 1;
    if (rounds === 1) root.open = true;
    const current = resultPage(draft, rounds, page);
    const { count, start } = current;
    page = current.page;
    grid.innerHTML = current.slots.map(({ round, value }) => `<label class="result-cell"><span>${rounds === 1 ? 'Время' : round === null ? 'Лучшее время' : `Круг ${round}`}</span><input name="result-time" data-round="${round ?? ''}" inputmode="decimal" maxlength="14" placeholder="—" value="${esc(value)}"></label>`).join('');
    pages.hidden = count <= PAGE_SIZE;
    pages.querySelector('span').textContent = `${start + 1}–${Math.min(count, start + PAGE_SIZE)} из ${count}`;
    pages.querySelector('[data-results-page="prev"]').disabled = page === 0;
    pages.querySelector('[data-results-page="next"]').disabled = start + PAGE_SIZE >= count;
    updateSummary();
  };
  root.addEventListener('input', event => {
    if (event.target.name !== 'result-time') return;
    const round = draft.mode === 'best' ? null : Number(event.target.dataset.round);
    const entry = draft.entries.find(r => r.round === round);
    if (entry) entry.value = event.target.value;
    else draft.entries.push({ id: null, round, value: event.target.value });
    draft.entries.sort((a, b) => (a.round ?? 0) - (b.round ?? 0));
    updateSummary(); onChange();
  });
  root.addEventListener('change', event => {
    if (event.target !== select) return;
    if (draft.entries.some(r => r.value.trim()) && !window.confirm('Сменить режим и очистить введённые результаты этого упражнения?')) { select.value = draft.mode; return; }
    draft = { mode: select.value, entries: [] }; page = 0; render(); onChange();
  });
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-results-page]');
    if (!button || button.disabled) return;
    page += button.dataset.resultsPage === 'next' ? 1 : -1; render();
  });
  render();
  return {
    getDraft: () => ({ ...draft, entries: draft.entries.filter(r => r.value.trim()).map(r => ({ ...r })) }),
    hasBeyond: next => hasResultsBeyond(draft, next),
    setRounds(next) { draft = resizeDraft(draft, next); rounds = next; render(); },
    overview: () => resultOverview(draft, rounds),
    read: () => readResultDraft(draft),
  };
}

export const discardHTML = () => `<div id="discard-confirm" class="discard-confirm" role="alertdialog" aria-label="Несохранённые изменения" tabindex="-1" hidden><p>Закрыть форму и потерять несохранённые изменения?</p><div class="modal-actions"><button type="button" class="button secondary" id="keep-editing">Продолжить редактирование</button><button type="button" class="button danger" id="discard-editing">Закрыть без сохранения</button></div></div>`;
export function protectEditor(form, snapshot, onDiscard) {
  const baseline = snapshot();
  const isDirty = () => snapshot() !== baseline;
  const unload = event => { if (isDirty()) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('beforeunload', unload);
  form.querySelector('#keep-editing').onclick = () => { form.querySelector('#discard-confirm').hidden = true; };
  form.querySelector('#discard-editing').onclick = onDiscard;
  return {
    canClose() {
      if (!isDirty()) return true;
      const prompt = form.querySelector('#discard-confirm'); prompt.hidden = false; prompt.focus(); prompt.scrollIntoView({ block: 'nearest' }); return false;
    },
    dispose() { window.removeEventListener('beforeunload', unload); },
  };
}
