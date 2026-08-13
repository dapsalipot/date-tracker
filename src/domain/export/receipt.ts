import { and, eq, isNull } from 'drizzle-orm';
import { stops, users } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { CoupleScope } from '@/domain/scope';
import { loadDateDetail } from '@/domain/dates/compose';
import { listStopsForDate } from '@/domain/stops/edit';
import { formatMoney, money } from '@/domain/money/money';
import { buildTierTable, tierFor, tierSymbol } from './tiers';

export type MoneyMode = 'exact' | 'tier' | 'hidden';

export interface ReceiptLine {
  readonly label: string;
  readonly detail: string | null;
  readonly money: string | null;
}

export interface ReceiptPerson {
  readonly name: string;
  readonly money: string | null;
}

export interface ReceiptViewModel {
  readonly title: string;
  readonly occurredOn: string;
  readonly lines: readonly ReceiptLine[];
  readonly people: readonly ReceiptPerson[];
  readonly total: string | null;
  readonly rating: number | null;
  readonly stopCount: number;
  readonly moneyMode: MoneyMode;
}

/**
 * Produces every string the receipt shows, so the export's CONTENT is asserted
 * in plain unit tests with no renderer involved (spec §11). A template must
 * never compute a string this function did not give it — the moment it does,
 * that string is only checkable by looking at pixels.
 *
 * Returns null when the date does not exist or has been tombstoned.
 */
export function buildReceiptViewModel(
  db: AppDatabase,
  scope: CoupleScope,
  dateId: string,
  moneyMode: MoneyMode,
  todayLocal: string,
): ReceiptViewModel | null {
  const detail = loadDateDetail(db, dateId);
  if (detail === null) return null;

  const rows = listStopsForDate(db, dateId).filter(
    (stop) => stop.currencyCode === scope.currencyCode,
  );

  const tiers = moneyMode === 'tier' ? buildTierTable(db, scope, todayLocal) : null;

  const lineMoney = (kind: string, amountMinor: number): string | null => {
    if (moneyMode === 'hidden') return null;
    if (moneyMode === 'exact') return formatMoney(money(amountMinor, scope.currencyCode));
    const tier = tierFor(tiers!, kind, amountMinor);
    // A kind below the sample floor falls back to hidden for that line only.
    return tier === null ? null : tierSymbol(tier, scope.currencyCode);
  };

  const detailOf = (placeName: string | null, subkind: string | null): string | null => {
    const parts = [placeName, subkind].filter((part): part is string => part !== null);
    return parts.length === 0 ? null : parts.join(' · ');
  };

  const lines: ReceiptLine[] = rows.map((stop) => ({
    label: stop.label ?? stop.kind,
    detail: detailOf(stop.placeName, stop.subkind),
    money: lineMoney(stop.kind, stop.amountMinor),
  }));

  // Only `exact` shows any total. In tier mode a grand total would let a reader
  // reconstruct exactly what the tier symbols exist to obscure.
  const showTotals = moneyMode === 'exact';
  const totalMinor = rows.reduce((sum, stop) => sum + stop.amountMinor, 0);

  const paid = db
    .select({ userId: stops.paidByUserId, name: users.displayName, amountMinor: stops.amountMinor })
    .from(stops)
    .leftJoin(users, and(eq(users.id, stops.paidByUserId), isNull(users.deletedAt)))
    .where(
      and(
        eq(stops.dateId, dateId),
        isNull(stops.deletedAt),
        eq(stops.currencyCode, scope.currencyCode),
      ),
    )
    .all();

  const byPerson = new Map<string, number>();
  for (const row of paid) {
    const name = row.name ?? 'Someone';
    byPerson.set(name, (byPerson.get(name) ?? 0) + row.amountMinor);
  }

  const people: ReceiptPerson[] = [...byPerson].map(([name, amountMinor]) => ({
    name,
    money: showTotals ? formatMoney(money(amountMinor, scope.currencyCode)) : null,
  }));

  return {
    title: detail.title ?? 'Untitled date',
    occurredOn: detail.occurredOn,
    lines,
    people,
    total: showTotals ? formatMoney(money(totalMinor, scope.currencyCode)) : null,
    rating: detail.rating,
    stopCount: rows.length,
    moneyMode,
  };
}
