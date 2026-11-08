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
