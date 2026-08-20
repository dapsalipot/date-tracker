import { asc } from 'drizzle-orm';
import { dates } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import { feedDateSelection, toFeedDate, type FeedDate } from '@/domain/dates/repository';
import type { CoupleScope } from '@/domain/scope';

export interface Milestone {
  kind: 'first' | 'nth' | 'priciest' | 'longest';
  label: string;
  date: FeedDate;
}

const NTH_INTERVAL = 10;

/**
 * The item with the highest value, earliest-day wins on a tie. `items` must
 * already be sorted ascending by day: scanning left to right and only
 * replacing the best on a STRICT improvement keeps the first (earliest) of
 * any tied max, so the winner is stable rather than dependent on whatever
 * order SQLite happens to return rows in.
 */
function firstMax<T>(items: readonly T[], value: (item: T) => number): T | undefined {
  let best: T | undefined;
  let bestValue = -Infinity;
  for (const item of items) {
    const v = value(item);
    if (v > bestValue) {
      best = item;
      bestValue = v;
    }
  }
  return best;
}

/**
 * The couple's headline dates: their first, every tenth, the priciest night,
 * and the longest one. Built on `feedDateSelection` — see its docstring for
 * why this must never fork the query — so couple scoping, tombstones, and the
 * currency predicate on the stops join all come along unchanged.
 *
 * One fetch, ordered chronologically by `occurredOn`, drives all four
 * milestones. A milestone that hasn't been reached (fewer than ten dates, no
 * dates at all) is simply left out of the array rather than included empty,
 * so the screen never renders a locked-achievement slot.
 */
export function milestones(db: AppDatabase, scope: CoupleScope): Milestone[] {
  const byDay = feedDateSelection(db, scope, 'published')
    .orderBy(asc(dates.occurredOn), asc(dates.id))
    .all()
    .map((row) => toFeedDate(row, scope.currencyCode));

  const result: Milestone[] = [];

  const first = byDay[0];
  if (first) result.push({ kind: 'first', label: 'First date', date: first });

  // Highest reached multiple of ten, by position in day order — not by
  // insertion order, which the fixtures can (and do) disagree with.
  const reached = Math.floor(byDay.length / NTH_INTERVAL) * NTH_INTERVAL;
  const nth = reached > 0 ? byDay[reached - 1] : undefined;
  if (nth) result.push({ kind: 'nth', label: `${reached}th date`, date: nth });

  // totalMinor is already scoped to scope.currencyCode by feedDateSelection's
  // join ON clause, so comparing it directly here never mixes currencies.
  const priciest = firstMax(byDay, (d) => d.totalMinor);
  if (priciest) result.push({ kind: 'priciest', label: 'Most expensive night', date: priciest });

  const longest = firstMax(byDay, (d) => d.stopCount);
  if (longest) result.push({ kind: 'longest', label: 'Longest date', date: longest });

  return result;
}
