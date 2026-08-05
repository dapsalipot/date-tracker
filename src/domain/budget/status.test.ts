import { describe, expect, it } from 'vitest';
import { createTestDb, testDeps } from '@/test/testDb';
import { eq } from 'drizzle-orm';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { stops } from '@/db/schema';
import { computeBudgetStatus, setBudget } from './status';

const AUG_30 = testDeps(1_787_000_000_000, '2026-08-30', 'aug30');
const SEP_1 = testDeps(1_787_300_000_000, '2026-09-01', 'sep1');

function setup() {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, AUG_30);
  return { db, ...ctx };
}

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
});
