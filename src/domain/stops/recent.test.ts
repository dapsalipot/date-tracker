import { describe, expect, it } from 'vitest';
import { createTestDb, testDeps } from '@/test/testDb';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { STOP_KINDS } from './taxonomy';
import { kindsByRecentUse } from './recent';

const DEPS = testDeps(1_785_000_000_000, '2026-08-03');

describe('kindsByRecentUse', () => {
  it('returns every kind even with no history', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);

    expect(kindsByRecentUse(db, ctx.coupleId).sort()).toEqual([...STOP_KINDS].sort());
  });

  it('orders by updated_at, not by insertion order', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    const base = { coupleId: ctx.coupleId, userId: ctx.userId, amountMinor: 1, currencyCode: 'PHP' } as const;

    // Two clocks, deliberately. `fixedClock` returns one constant nowMs, so
    // capturing both stops with the same deps writes an identical updated_at —
    // the ORDER BY would be a tie and SQLite's unspecified tie-break would pick
    // the winner, letting the assertion pass without proving anything.
    const LATER = testDeps(1_785_000_900_000, '2026-08-03', 'late');
    const EARLIER = testDeps(1_785_000_000_000, '2026-08-03', 'early');

    captureStop(db, LATER, { ...base, kind: 'gift' });        // inserted first, newer stamp
    captureStop(db, EARLIER, { ...base, kind: 'transport' }); // inserted last, older stamp

    // Recency and insertion order now point at different kinds, so only
    // ORDER BY max(updated_at) DESC can return 'gift'.
    expect(kindsByRecentUse(db, ctx.coupleId)[0]).toBe('gift');
  });

  it('never drops or duplicates a kind', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    captureStop(db, DEPS, {
      coupleId: ctx.coupleId, userId: ctx.userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP',
    });

    const result = kindsByRecentUse(db, ctx.coupleId);
    expect(result).toHaveLength(STOP_KINDS.length);
    expect(new Set(result).size).toBe(STOP_KINDS.length);
  });
});
