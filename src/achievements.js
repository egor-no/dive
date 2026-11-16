import { dateKey, personalBests, recordKey, paceSeries } from './domain.js';
import { statisticsWorkouts, dailyPaceSeries } from './statistics.js';

// All 18 distance/style combinations explicitly listed for the 25 m pool.
const STANDARD_DISCIPLINES = [
  [50, ['freestyle', 'breaststroke', 'backstroke', 'butterfly']],
  [100, ['freestyle', 'breaststroke', 'backstroke', 'butterfly', 'medley']],
  [200, ['freestyle', 'breaststroke', 'backstroke', 'butterfly', 'medley']],
  [400, ['freestyle', 'medley']],
  [800, ['freestyle']],
  [1500, ['freestyle']],
];

export function achievementsData(workouts, today = dateKey()) {
  const records = personalBests(statisticsWorkouts(workouts, 'all', today));
  const byKey = new Map(records.map(record => [recordKey(record), record]));
  const standardKeys = new Set();
  const standard = STANDARD_DISCIPLINES.map(([distance, styles]) => ({
    distance,
    disciplines: styles.map(style => {
      const key = recordKey({ distance, style });
      standardKeys.add(key);
      return { style, record: byKey.get(key) ?? null };
    }),
  }));
  return { standard, other: records.filter(record => !standardKeys.has(recordKey(record))) };
}

// Called only by an explicit result/workout save, never by loading or rendering data.
export function savedRecordNotices(before, after, savedId, today = dateKey()) {
  const saved = after.find(workout => workout.id === savedId);
  if (!saved || saved.date > today) return [];
  const original = before.find(workout => workout.id === savedId);
  const oldExercises = new Map((original?.blocks ?? []).flatMap(block => block.exercises.map(exercise => [exercise.id, exercise])));
  const oldResultIds = new Set([...oldExercises.values()].flatMap(exercise => exercise.results.map(result => result.id)));
  const exercises = new Map(saved.blocks.flatMap(block => block.exercises.map(exercise => [exercise.id, exercise])));
  const previous = new Map(personalBests(statisticsWorkouts(before, 'all', today)).map(result => [recordKey(result), result]));
  return personalBests(statisticsWorkouts(after, 'all', today)).flatMap(best => {
    if (best.id !== savedId || oldResultIds.has(best.resultId)) return [];
    const key = recordKey(best);
    const oldExercise = oldExercises.get(best.exerciseId);
    const exercise = exercises.get(best.exerciseId);
    // Editing/replacing a filled slot or converting existing results is not a new swim.
    if (oldExercise?.results.length && (oldExercise.resultMode !== exercise.resultMode
      || recordKey(oldExercise) !== key || oldExercise.results.some(result => result.round === best.round))) return [];
    const prior = previous.get(key);
    if (prior && best.timeCs >= prior.timeCs) return [];
    return [{ ...best, kind: prior ? 'record' : 'first', previousTimeCs: prior?.timeCs ?? null,
      improvementCs: prior ? prior.timeCs - best.timeCs : null }];
  });
}

export function achievementHistory(workouts, key, today = dateKey()) {
  const selected = statisticsWorkouts(workouts, 'all', today);
  // paceSeries preserves the same within-day order used by personalBests.
  const results = paceSeries(selected, key).filter(result =>
    Number.isSafeInteger(result.timeCs) && result.timeCs > 0 && result.timeCs <= 60480000);
  const events = [];
  let best = null;
  for (const result of results) {
    if (!best || result.timeCs < best.timeCs) {
      events.push({ ...result, improvementCs: best ? best.timeCs - result.timeCs : null });
      best = result;
    }
  }
  const first = results[0] ?? null;
  return { first, best, improvementCs: first ? first.timeCs - best.timeCs : null,
    events: events.reverse(), daily: dailyPaceSeries(selected, key) };
}
