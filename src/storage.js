import { backupJSON, parseBackup, MAX_WORKOUTS, validateWorkout } from './domain.js';
export const STORAGE_KEY = 'nyrok.workouts.v1';
export function readWorkouts(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  return raw === null ? [] : parseBackup(raw);
}
export function writeWorkouts(storage, workouts) {
  if (workouts.length > MAX_WORKOUTS) throw new Error('Дневник вмещает до 10 000 записей. Экспортируйте резервную копию.');
  const normalized = workouts.map(workout => validateWorkout(workout));
  const ids = new Set(normalized.map(workout => workout.id));
  if (ids.size !== normalized.length) throw new Error('Идентификаторы записей должны быть уникальны.');
  try { storage.setItem(STORAGE_KEY, backupJSON(normalized)); }
  catch { throw new Error('Не удалось сохранить данные в браузере. Проверьте доступ к хранилищу и свободное место. Изменения не сохранены.'); }
}
