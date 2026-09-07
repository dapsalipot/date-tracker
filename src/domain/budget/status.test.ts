import { describe, expect, it } from 'vitest';
import { createTestDb, testDeps } from '@/test/testDb';
import { eq } from 'drizzle-orm';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { budgets, couples, dates, stops } from '@/db/schema';
import { budgetStatusFor, computeBudgetStatus, setBudget } from './status';

const AUG_30 = testDeps(1_787_000_000_000, '2026-08-30', 'aug30');
const SEP_1 = testDeps(1_787_300_000_000, '2026-09-01', 'sep1');

function setup() {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, AUG_30);
  return { db, ...ctx };
}

describe('budget scoping', () => {
  it('drops a tombstoned date from the month total', () => {
    const { db, coupleId, userId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };
    const kept = captureStop(db, AUG_30, {
      coupleId, userId, kind: 'food', amountMinor: 30000, currencyCode: 'PHP',
    });
    const dead = captureStop(db, testDeps(1_786_900_000_000, '2026-08-29', 'dead'), {
      coupleId, userId, kind: 'food', amountMinor: 70000, currencyCode: 'PHP',
    });
    db.update(dates).set({ deletedAt: 1 }).where(eq(dates.id, dead.dateId)).run();

    // Section 1 of the dashboard sits 40pt above section 2. If they disagree
    // about the same month because one of them missed a tombstone, the screen
    // contradicts itself and nothing in the suite notices.
    expect(budgetStatusFor(db, scope, '2026-08', '2026-08-30').spentMinor).toBe(30000);
    expect(kept.dateId).toBeDefined();
  });

  it("ignores another couple's spending", () => {
    const { db, coupleId, userId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };
    captureStop(db, AUG_30, {
      coupleId, userId, kind: 'food', amountMinor: 30000, currencyCode: 'PHP',
    });
    db.insert(couples).values({
      id: 'them', currencyCode: 'PHP', timezone: 'Asia/Manila', createdAt: 1, updatedAt: 1,
    }).run();
    db.insert(dates).values({
      id: 'their-date', coupleId: 'them', occurredOn: '2026-08-10', status: 'published',
      createdBy: userId, updatedAt: 1,
    }).run();
    db.insert(stops).values({
      id: 'their-stop', dateId: 'their-date', sortOrder: 0, kind: 'food',
      amountMinor: 500000, currencyCode: 'PHP', updatedAt: 1,
    }).run();

    expect(budgetStatusFor(db, scope, '2026-08', '2026-08-30').spentMinor).toBe(30000);
  });
});

describe('computeBudgetStatus', () => {
  it('reports null budget when none is set', () => {
    const { db, coupleId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };

    const status = computeBudgetStatus(db, scope, AUG_30);

    expect(status.budgetMinor).toBeNull();
    expect(status.remainingMinor).toBeNull();
    expect(status.isOverBudget).toBe(false);
    expect(status.spentMinor).toBe(0);
  });

  it('subtracts this month\'s spend from the budget', () => {
    const { db, coupleId, userId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };
    setBudget(db, coupleId, '2026-08', 800000, AUG_30);

    captureStop(db, AUG_30, { coupleId, userId, kind: 'food', amountMinor: 234000, currencyCode: 'PHP' });

    const status = computeBudgetStatus(db, scope, AUG_30);

    expect(status.spentMinor).toBe(234000);
    expect(status.remainingMinor).toBe(566000);
    expect(status.isOverBudget).toBe(false);
    expect(status.daysLeft).toBe(2);
  });

  it('goes negative when over budget rather than clamping', () => {
    const { db, coupleId, userId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };
    setBudget(db, coupleId, '2026-08', 100000, AUG_30);

    captureStop(db, AUG_30, { coupleId, userId, kind: 'food', amountMinor: 150000, currencyCode: 'PHP' });

    const status = computeBudgetStatus(db, scope, AUG_30);

    expect(status.remainingMinor).toBe(-50000);
    expect(status.isOverBudget).toBe(true);
  });

  it('excludes spend from other months', () => {
    const { db, coupleId, userId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };
    setBudget(db, coupleId, '2026-09', 800000, SEP_1);

    captureStop(db, AUG_30, { coupleId, userId, kind: 'food', amountMinor: 234000, currencyCode: 'PHP' });
    captureStop(db, SEP_1, { coupleId, userId, kind: 'food', amountMinor: 50000, currencyCode: 'PHP' });

    const status = computeBudgetStatus(db, scope, SEP_1);

    expect(status.periodMonth).toBe('2026-09');
    expect(status.spentMinor).toBe(50000);
  });

  it("attributes spend by the date's occurred_on, not the stop's own timestamp", () => {
    const { db, coupleId, userId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };
    setBudget(db, coupleId, '2026-08', 800000, AUG_30);

    const captured = captureStop(db, AUG_30, {
      coupleId, userId, kind: 'food', amountMinor: 234000, currencyCode: 'PHP',
    });

    // Push the stop's own timestamp into a different month. A date running past
    // midnight must still count entirely in its date's month, so this must not
    // change the August total. If the query ever joined on stops.occurred_at
    // instead, spentMinor would drop to 0 here.
    db.update(stops)
      .set({ occurredAt: Date.parse('2026-09-15T03:00:00Z') })
      .where(eq(stops.id, captured.stopId))
      .run();

    expect(computeBudgetStatus(db, scope, AUG_30).spentMinor).toBe(234000);
  });

  it('overwrites an existing budget for the same period', () => {
    const { db, coupleId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };

    setBudget(db, coupleId, '2026-08', 800000, AUG_30);
    setBudget(db, coupleId, '2026-08', 500000, AUG_30);

    expect(computeBudgetStatus(db, scope, AUG_30).budgetMinor).toBe(500000);
  });

  it('excludes spend in other currencies', () => {
    const { db, coupleId, userId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };
    setBudget(db, coupleId, '2026-08', 800000, AUG_30);

    captureStop(db, AUG_30, { coupleId, userId, kind: 'food', amountMinor: 234000, currencyCode: 'PHP' });
    captureStop(db, AUG_30, { coupleId, userId, kind: 'food', amountMinor: 500000, currencyCode: 'JPY' });

    expect(computeBudgetStatus(db, scope, AUG_30).spentMinor).toBe(234000);
  });

  it('reports a month other than the current one', () => {
    const { db, coupleId, userId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };
    // Spend in July while "today" is in August.
    captureStop(db, testDeps(Date.parse('2026-07-10T12:00:00Z'), '2026-07-10', 'jul'), {
      coupleId, userId,
      kind: 'food', amountMinor: 30000, currencyCode: 'PHP',
    });

    const july = budgetStatusFor(db, scope, '2026-07', '2026-08-14');

    expect(july.periodMonth).toBe('2026-07');
    expect(july.spentMinor).toBe(30000);
    // daysLeft is only meaningful for the month containing today.
    expect(july.daysLeft).toBe(0);
  });

  it('does not count another month\'s spend', () => {
    const { db, coupleId, userId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };
    captureStop(db, testDeps(Date.parse('2026-07-10T12:00:00Z'), '2026-07-10', 'jul'), {
      coupleId, userId,
      kind: 'food', amountMinor: 30000, currencyCode: 'PHP',
    });

    expect(budgetStatusFor(db, scope, '2026-08', '2026-08-14').spentMinor).toBe(0);
  });
});

describe('budget carry-forward', () => {
  it('carries the last set budget into a month with none of its own', () => {
    const { db, coupleId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };
    setBudget(db, coupleId, '2026-08', 800000, AUG_30);

    // Without this, the dashboard's budget bar and the capture sheet's
    // "left" line both go blank at midnight on the 1st, and nothing in the
    // app can bring them back — setBudget has no UI caller.
    expect(budgetStatusFor(db, scope, '2026-09', '2026-09-01').budgetMinor).toBe(800000);
  });

  it('prefers a budget set for the month itself over an earlier one', () => {
    const { db, coupleId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };
    setBudget(db, coupleId, '2026-08', 800000, AUG_30);
    setBudget(db, coupleId, '2026-09', 500000, SEP_1);

    expect(budgetStatusFor(db, scope, '2026-09', '2026-09-01').budgetMinor).toBe(500000);
  });

  it('does not carry a budget backwards into an earlier month', () => {
    const { db, coupleId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };
    setBudget(db, coupleId, '2026-08', 800000, AUG_30);

    // Stepping back through months on the dashboard must not invent a budget
    // for a month the couple was not budgeting in.
    expect(budgetStatusFor(db, scope, '2026-07', '2026-08-30').budgetMinor).toBeNull();
  });

  it('never carries a tombstoned budget', () => {
    const { db, coupleId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };
    setBudget(db, coupleId, '2026-08', 800000, AUG_30);
    db.update(budgets).set({ deletedAt: 1 }).where(eq(budgets.coupleId, coupleId)).run();

    expect(budgetStatusFor(db, scope, '2026-09', '2026-09-01').budgetMinor).toBeNull();
  });

  it("never carries another couple's budget", () => {
    const { db, coupleId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };
    const otherCouple = 'couple-other';
    db.insert(couples)
      .values({ id: otherCouple, currencyCode: 'PHP', timezone: 'Asia/Manila', createdAt: 1, updatedAt: 1 })
      .run();
    setBudget(db, otherCouple, '2026-08', 800000, AUG_30);

    expect(budgetStatusFor(db, scope, '2026-09', '2026-09-01').budgetMinor).toBeNull();
  });
});
