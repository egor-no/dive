import { dateKey, personalBests, recordKey } from './domain.js';
import { statisticsWorkouts } from './statistics.js';

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
