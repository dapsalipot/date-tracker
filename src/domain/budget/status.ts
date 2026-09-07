import { and, desc, eq, isNull, lte, sql } from 'drizzle-orm';
import { budgets, dates, stops } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { Deps } from '@/domain/deps';
import type { CoupleScope } from '@/domain/scope';
import { monthScope } from '@/domain/analytics/scope';
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
 * Subscription target for `useLiveQuery`, not a read — nothing consumes the
 * rows. The dashboard's other numbers all move when a date changes, so they
 * ride the published-dates subscription; a budget is written from Settings
 * with no date involved, and without this the bar kept saying "no budget set"
 * until the next capture happened to re-run the memo.
 */
export function budgetsQuery(db: AppDatabase, scope: CoupleScope) {
  return db.select().from(budgets).where(eq(budgets.coupleId, scope.coupleId));
}

/**
 * Budget status for an arbitrary month. `todayLocal` is still needed because
 * `daysLeft` is only meaningful for the month containing today; for any other
 * month `daysRemainingIn` correctly returns 0.
 *
 * Spend is attributed to the month of the parent date's `occurred_on`, not the
 * stop's own timestamp, so a date running past midnight counts entirely in one
 * month and "this date cost X" agrees between the receipt and the dashboard.
 */
export function budgetStatusFor(
  db: AppDatabase,
  scope: CoupleScope,
  periodMonth: string,
  todayLocal: string,
): BudgetStatus {
  const spentRows = db
    .select({ total: sql<number>`coalesce(sum(${stops.amountMinor}), 0)` })
    .from(stops)
    .innerJoin(dates, eq(stops.dateId, dates.id))
    // Section 1 of the dashboard shares the analytics scoping rather than
    // hand-writing it a fourth time. Every hand-written copy on this project
    // has turned out unguarded.
    .where(monthScope(scope, periodMonth))
    .all();

  const spentMinor = Number(spentRows[0]?.total ?? 0);

  // Carry-forward: the newest budget set in this month or any earlier one.
  // `lte` + newest-first + limit 1 means an explicit row for `periodMonth`
  // still wins (it sorts first), while a month with no row of its own
  // inherits rather than reading null. Without it a budget silently expires
  // at midnight on the 1st and the dashboard bar disappears — periodMonth is
  // a per-month row and nothing writes next month's.
  //
  // Deliberately one-directional. `lte`, not a nearest-match: stepping back
  // through months must not invent a budget for a month before the couple
  // started budgeting.
  const budgetRows = db
    .select()
    .from(budgets)
    .where(
      and(
        eq(budgets.coupleId, scope.coupleId),
        lte(budgets.periodMonth, periodMonth),
        isNull(budgets.deletedAt),
      ),
    )
    .orderBy(desc(budgets.periodMonth))
    .limit(1)
    .all();

  const budgetMinor = budgetRows[0]?.amountMinor ?? null;
  const remainingMinor = budgetMinor === null ? null : budgetMinor - spentMinor;

  return {
    periodMonth,
    budgetMinor,
    spentMinor,
    remainingMinor,
    isOverBudget: remainingMinor !== null && remainingMinor < 0,
    daysLeft: daysRemainingIn(periodMonth, todayLocal),
  };
}

export function computeBudgetStatus(db: AppDatabase, scope: CoupleScope, deps: Deps): BudgetStatus {
  const today = deps.clock.todayLocal();
  return budgetStatusFor(db, scope, periodMonthFor(today), today);
}
