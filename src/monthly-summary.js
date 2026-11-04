import { dateKey, validDate, monthKey, totalDistance, timedResults, recordKey, paceSeries } from './domain.js';

export function monthLastDay(month) {
  if (!validDate(`${month}-01`)) throw new Error('Выберите корректный месяц и год.');
  const [year, number] = month.split('-').map(Number);
  return dateKey(new Date(year, number, 0, 12));
}

export function latestSummaryMonth(today = dateKey()) {
  const month = today.slice(0, 7);
  return today === monthLastDay(month) ? month : monthKey(-1, today);
}

export function isSummaryMonthAvailable(month, today = dateKey()) {
  return validDate(`${month}-01`) && monthLastDay(month) <= today;
}

export function assertSummaryMonthAvailable(month, today = dateKey()) {
  if (!isSummaryMonthAvailable(month, today)) {
    throw new Error('Итоги доступны с последнего календарного дня месяца. Выберите завершённый месяц.');
  }
}

export function summaryAnnouncementMonth(workouts, today = dateKey()) {
  const day = Number(today.slice(8, 10));
  if (day < 1 || day > 7) return null;
  const previousMonth = monthKey(-1, today);
  return workouts.some(workout => workout.date.slice(0, 7) === previousMonth) ? previousMonth : null;
}

export function monthlySummary(workouts, month, today = dateKey()) {
  assertSummaryMonthAvailable(month, today);
  const end = monthLastDay(month);
  const history = workouts.filter(workout => workout.date <= end);
  const selected = history.filter(workout => workout.date.slice(0, 7) === month);
  const distanceOf = entries => entries.reduce((sum, workout) => sum + (totalDistance(workout) ?? 0), 0);
  const distance = distanceOf(selected);
  const previousMonth = monthKey(-1, `${month}-01`);
  const previous = history.filter(workout => workout.date.slice(0, 7) === previousMonth);
  const previousDistance = distanceOf(previous);
  let newRecords = 0;
  const records = [];
  // Reuse the record key and execution order, including every round within a day.
  // Earlier months establish the baseline; later improvements never erase events.
  const keys = new Set(timedResults(selected).map(recordKey));
  for (const key of keys) {
    let bestCs = Infinity;
    let previousBestCs = null;
    let bestResult = null;
    let eventCount = 0;
    for (const result of paceSeries(history, key)) {
      if (!Number.isSafeInteger(result.timeCs) || result.timeCs <= 0 || result.timeCs > 60480000) continue;
      if (result.timeCs < bestCs) {
        bestCs = result.timeCs;
        if (result.date < `${month}-01`) previousBestCs = result.timeCs;
        else {
          newRecords++;
          eventCount++;
          bestResult = result;
        }
      }
    }
    if (bestResult) records.push({ ...bestResult, previousBestCs, eventCount,
      improvementCs: previousBestCs === null ? null : previousBestCs - bestResult.timeCs });
  }
  records.sort((a, b) => a.distance - b.distance || a.style.localeCompare(b.style));
  return {
    month, trainingCount: selected.length, distance,
    averageDistance: selected.length ? distance / selected.length : 0,
    newRecords, records, previousMonth, previousDistance,
    distanceChangePercent: previousDistance > 0 ? (distance - previousDistance) / previousDistance * 100 : null,
  };
}
