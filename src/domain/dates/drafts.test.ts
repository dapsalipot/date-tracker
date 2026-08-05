import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, testDeps } from '@/test/testDb';
import { dates } from '@/db/schema';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { listDraftDates } from './drafts';

const AUG_3 = testDeps(1_785_000_000_000, '2026-08-03');
const AUG_4 = testDeps(1_785_090_000_000, '2026-08-04');

function setup() {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, AUG_3);
  return { db, scope: { coupleId: ctx.coupleId, currencyCode: ctx.currencyCode }, ctx };
}

describe('listDraftDates', () => {
  it('returns only drafts', () => {
    const { db, scope, ctx } = setup();
    const base = { coupleId: ctx.coupleId, userId: ctx.userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP' } as const;

    const draft = captureStop(db, AUG_3, base);
    const published = captureStop(db, AUG_4, base);
    db.update(dates).set({ status: 'published' }).where(eq(dates.id, published.dateId)).run();

    const drafts = listDraftDates(db, scope);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.id).toBe(draft.dateId);
  });

  it('excludes tombstoned drafts', () => {
    const { db, scope, ctx } = setup();
    const captured = captureStop(db, AUG_3, {
      coupleId: ctx.coupleId, userId: ctx.userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP',
    });
    db.update(dates).set({ deletedAt: 1 }).where(eq(dates.id, captured.dateId)).run();

    expect(listDraftDates(db, scope)).toHaveLength(0);
  });

  it('orders drafts oldest first, so the most neglected is nudged hardest', () => {
    const { db, scope, ctx } = setup();
    const base = { coupleId: ctx.coupleId, userId: ctx.userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP' } as const;

    const older = captureStop(db, AUG_3, base);
    captureStop(db, AUG_4, base);

    expect(listDraftDates(db, scope)[0]?.id).toBe(older.dateId);
  });
});
