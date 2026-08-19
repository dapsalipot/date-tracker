/** The Monday that starts the week containing `day`, as `YYYY-MM-DD`. */
function weekStart(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const t = Date.UTC(y, m - 1, d);
  const dow = new Date(t).getUTCDay(); // 0 = Sunday
  // Monday-anchored: Sunday is 6 days into its week, not 0.
  const backToMonday = (dow + 6) % 7;
  return new Date(t - backToMonday * 86_400_000).toISOString().slice(0, 10);
}

/** One week earlier than `weekStartDay`, as `YYYY-MM-DD`. */
function weekBefore(weekStartDay: string): string {
  const [y, m, d] = weekStartDay.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) - 7 * 86_400_000).toISOString().slice(0, 10);
}

export interface WeekStreak {
  readonly current: number;
  readonly longest: number;
  readonly endedLastWeek: boolean;
}

/**
 * How many consecutive Monday–Sunday weeks contain at least one date, ending
 * at (or, if this week is still empty, at last week).
 */
export function weekStreak(days: readonly string[], todayLocal: string): WeekStreak {
  const weeks = new Set(days.map(weekStart));
  if (weeks.size === 0) {
    return { current: 0, longest: 0, endedLastWeek: false };
  }

  const sorted = [...weeks].sort().reverse();

  let longest = 0;
  let run = 0;
  let prev: string | undefined;
  for (const week of sorted) {
    run = prev !== undefined && weekBefore(prev) === week ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = week;
  }

  const thisWeek = weekStart(todayLocal);
  const startWeek = weeks.has(thisWeek) ? thisWeek : weekBefore(thisWeek);

  let current = 0;
  let cursor = startWeek;
  while (weeks.has(cursor)) {
    current += 1;
    cursor = weekBefore(cursor);
  }

  const endedLastWeek = current > 0 && !weeks.has(thisWeek);

  return { current, longest, endedLastWeek };
}
