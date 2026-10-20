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
export function validateExercise(input) {
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
export function validateWorkout(input, today = dateKey()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Запись должна быть объектом.');
  if (!validId(input.id)) throw new Error('Некорректный идентификатор записи.');
  if (!validDate(input.date) || input.date > today) throw new Error('Укажите существующую дату не позднее сегодняшней.');
  if (typeof input.title !== 'string' || input.title.length > 200) throw new Error('Название тренировки — не более 200 символов.');
  if (typeof input.comment !== 'string' || input.comment.length > 2000) throw new Error('Комментарий должен содержать не более 2 000 символов.');
  if (!Array.isArray(input.exercises)) throw new Error('У тренировки должен быть список заданий.');
  const ids = new Set();
  const exercises = input.exercises.map((exercise, index) => {
    let normalized;
    try { normalized = validateExercise(exercise); }
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
export const totalDistance = workout => workout.exercises.length ? workout.exercises.reduce((sum, exercise) => sum + exercise.distance, 0) : workout.distance;
export const hasCompleteDurations = workout => workout.exercises.length > 0 && workout.exercises.every(exercise => exercise.duration !== null);
export const totalDuration = workout => hasCompleteDurations(workout) ? workout.exercises.reduce((sum, exercise) => sum + exercise.duration, 0) : workout.duration;
export function migrateLegacyWorkout(input, today = dateKey()) {
  const old = validateLegacyWorkout(input, today);
  return validateWorkout({
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
    distance: source.exercises.length ? null : source.distance, duration: null, style: source.style,
    exercises: source.exercises.map(exercise => ({
      id: createId(), distance: exercise.distance, style: exercise.style,
      description: exercise.description, timed: exercise.timed, duration: null, result: null,
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
  if (!data || ![1, 2].includes(data.version) || !Array.isArray(data.workouts)) throw new Error('Неподдерживаемый формат. Нужна резервная копия Нырка версии 1 или 2.');
  if (data.workouts.length > MAX_WORKOUTS) throw new Error('В одном дневнике может быть не более 10 000 записей.');
  const ids = new Set();
  return data.workouts.map((item, index) => {
    let workout;
    try { workout = data.version === 1 ? migrateLegacyWorkout(item, today) : validateWorkout(item, today); }
    catch (error) { throw new Error(`Запись ${index + 1}: ${error.message}`); }
    if (ids.has(workout.id)) throw new Error(`В файле повторяется идентификатор записи ${index + 1}.`);
    ids.add(workout.id);
    return workout;
  });
}
export const backupJSON = workouts => JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), workouts }, null, 2);
export const chronological = (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
export const sortedWorkouts = workouts => [...workouts].sort((a, b) => chronological(b, a));
export const pace = exercise => exercise.timed && exercise.distance > 0 && exercise.result > 0 ? exercise.result * 100 / exercise.distance : null;
export function formatTime(seconds) {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}
export const recordKey = workout => `${workout.distance}:${workout.style}`;
const swimOrder = (a, b) => chronological(a, b) || a.exerciseIndex - b.exerciseIndex;
export function timedResults(workouts) {
  return workouts.flatMap(workout => workout.exercises.flatMap((exercise, exerciseIndex) =>
    exercise.timed && exercise.result !== null ? [{
      ...exercise, id: workout.id, exerciseId: exercise.id, exerciseIndex,
      date: workout.date, createdAt: workout.createdAt, title: workout.title,
    }] : []));
}
export function previousResult(workouts, workout) {
  return timedResults(workouts).filter(item => recordKey(item) === recordKey(workout) && swimOrder(item, workout) < 0).sort((a, b) => swimOrder(b, a))[0] ?? null;
}
export function personalBests(workouts) {
  const records = new Map();
  for (const workout of timedResults(workouts).sort(swimOrder)) {
    const key = recordKey(workout);
    if (!records.has(key) || workout.result < records.get(key).result) records.set(key, workout);
  }
  return [...records.values()].sort((a, b) => a.distance - b.distance || a.style.localeCompare(b.style));
}
export function regularity(workouts, today = dateKey()) {
  const days = [...new Set(workouts.filter(w => w.date <= today).map(w => w.date))].sort();
  const lastDate = days.at(-1) ?? null;
  const average = days.length < 2 ? null : (dayNumber(lastDate) - dayNumber(days[0])) / (days.length - 1);
  const elapsed = lastDate ? dayNumber(today) - dayNumber(lastDate) : null;
  return { days: days.length, lastDate, average, elapsed, overdue: average !== null && elapsed > Math.max(average * 1.5, average + 1) };
}
export function summary(workouts, today = dateKey()) {
  const actual = workouts.filter(w => w.date <= today);
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
    const items = workouts.filter(w => w.date.startsWith(key) && w.date <= today);
    return { key, count: items.length, distance: items.reduce((sum, w) => sum + (totalDistance(w) ?? 0), 0) };
  });
}
export function weeklySeries(workouts, today = dateKey(), count = 8) {
  const weekDay = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = shiftDate(today, -((weekDay + 6) % 7));
  return Array.from({ length: count }, (_, index) => {
    const key = shiftDate(monday, (index - count + 1) * 7);
    return { key, count: workouts.filter(w => w.date >= key && w.date < shiftDate(key, 7) && w.date <= today).length };
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
