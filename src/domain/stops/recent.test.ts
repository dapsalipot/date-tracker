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

  it('puts the most recently used kind first', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    const base = { coupleId: ctx.coupleId, userId: ctx.userId, amountMinor: 1, currencyCode: 'PHP' } as const;

    captureStop(db, DEPS, { ...base, kind: 'gift' });
    captureStop(db, DEPS, { ...base, kind: 'transport' });

    expect(kindsByRecentUse(db, ctx.coupleId)[0]).toBe('transport');
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
