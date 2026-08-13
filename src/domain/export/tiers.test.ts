import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { couples, dates, stops } from '@/db/schema';
import { createTestDb, testDeps } from '@/test/testDb';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { buildTierTable, tierFor, tierSymbol } from './tiers';

const TODAY = '2026-08-14';

function setup() {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, testDeps(1_786_000_000_000, TODAY, 'boot'));
  return { db, scope: { coupleId: ctx.coupleId, currencyCode: ctx.currencyCode }, ctx };
}

/**
 * Each call lands on its own date (a distinct todayLocal) and its own id
 * prefix, so ids cannot collide and captureStop cannot merge them into one
 * open draft.
 */
function capture(db: ReturnType<typeof createTestDb>, ctx: { coupleId: string; userId: string },
                 kind: string, amountMinor: number, dayIso: string, prefix: string) {
  const deps = testDeps(Date.parse(`${dayIso}T12:00:00Z`), dayIso, prefix);
  return captureStop(db, deps, {
    coupleId: ctx.coupleId, userId: ctx.userId,
    kind: kind as 'food', amountMinor, currencyCode: 'PHP',
  });
}

describe('buildTierTable', () => {
  it('has no entry for a kind with fewer than six stops', () => {
    const { db, scope, ctx } = setup();
    for (let i = 0; i < 5; i += 1) {
      capture(db, ctx, 'food', 10000 + i, `2026-07-0${i + 1}`, `f${i}`);
    }

    const table = buildTierTable(db, scope, TODAY);

    // Five is not enough history to say anything honest about a sixth.
    expect(table.has('food')).toBe(false);
    expect(tierFor(table, 'food', 10000)).toBeNull();
  });

  it('produces thresholds once a kind reaches six stops', () => {
    const { db, scope, ctx } = setup();
    for (let i = 0; i < 6; i += 1) {
      capture(db, ctx, 'food', (i + 1) * 10000, `2026-07-0${i + 1}`, `f${i}`);
    }

    const table = buildTierTable(db, scope, TODAY);

    expect(table.has('food')).toBe(true);
    // Sample 10000..60000. Boundaries at index 2 and index 4 of the sorted
    // sample: 30000 and 50000.
    expect(table.get('food')).toEqual({ lower: 30000, upper: 50000 });
  });

  it('scales each kind independently', () => {
    const { db, scope, ctx } = setup();
    // Dinner money and jeepney money are on completely different scales. A
    // single global scale would call every meal expensive and every fare cheap.
    for (let i = 0; i < 6; i += 1) {
      capture(db, ctx, 'food', (i + 1) * 100000, `2026-07-0${i + 1}`, `f${i}`);
      capture(db, ctx, 'transport', (i + 1) * 1000, `2026-06-0${i + 1}`, `t${i}`);
    }

    const table = buildTierTable(db, scope, TODAY);

    expect(tierFor(table, 'food', 600000)).toBe(3);
    expect(tierFor(table, 'transport', 6000)).toBe(3);
    // The same peso amount is the top tier for transport and the bottom for food.
    expect(tierFor(table, 'food', 6000)).toBe(1);
  });

  it('excludes stops older than twelve months', () => {
    const { db, scope, ctx } = setup();
    for (let i = 0; i < 6; i += 1) {
      capture(db, ctx, 'food', 10000, `2024-01-0${i + 1}`, `old${i}`);
    }

    const table = buildTierTable(db, scope, TODAY);

    expect(table.has('food')).toBe(false);
  });

  it('excludes tombstoned stops from the sample', () => {
    const { db, scope, ctx } = setup();
    const captured = [];
    for (let i = 0; i < 6; i += 1) {
      captured.push(capture(db, ctx, 'food', 10000, `2026-07-0${i + 1}`, `f${i}`));
    }
    db.update(stops).set({ deletedAt: 1 }).where(eq(stops.id, captured[0]!.stopId)).run();

    const table = buildTierTable(db, scope, TODAY);

    // Five live stops is below the floor again.
    expect(table.has('food')).toBe(false);
  });

  it('excludes another currency from the sample', () => {
    const { db, scope, ctx } = setup();
    for (let i = 0; i < 6; i += 1) {
      const deps = testDeps(Date.parse(`2026-07-0${i + 1}T12:00:00Z`), `2026-07-0${i + 1}`, `j${i}`);
      captureStop(db, deps, {
        coupleId: ctx.coupleId, userId: ctx.userId,
        kind: 'food', amountMinor: 10000, currencyCode: 'JPY',
      });
    }

    const table = buildTierTable(db, scope, TODAY);

    // ₱100 and ¥10000 are both 10000 minor units. Mixing them is meaningless.
    expect(table.has('food')).toBe(false);
  });

  it("ignores another couple's spending", () => {
    const { db, scope, ctx } = setup();
    // A second couple with plenty of food history. Their amounts must not
    // shape this couple's tiers — a receipt is scoped to one couple's own
    // sense of what expensive means.
    db.insert(couples).values({
      id: 'other-couple', currencyCode: 'PHP', timezone: 'Asia/Manila',
      createdAt: 1, updatedAt: 1,
    }).run();
    for (let i = 0; i < 8; i += 1) {
      const dateId = `other-date-${i}`;
      db.insert(dates).values({
        id: dateId, coupleId: 'other-couple', occurredOn: `2026-07-0${i + 1}`,
        status: 'published', createdBy: ctx.userId, updatedAt: 1,
      }).run();
      db.insert(stops).values({
        id: `other-stop-${i}`, dateId, sortOrder: 0, kind: 'food',
        amountMinor: (i + 1) * 10000, currencyCode: 'PHP', updatedAt: 1,
      }).run();
    }

    const table = buildTierTable(db, scope, TODAY);

    expect(table.has('food')).toBe(false);
  });

  it('excludes stops belonging to a tombstoned date', () => {
    const { db, scope, ctx } = setup();
    const captured = [];
    for (let i = 0; i < 6; i += 1) {
      captured.push(capture(db, ctx, 'food', 10000, `2026-07-0${i + 1}`, `f${i}`));
    }
    // Tombstoning the DATE must remove its stops from the sample too. The
    // stops themselves are still live, so only the join's ON-clause check
    // catches this.
    db.update(dates).set({ deletedAt: 1 }).where(eq(dates.id, captured[0]!.dateId)).run();

    const table = buildTierTable(db, scope, TODAY);

    expect(table.has('food')).toBe(false);
  });
});

describe('tierFor', () => {
  it('puts a value equal to a boundary in the lower tier', () => {
    const table = new Map([['food', { lower: 30000, upper: 50000 }]]);

    expect(tierFor(table, 'food', 29999)).toBe(1);
    expect(tierFor(table, 'food', 30000)).toBe(1);
    expect(tierFor(table, 'food', 30001)).toBe(2);
    expect(tierFor(table, 'food', 50000)).toBe(2);
    expect(tierFor(table, 'food', 50001)).toBe(3);
  });

  it('returns null for a kind with no thresholds', () => {
    expect(tierFor(new Map(), 'gift', 99999)).toBeNull();
  });
});

describe('tierSymbol', () => {
  it('repeats the currency symbol once per tier', () => {
    expect(tierSymbol(1, 'PHP')).toBe('₱');
    expect(tierSymbol(2, 'PHP')).toBe('₱₱');
    expect(tierSymbol(3, 'PHP')).toBe('₱₱₱');
    expect(tierSymbol(3, 'JPY')).toBe('¥¥¥');
  });

  it('keeps a glyphless currency legible', () => {
    // currencySymbol falls back to "GBP " for a currency with no glyph.
    // Trimming before repeating would render tier 3 as "GBPGBPGBP".
    expect(tierSymbol(1, 'GBP')).toBe('GBP');
    expect(tierSymbol(3, 'GBP')).toBe('GBP GBP GBP');
  });
});
