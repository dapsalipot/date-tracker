import { and, eq, isNull, sql } from 'drizzle-orm';
import { budgets, dates, stops } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { Deps } from '@/domain/deps';
import { daysRemainingIn, periodMonthFor } from './period';

export interface BudgetStatus {
  periodMonth: string;
  budgetMinor: number | null;
  spentMinor: number;
  remainingMinor: number | null;
  isOverBudget: boolean;
  daysLeft: number;
}

export function setBudget(
  db: AppDatabase,
  coupleId: string,
  periodMonth: string,
  amountMinor: number,
  deps: Deps,
): void {
  const now = deps.clock.nowMs();

  db.transaction((tx) => {
    const existing = tx
      .select()
      .from(budgets)
      .where(and(eq(budgets.coupleId, coupleId), eq(budgets.periodMonth, periodMonth)))
      .all();

    if (existing.length > 0) {
      tx.update(budgets)
        .set({ amountMinor, updatedAt: now, deletedAt: null })
        .where(and(eq(budgets.coupleId, coupleId), eq(budgets.periodMonth, periodMonth)))
        .run();
      return;
    }

    tx.insert(budgets)
      .values({ id: deps.newId(), coupleId, periodMonth, amountMinor, updatedAt: now })
      .run();
  });
}

/**
 * Spend is attributed to the month of the parent date's `occurred_on`, not the
 * stop's own timestamp, so a date running past midnight counts entirely in one
 * month and "this date cost X" agrees between the receipt and the dashboard.
 */
export function computeBudgetStatus(
  db: AppDatabase,
  coupleId: string,
  deps: Deps,
): BudgetStatus {
  const today = deps.clock.todayLocal();
  const periodMonth = periodMonthFor(today);

  const spentRows = db
    .select({ total: sql<number>`coalesce(sum(${stops.amountMinor}), 0)` })
    .from(stops)
    .innerJoin(dates, eq(stops.dateId, dates.id))
    .where(
      and(
        eq(dates.coupleId, coupleId),
        isNull(dates.deletedAt),
        isNull(stops.deletedAt),
        sql`substr(${dates.occurredOn}, 1, 7) = ${periodMonth}`,
      ),
    )
    .all();

  const spentMinor = Number(spentRows[0]?.total ?? 0);

  const budgetRows = db
    .select()
    .from(budgets)
    .where(
      and(
        eq(budgets.coupleId, coupleId),
        eq(budgets.periodMonth, periodMonth),
        isNull(budgets.deletedAt),
      ),
    )
    .all();

  const budgetMinor = budgetRows[0]?.amountMinor ?? null;
  const remainingMinor = budgetMinor === null ? null : budgetMinor - spentMinor;

  return {
    periodMonth,
    budgetMinor,
    spentMinor,
    remainingMinor,
    isOverBudget: remainingMinor !== null && remainingMinor < 0,
    daysLeft: daysRemainingIn(periodMonth, today),
  };
}
