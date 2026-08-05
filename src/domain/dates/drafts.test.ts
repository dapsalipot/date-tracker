import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, testDeps } from '@/test/testDb';
import { dates, photos } from '@/db/schema';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { attachPhoto } from '@/domain/photos/repository';
import { listDraftDates, publishedDatesQuery } from './drafts';

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

describe('publishedDatesQuery cover photo', () => {
  it('carries the cover photo uri onto the feed card', () => {
    const { db, ctx } = setup();
    const captured = captureStop(db, AUG_3, {
      coupleId: ctx.coupleId, userId: ctx.userId,
      kind: 'food', amountMinor: 42000, currencyCode: 'PHP',
    });
    const photoId = attachPhoto(db, AUG_3, {
      dateId: captured.dateId, localUri: 'file:///cover.jpg', width: 4, height: 3,
    });
    db.update(dates).set({ coverPhotoId: photoId, title: 'Tagaytay', status: 'published' })
      .where(eq(dates.id, captured.dateId)).run();

    const feed = publishedDatesQuery(db, ctx).all();

    expect(feed).toHaveLength(1);
    expect(feed[0]?.coverUri).toBe('file:///cover.jpg');
  });

  it('reports no cover for a date that has none', () => {
    const { db, ctx } = setup();
    const captured = captureStop(db, AUG_3, {
      coupleId: ctx.coupleId, userId: ctx.userId,
      kind: 'food', amountMinor: 42000, currencyCode: 'PHP',
    });
    db.update(dates).set({ title: 'No cover', status: 'published' })
      .where(eq(dates.id, captured.dateId)).run();

    const feed = publishedDatesQuery(db, ctx).all();

    // The date must still appear. A card with no photo is normal, not a
    // filtered-out row.
    expect(feed).toHaveLength(1);
    expect(feed[0]?.coverUri).toBeNull();
  });

  it('reports no cover when the cover photo has been tombstoned', () => {
    const { db, ctx } = setup();
    const captured = captureStop(db, AUG_3, {
      coupleId: ctx.coupleId, userId: ctx.userId,
      kind: 'food', amountMinor: 42000, currencyCode: 'PHP',
    });
    const photoId = attachPhoto(db, AUG_3, {
      dateId: captured.dateId, localUri: 'file:///cover.jpg', width: 4, height: 3,
    });
    db.update(dates).set({ coverPhotoId: photoId, title: 'Tagaytay', status: 'published' })
      .where(eq(dates.id, captured.dateId)).run();
    db.update(photos).set({ deletedAt: 1_785_000_000_000 }).where(eq(photos.id, photoId)).run();

    const feed = publishedDatesQuery(db, ctx).all();

    expect(feed).toHaveLength(1);
    expect(feed[0]?.coverUri).toBeNull();
  });

  it('does not let the cover join inflate the stop count or total', () => {
    const { db, ctx } = setup();
    const captured = captureStop(db, AUG_3, {
      coupleId: ctx.coupleId, userId: ctx.userId,
      kind: 'food', amountMinor: 42000, currencyCode: 'PHP',
    });
    // A second, non-cover photo on the same date. Dates accumulate photos as
    // captures happen, so a date with one cover photo set almost always has
    // others lying around too. If the join matched on dateId instead of the
    // photo's own id, this second photo would multiply the stop rows.
    captureStop(db, AUG_3, {
      coupleId: ctx.coupleId, userId: ctx.userId,
      kind: 'transport', amountMinor: 8000, currencyCode: 'PHP',
      photo: { localUri: 'file:///candid.jpg', width: 4, height: 3 },
    });
    const photoId = attachPhoto(db, AUG_3, {
      dateId: captured.dateId, localUri: 'file:///cover.jpg', width: 4, height: 3,
    });
    db.update(dates).set({ coverPhotoId: photoId, title: 'Tagaytay', status: 'published' })
      .where(eq(dates.id, captured.dateId)).run();

    const feed = publishedDatesQuery(db, ctx).all();

    expect(feed[0]?.stopCount).toBe(2);
    expect(feed[0]?.totalMinor).toBe(50000);
  });
});
