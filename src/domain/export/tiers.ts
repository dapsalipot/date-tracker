import { and, asc, eq, gte, isNull } from 'drizzle-orm';
import { dates, stops } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { CoupleScope } from '@/domain/scope';
import { currencySymbol } from '@/domain/money/money';

export type Tier = 1 | 2 | 3;

export interface KindThresholds {
  readonly lower: number;
  readonly upper: number;
}

export type TierTable = ReadonlyMap<string, KindThresholds>;

/**
 * Below this many stops in the window, a kind has no tier at all and its lines
 * render with no monetary content (spec §7.5). Three tiers derived from five
 * points is arithmetic dressed up as insight.
 */
const MIN_SAMPLE = 6;

/** ISO date twelve months before `todayLocal`, computed on the string. */
function twelveMonthsBefore(todayLocal: string): string {
  const [year, month, day] = todayLocal.split('-');
  return `${Number(year) - 1}-${month}-${day}`;
}

/**
 * Thresholds are recomputed on every export and never stored. A shared image is
 * a snapshot of one moment; the app makes no promise that today's ₱₱ is still
 * ₱₱ after another year of dates.
 *
 * The retrieval is SQL. Only the tercile boundary *selection* happens here —
 * that is indexing into a sorted sample, not an aggregation reimplemented in
 * JavaScript.
 */
export function buildTierTable(
  db: AppDatabase,
  scope: CoupleScope,
  todayLocal: string,
): TierTable {
  const rows = db
    .select({ kind: stops.kind, amountMinor: stops.amountMinor })
    .from(stops)
    .innerJoin(dates, and(eq(dates.id, stops.dateId), isNull(dates.deletedAt)))
    .where(
      and(
        eq(dates.coupleId, scope.coupleId),
        gte(dates.occurredOn, twelveMonthsBefore(todayLocal)),
        eq(stops.currencyCode, scope.currencyCode),
        isNull(stops.deletedAt),
      ),
    )
    .orderBy(asc(stops.kind), asc(stops.amountMinor))
    .all();

  const byKind = new Map<string, number[]>();
  for (const row of rows) {
    const bucket = byKind.get(row.kind);
    if (bucket === undefined) byKind.set(row.kind, [row.amountMinor]);
    else bucket.push(row.amountMinor);
  }

  const table = new Map<string, KindThresholds>();
  for (const [kind, amounts] of byKind) {
    if (amounts.length < MIN_SAMPLE) continue;
    // Already ascending: the query orders by kind then amount.
    const lower = amounts[Math.floor(amounts.length / 3)];
    const upper = amounts[Math.floor((amounts.length * 2) / 3)];
    if (lower === undefined || upper === undefined) continue;
    table.set(kind, { lower, upper });
  }

  return table;
}

/** `null` means this kind has too little history to tier — render nothing. */
export function tierFor(table: TierTable, kind: string, amountMinor: number): Tier | null {
  const thresholds = table.get(kind);
  if (thresholds === undefined) return null;
  if (amountMinor <= thresholds.lower) return 1;
  if (amountMinor <= thresholds.upper) return 2;
  return 3;
}

export function tierSymbol(tier: Tier, currencyCode: string): string {
  return currencySymbol(currencyCode).trim().repeat(tier);
}
