import { dateKey, shiftDate, monthKey, summary, monthlySeries, totalDistance, personalBests, paceSeries, recordKey } from './domain.js';

const weekStart = today => shiftDate(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));

export function statisticsWorkouts(workouts, period = 'all', today = dateKey()) {
  const start = period === 'week' ? weekStart(today) : period === 'month' ? `${today.slice(0, 7)}-01` : '';
  return workouts.filter(workout => workout.date >= start && workout.date <= today);
}

function monthWeekSeries(workouts, today) {
  const first = `${today.slice(0, 7)}-01`;
  const last = shiftDate(`${monthKey(1, today)}-01`, -1);
  const weeks = [];
  for (let monday = weekStart(first); monday <= last; monday = shiftDate(monday, 7)) {
    const key = monday;
    const end = shiftDate(monday, 6);
    const items = workouts.filter(workout => workout.date >= key && workout.date <= end && workout.date <= today);
    const future = key > today;
    weeks.push({ key, end, future, count: future ? null : items.length,
      distance: future ? null : items.reduce((sum, workout) => sum + (totalDistance(workout) ?? 0), 0) });
  }
  return weeks;
}

export function statisticsData(workouts, period = 'all', today = dateKey()) {
  const selected = statisticsWorkouts(workouts, period, today);
  const stats = summary(selected, today);
  const monday = weekStart(today);
  // Only the month bar charts include adjacent-month days in full Monday–Sunday weeks.
  const chartSeries = period === 'week' ? Array.from({ length: 7 }, (_, index) => {
    const key = shiftDate(monday, index);
    const items = selected.filter(workout => workout.date === key);
    const future = key > today;
    return { key, future, count: future ? null : items.length,
      distance: future ? null : items.reduce((sum, workout) => sum + (totalDistance(workout) ?? 0), 0) };
  }) : period === 'month' ? monthWeekSeries(workouts, today) : monthlySeries(workouts, today);
  return { selected, stats: { ...stats, averageDistance: stats.total ? stats.distance / stats.total : 0 },
    chartSeries, records: personalBests(selected) };
}

export function dailyPaceSeries(workouts, key) {
  const days = new Map();
  for (const result of paceSeries(workouts, key)) {
    if (!Number.isSafeInteger(result.timeCs) || result.timeCs <= 0 || result.timeCs > 60480000 || !Number.isFinite(result.pace) || result.pace <= 0) continue;
    if (!days.has(result.date) || result.timeCs < days.get(result.date).timeCs) days.set(result.date, result);
  }
  return [...days.values()];
}

export function createRecordPreview(records, random = Math.random) {
  const keys = [...new Set(records.map(recordKey))];
  // Shuffle disciplines once per visit, so period changes never redraw their priorities.
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  const priorities = new Map(keys.map((key, index) => [key, index]));
  return candidates => {
    const unique = new Map();
    for (const record of candidates) {
      const key = recordKey(record);
      if (!unique.has(key)) unique.set(key, record);
      // New disciplines can fill free slots without displacing the existing selection.
      if (!priorities.has(key)) priorities.set(key, priorities.size);
    }
    const chosen = new Set([...unique.keys()].sort((a, b) => priorities.get(a) - priorities.get(b)).slice(0, 6));
    // Keep the current list order and use fresh results from the selected period.
    return [...unique].filter(([key]) => chosen.has(key)).map(([, record]) => record);
  };
}
