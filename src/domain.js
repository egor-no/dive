export const STYLES = {
  freestyle: 'Кроль', breaststroke: 'Брасс', backstroke: 'На спине',
  butterfly: 'Баттерфляй', medley: 'Комплекс', mixed: 'Разные стили',
};
export const MAX_WORKOUTS = 10000;
const DAY = 86400000;
export const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const dayNumber = value => Date.parse(`${value}T00:00:00Z`) / DAY;
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '1900-01-01';
}
export function shiftDate(value, days) {
  return new Date((dayNumber(value) + days) * DAY).toISOString().slice(0, 10);
}
export function monthKey(offset = 0, today = dateKey()) {
  const date = new Date(`${today.slice(0, 7)}-01T12:00:00`);
  date.setMonth(date.getMonth() + offset);
  return dateKey(date).slice(0, 7);
}
function validateLegacyWorkout(input, today = dateKey()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Запись должна быть объектом.');
  if (typeof input.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(input.id)) throw new Error('Некорректный идентификатор записи.');
  if (!['regular', 'timed'].includes(input.type)) throw new Error('Неизвестный тип тренировки.');
  if (!validDate(input.date) || input.date > today) throw new Error('Укажите существующую дату не позднее сегодняшней.');
  const distance = input.distance ?? null;
  const duration = input.duration ?? null;
  if (distance !== null && (!Number.isInteger(distance) || distance < 1 || distance > 100000)) throw new Error('Дистанция должна быть целым числом от 1 до 100 000 м.');
  if (duration !== null && (!Number.isInteger(duration) || duration < 1 || duration > 604800)) throw new Error('Продолжительность должна быть от 1 секунды до 7 дней.');
  const style = input.style ?? '';
  if (typeof style !== 'string' || (style !== '' && !Object.hasOwn(STYLES, style))) throw new Error('Выберите стиль плавания из списка.');
  if (input.type === 'timed' && (distance === null || duration === null || !style)) throw new Error('Для заплыва на время нужны дистанция, результат и стиль.');
  if (typeof input.comment !== 'string' || input.comment.length > 2000) throw new Error('Комментарий должен содержать не более 2 000 символов.');
  if (typeof input.createdAt !== 'string' || !Number.isFinite(Date.parse(input.createdAt))) throw new Error('Некорректное время создания записи.');
  return { id: input.id, type: input.type, date: input.date, distance, duration, style, comment: input.comment.trim(), createdAt: input.createdAt };
}
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
function optionalNumber(value, max, label) {
  if (value !== null && (!Number.isInteger(value) || value < 1 || value > max)) throw new Error(`${label}: введите целое число от 1 до ${max}.`);
  return value;
}
function validateV2Exercise(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !validId(input.id)) throw new Error('Некорректный идентификатор задания.');
  if (input.distance === null || input.distance === undefined) throw new Error('Укажите дистанцию задания.');
  const distance = optionalNumber(input.distance, 100000, 'Дистанция задания');
  if (!Object.hasOwn(STYLES, input.style)) throw new Error('Выберите стиль плавания задания.');
  if (typeof input.description !== 'string' || input.description.length > 500) throw new Error('Описание задания — не более 500 символов.');
  if (typeof input.timed !== 'boolean') throw new Error('Некорректный признак «На время».');
  const duration = optionalNumber(input.duration ?? null, 604800, 'Продолжительность задания');
  const result = optionalNumber(input.result ?? null, 604800, 'Результат заплыва');
  if (!input.timed && result !== null) throw new Error('Результат можно указать только у задания «На время».');
  return { id: input.id, distance, style: input.style, description: input.description.trim(), duration, timed: input.timed, result };
}
function validateV2Workout(input, today = dateKey()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Запись должна быть объектом.');
  if (!validId(input.id)) throw new Error('Некорректный идентификатор записи.');
  if (!validDate(input.date) || input.date > today) throw new Error('Укажите существующую дату не позднее сегодняшней.');
  if (typeof input.title !== 'string' || input.title.length > 200) throw new Error('Название тренировки — не более 200 символов.');
  if (typeof input.comment !== 'string' || input.comment.length > 2000) throw new Error('Комментарий должен содержать не более 2 000 символов.');
  if (!Array.isArray(input.exercises)) throw new Error('У тренировки должен быть список заданий.');
  const ids = new Set();
  const exercises = input.exercises.map((exercise, index) => {
    let normalized;
    try { normalized = validateV2Exercise(exercise); }
    catch (error) { throw new Error(`Задание ${index + 1}: ${error.message}`); }
    if (ids.has(normalized.id)) throw new Error('В тренировке повторяется идентификатор задания.');
    ids.add(normalized.id);
    return normalized;
  });
  // These fields are manual totals. Calculated totals never get added to them.
  const distance = optionalNumber(input.distance ?? null, 100000, 'Общая дистанция');
  const duration = optionalNumber(input.duration ?? null, 604800, 'Общая продолжительность');
  const style = input.style ?? ''; // Preserve the style of legacy workouts without exercises.
  if (typeof style !== 'string' || (style !== '' && !Object.hasOwn(STYLES, style))) throw new Error('Неизвестный стиль плавания.');
  if (typeof input.createdAt !== 'string' || !Number.isFinite(Date.parse(input.createdAt))) throw new Error('Некорректное время создания записи.');
  return { id: input.id, date: input.date, title: input.title.trim(), comment: input.comment.trim(), exercises, distance, duration, style, createdAt: input.createdAt };
}
export const blockDistance = block => block.exercises.reduce((sum, exercise) => sum + exercise.distance, 0) * block.rounds;
export function* executionSequence(block) {
  for (let round = 1; round <= block.rounds; round++) {
    for (let index = 0; index < block.exercises.length; index++) {
      const exercise = block.exercises[index];
      const restAfterCs = index < block.exercises.length - 1 ? exercise.restAfterCs : round < block.rounds ? block.restBetweenCs : block.restAfterCs;
      yield { exerciseId: exercise.id, round, distance: exercise.distance, restAfterCs };
    }
  }
}
export const exercisesOf = workout => workout.blocks.flatMap(block => block.exercises);
export const totalDistance = workout => workout.blocks.length ? workout.blocks.reduce((sum, block) => sum + blockDistance(block), 0) : workout.distance;
export const totalDuration = workout => workout.durationCs === null ? null : workout.durationCs / 100;
const textField = (value, max, label) => {
  if (typeof value !== 'string' || value.length > max) throw new Error(`${label}: не более ${max} символов.`);
  return value.trim();
};
const timeValue = (value, label) => optionalNumber(value ?? null, 60480000, label);
export function parseTime(value) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!text) return null;
  const match = /^(?:(\d+):)?(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match || (match[1] !== undefined && Number(match[2]) > 59)) throw new Error('Время: укажите секунды или мин:сек.сотые, например 49.82 или 1:48.37.');
  const cs = (Number(match[1] || 0) * 60 + Number(match[2])) * 100 + Number((match[3] || '').padEnd(2, '0'));
  return timeValue(cs, 'Время');
}
export function formatCentiseconds(value) {
  if (value === null || !Number.isFinite(value)) return '—';
  const cs = Math.round(value);
  return `${Math.floor(cs / 6000)}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}
export function validateExercise(input, rounds = 1) {
  if (!input || !validId(input.id)) throw new Error('Некорректный идентификатор упражнения.');
  const distance = optionalNumber(input.distance ?? null, 100000, 'Дистанция упражнения');
  if (distance === null) throw new Error('Укажите дистанцию упражнения.');
  if (typeof input.style !== 'string' || !Object.hasOwn(STYLES, input.style)) throw new Error('Выберите стиль плавания упражнения.');
  if (!['rounds', 'best'].includes(input.resultMode)) throw new Error('Неизвестный режим результатов.');
  if (!Array.isArray(input.results)) throw new Error('Нужен список результатов.');
  const seenRounds = new Set();
  const results = input.results.map(result => {
    if (!result || !validId(result.id)) throw new Error('Некорректный идентификатор результата.');
    if (input.resultMode === 'best' ? result.round !== null : !Number.isSafeInteger(result.round) || result.round < 1 || result.round > rounds) throw new Error('Номер круга результата должен входить в программу.');
    if (seenRounds.has(result.round)) throw new Error('Один круг не может иметь два результата; лучший результат указывается один раз.');
    seenRounds.add(result.round);
    const timeCs = timeValue(result.timeCs, 'Результат');
    if (timeCs === null) throw new Error('Укажите время результата.');
    return { id: result.id, round: result.round, timeCs };
  });
  const exercise = {
    id: input.id, distance, style: input.style,
    technique: textField(input.technique, 200, 'Уточнение техники'),
    description: textField(input.description, 500, 'Описание'),
    plannedTimeCs: timeValue(input.plannedTimeCs, 'Плановое время'),
    restAfterCs: timeValue(input.restAfterCs, 'Отдых после упражнения'),
    resultMode: input.resultMode, results,
  };
  if (input.legacy !== undefined) {
    if (!input.legacy || typeof input.legacy.timed !== 'boolean' || !validId(input.legacy.id)) throw new Error('Некорректные сведения старого задания.');
    exercise.legacy = { id: input.legacy.id, timed: input.legacy.timed, durationCs: timeValue(input.legacy.durationCs, 'Старая продолжительность') };
  }
  return exercise;
}
export function validateWorkout(input, today = dateKey()) {
  if (!input || !validId(input.id)) throw new Error('Некорректный идентификатор тренировки.');
  if (!['PLANNED', 'COMPLETED'].includes(input.status)) throw new Error('Выберите статус тренировки.');
  if (!validDate(input.date) || (input.status === 'COMPLETED' && input.date > today)) throw new Error('Укажите корректную дату. Выполненная тренировка не может быть в будущем.');
  if (!Array.isArray(input.blocks)) throw new Error('Нужен список блоков.');
  const ids = new Set([input.id]);
  const addId = id => {
    if (!validId(id) || ids.has(id)) throw new Error('Некорректный или повторяющийся идентификатор внутри тренировки.');
    ids.add(id);
  };
  const blocks = input.blocks.map((block, index) => {
    try {
      if (!block) throw new Error('Блок должен быть объектом.');
      addId(block.id);
      if (!Number.isSafeInteger(block.rounds) || block.rounds < 1) throw new Error('Количество кругов — целое число от 1.');
      if (!Array.isArray(block.exercises) || !block.exercises.length) throw new Error('Добавьте хотя бы одно упражнение или удалите пустой блок.');
      const exercises = block.exercises.map(e => {
        const normalized = validateExercise(e, block.rounds);
        addId(normalized.id);
        normalized.results.forEach(r => addId(r.id));
        return normalized;
      });
      const normalized = { id: block.id, title: textField(block.title, 200, 'Название блока'), rounds: block.rounds, exercises,
        restBetweenCs: timeValue(block.restBetweenCs, 'Отдых между кругами'), restAfterCs: timeValue(block.restAfterCs, 'Отдых после блока') };
      if (!normalized.title) throw new Error('Укажите название блока.');
      if (!Number.isSafeInteger(blockDistance(normalized))) throw new Error('Слишком большая дистанция блока.');
      return normalized;
    } catch (error) { throw new Error(`Блок ${index + 1}: ${error.message}`); }
  });
  const style = input.style ?? '';
  if (typeof style !== 'string' || (style !== '' && !Object.hasOwn(STYLES, style))) throw new Error('Неизвестный стиль исходной записи.');
  if (typeof input.createdAt !== 'string' || !Number.isFinite(Date.parse(input.createdAt))) throw new Error('Некорректное время создания записи.');
  const workout = { id: input.id, date: input.date, title: textField(input.title, 200, 'Название тренировки'), status: input.status,
    blocks, distance: optionalNumber(input.distance ?? null, 100000, 'Общая дистанция'),
    durationCs: timeValue(input.durationCs, 'Общая продолжительность'), style,
    comment: textField(input.comment, 2000, 'Комментарий'), createdAt: input.createdAt };
  if (input.legacy !== undefined) {
    if (!input.legacy || typeof input.legacy !== 'object') throw new Error('Некорректные сведения старой тренировки.');
    workout.legacy = { manualDurationCs: timeValue(input.legacy.manualDurationCs, 'Старая общая продолжительность') };
  }
  if (totalDistance(workout) !== null && !Number.isSafeInteger(totalDistance(workout))) throw new Error('Слишком большая общая дистанция.');
  return workout;
}
export function migrateV2Workout(input, today = dateKey()) {
  const old = validateV2Workout(input, today);
  const used = new Set([old.id, ...old.exercises.map(e => e.id)]);
  let serial = 0;
  const allocate = () => { let id; do { id = `migrated-${++serial}`; } while (used.has(id)); used.add(id); return id; };
  const complete = old.exercises.length > 0 && old.exercises.every(e => e.duration !== null);
  const elapsed = complete ? old.exercises.reduce((sum, e) => sum + e.duration, 0) : old.duration;
  // Retain historical actual durations as metadata, never turn them into planned times or swims.
  return validateWorkout({ ...old, status: 'COMPLETED', durationCs: elapsed === null ? null : elapsed * 100,
    legacy: { manualDurationCs: old.duration === null ? null : old.duration * 100 },
    blocks: old.exercises.map((e, index) => ({
      id: allocate(), title: `Задание ${index + 1}`, rounds: 1, restBetweenCs: null, restAfterCs: null,
      exercises: [{ id: e.id === old.id ? allocate() : e.id, distance: e.distance, style: e.style,
        technique: '', description: e.description, plannedTimeCs: null, restAfterCs: null, resultMode: 'rounds',
        results: e.result === null ? [] : [{ id: allocate(), round: 1, timeCs: e.result * 100 }],
        legacy: { id: e.id, timed: e.timed, durationCs: e.duration === null ? null : e.duration * 100 },
      }],
    })),
  }, today);
}
export function migrateLegacyWorkout(input, today = dateKey()) {
  const old = validateLegacyWorkout(input, today);
  return migrateV2Workout({
    id: old.id, date: old.date, title: '', comment: old.comment, createdAt: old.createdAt,
    distance: old.type === 'regular' ? old.distance : null,
    // A legacy timed value is the swim result, not elapsed exercise/training time.
    duration: old.type === 'regular' ? old.duration : null,
    style: old.type === 'regular' ? old.style : '',
    exercises: old.type === 'timed' ? [{
      id: `legacy-${old.id}`.slice(0, 80), distance: old.distance, style: old.style,
      description: '', timed: true, result: old.duration, duration: null,
    }] : [],
  }, today);
}
export function copyWorkout(source, { today = dateKey(), createId = () => crypto.randomUUID(), now = new Date().toISOString() } = {}) {
  return {
    id: createId(), date: today, title: source.title, comment: '', createdAt: now,
    status: 'PLANNED', distance: source.blocks.length ? null : source.distance, durationCs: null, style: source.style,
    blocks: source.blocks.map(block => ({
      id: createId(), title: block.title, rounds: block.rounds, restBetweenCs: block.restBetweenCs, restAfterCs: block.restAfterCs,
      exercises: block.exercises.map(e => ({ id: createId(), distance: e.distance, style: e.style, technique: e.technique,
        description: e.description, plannedTimeCs: e.plannedTimeCs, restAfterCs: e.restAfterCs, resultMode: e.resultMode, results: [] })),
    })),
  };
}
export function templateWorkouts(workouts, query = '') {
  const search = query.trim().toLocaleLowerCase('ru-RU');
  return sortedWorkouts(workouts.filter(w => w.title.toLocaleLowerCase('ru-RU').includes(search)));
}
export function parseBackup(value, today = dateKey()) {
  let data;
  try { data = JSON.parse(value); } catch { throw new Error('Не удалось прочитать JSON. Выберите файл резервной копии.'); }
  if (!data || ![1, 2, 3].includes(data.version) || !Array.isArray(data.workouts)) throw new Error('Неподдерживаемый формат. Нужна резервная копия Нырка версии 1, 2 или 3.');
  if (data.workouts.length > MAX_WORKOUTS) throw new Error('В одном дневнике может быть не более 10 000 записей.');
  const ids = new Set();
  return data.workouts.map((item, index) => {
    let workout;
    try { workout = data.version === 1 ? migrateLegacyWorkout(item, today) : data.version === 2 ? migrateV2Workout(item, today) : validateWorkout(item, today); }
    catch (error) { throw new Error(`Запись ${index + 1}: ${error.message}`); }
    if (ids.has(workout.id)) throw new Error(`В файле повторяется идентификатор записи ${index + 1}.`);
    ids.add(workout.id);
    return workout;
  });
}
export const backupJSON = workouts => JSON.stringify({ version: 3, exportedAt: new Date().toISOString(), workouts }, null, 2);
export const chronological = (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
export const sortedWorkouts = workouts => [...workouts].sort((a, b) => chronological(b, a));
export const pace = swim => swim.distance > 0 && swim.timeCs > 0 ? swim.timeCs / swim.distance : null;
export function formatTime(seconds) {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}
export const techniqueKey = value => value.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ');
export const recordKey = swim => `${swim.distance}:${swim.style}${techniqueKey(swim.technique || '') ? ':' + techniqueKey(swim.technique) : ''}`;
const swimOrder = (a, b) => chronological(a, b) || a.blockIndex - b.blockIndex || (a.round ?? 0) - (b.round ?? 0) || a.exerciseIndex - b.exerciseIndex;
export function timedResults(workouts) {
  return workouts.filter(w => w.status === 'COMPLETED').flatMap(w => w.blocks.flatMap((block, blockIndex) =>
    block.exercises.flatMap((exercise, exerciseIndex) => exercise.results.map(result => ({
      distance: exercise.distance, style: exercise.style, technique: exercise.technique,
      timeCs: result.timeCs, round: result.round, resultId: result.id,
      id: w.id, blockId: block.id, blockIndex, exerciseId: exercise.id, exerciseIndex,
      date: w.date, createdAt: w.createdAt, title: w.title,
    })))));
}
export function previousResult(workouts, workout) {
  return timedResults(workouts).filter(item => recordKey(item) === recordKey(workout) && swimOrder(item, workout) < 0).sort((a, b) => swimOrder(b, a))[0] ?? null;
}
export function personalBests(workouts) {
  const records = new Map();
  for (const workout of timedResults(workouts).sort(swimOrder)) {
    const key = recordKey(workout);
    if (!records.has(key) || workout.timeCs < records.get(key).timeCs) records.set(key, workout);
  }
  return [...records.values()].sort((a, b) => a.distance - b.distance || a.style.localeCompare(b.style));
}
export function regularity(workouts, today = dateKey()) {
  const days = [...new Set(workouts.filter(w => w.status === 'COMPLETED' && w.date <= today).map(w => w.date))].sort();
  const lastDate = days.at(-1) ?? null;
  const average = days.length < 2 ? null : (dayNumber(lastDate) - dayNumber(days[0])) / (days.length - 1);
  const elapsed = lastDate ? dayNumber(today) - dayNumber(lastDate) : null;
  return { days: days.length, lastDate, average, elapsed, overdue: average !== null && elapsed > Math.max(average * 1.5, average + 1) };
}
export function summary(workouts, today = dateKey()) {
  const actual = workouts.filter(w => w.status === 'COMPLETED' && w.date <= today);
  const weekDay = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = shiftDate(today, -((weekDay + 6) % 7));
  const month = actual.filter(w => w.date.slice(0, 7) === today.slice(0, 7));
  return {
    total: actual.length,
    distance: actual.reduce((total, w) => total + (totalDistance(w) ?? 0), 0),
    monthCount: month.length,
    monthDistance: month.reduce((total, w) => total + (totalDistance(w) ?? 0), 0),
    weekCount: actual.filter(w => w.date >= monday).length,
    unknownDistance: actual.filter(w => totalDistance(w) === null).length,
    ...regularity(actual, today),
  };
}
export function monthlySeries(workouts, today = dateKey(), count = 6) {
  return Array.from({ length: count }, (_, index) => {
    const key = monthKey(index - count + 1, today);
    const items = workouts.filter(w => w.status === 'COMPLETED' && w.date.startsWith(key) && w.date <= today);
    return { key, count: items.length, distance: items.reduce((sum, w) => sum + (totalDistance(w) ?? 0), 0) };
  });
}
export function weeklySeries(workouts, today = dateKey(), count = 8) {
  const weekDay = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = shiftDate(today, -((weekDay + 6) % 7));
  return Array.from({ length: count }, (_, index) => {
    const key = shiftDate(monday, (index - count + 1) * 7);
    return { key, count: workouts.filter(w => w.status === 'COMPLETED' && w.date >= key && w.date < shiftDate(key, 7) && w.date <= today).length };
  });
}
export function paceSeries(workouts, key) {
  return timedResults(workouts).filter(w => recordKey(w) === key).sort(swimOrder).map(w => ({ ...w, pace: pace(w) }));
}
export function createDemo(today = dateKey()) {
  const offsets = [-34, -30, -26, -22, -18, -14, -10, -6, -3, -1];
  return offsets.map((offset, i) => migrateLegacyWorkout({
    id: `demo-${i}`, type: i % 3 === 0 ? 'timed' : 'regular',
    date: shiftDate(today, offset), distance: i % 3 === 0 ? 100 : [1200, 1500, 1000][i % 3],
    duration: i % 3 === 0 ? 128 - i * 2 : 2400 + i * 30,
    style: i % 4 === 1 ? 'breaststroke' : 'freestyle',
    comment: ['Спокойная вода, ровное дыхание. Хорошее начало дня.', 'Работал над техникой и скольжением.', 'Просто время для себя.'][i % 3],
    createdAt: `${shiftDate(today, offset)}T08:00:00.000Z`,
  }, today));
}
