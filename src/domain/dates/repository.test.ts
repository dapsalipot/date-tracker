import { describe, expect, it } from 'vitest';
import { eq, isNull } from 'drizzle-orm';
import { createTestDb, testDeps } from '@/test/testDb';
import { dates, photos, stops } from '@/db/schema';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop, listFeedDates } from './repository';
import { attachPhoto } from '@/domain/photos/repository';
import type { AppDatabase } from '@/db/types';

const AUG_3 = testDeps(1_785_000_000_000, '2026-08-03', 'aug3');
const AUG_4 = testDeps(1_785_090_000_000, '2026-08-04', 'aug4');

function setup(): { db: AppDatabase; coupleId: string; userId: string } {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, AUG_3);
  return { db, coupleId: ctx.coupleId, userId: ctx.userId };
}

describe('captureStop', () => {
  it('creates a draft date when none exists for today', () => {
    const { db, coupleId, userId } = setup();

    const result = captureStop(db, AUG_3, {
      coupleId,
      userId,
      kind: 'food',
      amountMinor: 42000,
      currencyCode: 'PHP',
    });

    expect(result.createdDate).toBe(true);

    const rows = db.select().from(dates).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('draft');
    expect(rows[0]?.occurredOn).toBe('2026-08-03');
  });

  it('appends to today\'s existing draft instead of creating another', () => {
    const { db, coupleId, userId } = setup();

    const first = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 42000, currencyCode: 'PHP',
    });
    const second = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'transport', amountMinor: 68000, currencyCode: 'PHP',
    });

    expect(second.createdDate).toBe(false);
    expect(second.dateId).toBe(first.dateId);
    expect(db.select().from(dates).all()).toHaveLength(1);
    expect(db.select().from(stops).all()).toHaveLength(2);
  });

  it('increments sort_order in capture order', () => {
    const { db, coupleId, userId } = setup();

    captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP' });
    captureStop(db, AUG_3, { coupleId, userId, kind: 'transport', amountMinor: 2, currencyCode: 'PHP' });

    const orders = db.select().from(stops).all().map((s) => s.sortOrder).sort();
    expect(orders).toEqual([0, 1]);
  });

  it('starts a new date on a new day', () => {
    const { db, coupleId, userId } = setup();

    captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP' });
    captureStop(db, AUG_4, { coupleId, userId, kind: 'food', amountMinor: 2, currencyCode: 'PHP' });

    expect(db.select().from(dates).all()).toHaveLength(2);
  });

  it('picks the most recently updated draft when today has two', () => {
    const { db, coupleId, userId } = setup();

    // Two drafts for the same day can exist if one was created by a future
    // import path. Capture must never ask the user to disambiguate.
    const older = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP',
    });
    db.insert(dates).values({
      id: 'second-draft', coupleId, occurredOn: '2026-08-03', status: 'draft',
      createdBy: userId, updatedAt: AUG_3.clock.nowMs() + 5_000,
    }).run();

    const result = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'transport', amountMinor: 2, currencyCode: 'PHP',
    });

    expect(result.dateId).toBe('second-draft');
    expect(result.dateId).not.toBe(older.dateId);
  });

  it('orders drafts by updated_at, not by insertion order or id', () => {
    const { db, coupleId, userId } = setup();
    const base = AUG_3.clock.nowMs();

    // The winner ('mmmm') is neither the first nor the last inserted, and has
    // neither the lowest nor the highest id. Only ORDER BY updated_at DESC can
    // select it — every other plausible ordering picks 'aaaa' or 'zzzz'.
    for (const [id, updatedAt] of [
      ['aaaa-draft', base + 1_000],
      ['mmmm-draft', base + 9_000],
      ['zzzz-draft', base + 2_000],
    ] as const) {
      db.insert(dates).values({
        id, coupleId, occurredOn: '2026-08-03', status: 'draft',
        createdBy: userId, updatedAt,
      }).run();
    }

    const result = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP',
    });

    expect(result.dateId).toBe('mmmm-draft');
  });

  it('never reuses a sort_order after a stop is tombstoned', () => {
    const { db, coupleId, userId } = setup();

    const first = captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP' });
    const second = captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 2, currencyCode: 'PHP' });
    captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 3, currencyCode: 'PHP' });

    db.update(stops).set({ deletedAt: 1 }).where(eq(stops.id, second.stopId)).run();

    captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 4, currencyCode: 'PHP' });

    const live = db.select().from(stops).where(isNull(stops.deletedAt)).all();
    const orders = live.map((s) => s.sortOrder).sort((a, b) => a - b);
    expect(orders).toEqual([0, 2, 3]);
    expect(new Set(orders).size).toBe(orders.length);
    expect(first.stopId).not.toBe(second.stopId);
  });

  it('ignores published dates when finding today\'s draft', () => {
    const { db, coupleId, userId } = setup();

    db.insert(dates).values({
      id: 'published', coupleId, occurredOn: '2026-08-03', status: 'published',
      createdBy: userId, updatedAt: AUG_3.clock.nowMs(),
    }).run();

    const result = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP',
    });

    expect(result.createdDate).toBe(true);
    expect(result.dateId).not.toBe('published');
  });

  it('leaves no ghost draft when the stop insert fails', () => {
    const { db, coupleId, userId } = setup();
    let calls = 0;
    const exploding = {
      ...AUG_3,
      newId: () => {
        calls += 1;
        if (calls === 2) throw new Error('boom');
        return `x-${calls}`;
      },
    };

    expect(() =>
      captureStop(db, exploding, { coupleId, userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP' }),
    ).toThrow(/boom/);

    expect(db.select().from(dates).all()).toHaveLength(0);
    expect(db.select().from(stops).all()).toHaveLength(0);
  });

  it('attaches a photo in the same transaction as the stop', () => {
    const { db, coupleId, userId } = setup();

    const result = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 42000, currencyCode: 'PHP',
      photo: { localUri: 'file:///durable/a.jpg', width: 1600, height: 1200 },
    });

    const saved = db.select().from(photos).all();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.localUri).toBe('file:///durable/a.jpg');
    expect(saved[0]?.stopId).toBe(result.stopId);
    expect(saved[0]?.dateId).toBe(result.dateId);
  });

  it('leaves no stop behind when the photo insert fails', () => {
    const { db, coupleId, userId } = setup();
    // Ids are minted in order: date, stop, photo. Exploding on the third means
    // the stop is already inserted when the failure lands — exactly the window
    // that let a retry write a duplicate charge when these were two separate
    // transactions.
    let calls = 0;
    const exploding = {
      ...AUG_3,
      newId: () => {
        calls += 1;
        if (calls === 3) throw new Error('boom');
        return `x-${calls}`;
      },
    };

    expect(() =>
      captureStop(db, exploding, {
        coupleId, userId, kind: 'food', amountMinor: 42000, currencyCode: 'PHP',
        photo: { localUri: 'file:///durable/a.jpg', width: 1, height: 1 },
      }),
    ).toThrow(/boom/);

    expect(db.select().from(stops).all()).toHaveLength(0);
    expect(db.select().from(dates).all()).toHaveLength(0);
    expect(db.select().from(photos).all()).toHaveLength(0);
  });
});

describe('listFeedDates', () => {
  it('returns dates with stop counts and totals, newest first', () => {
    const { db, coupleId, userId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };

    captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 42000, currencyCode: 'PHP' });
    captureStop(db, AUG_3, { coupleId, userId, kind: 'transport', amountMinor: 68000, currencyCode: 'PHP' });
    captureStop(db, AUG_4, { coupleId, userId, kind: 'food', amountMinor: 10000, currencyCode: 'PHP' });

    const feed = listFeedDates(db, scope);

    expect(feed).toHaveLength(2);
    expect(feed[0]?.occurredOn).toBe('2026-08-04');
    expect(feed[1]?.stopCount).toBe(2);
    expect(feed[1]?.totalMinor).toBe(110000);
  });

  it('excludes tombstoned stops from counts and totals', () => {
    const { db, coupleId, userId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };

    captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 42000, currencyCode: 'PHP' });
    const removed = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'transport', amountMinor: 68000, currencyCode: 'PHP',
    });

    db.update(stops).set({ deletedAt: 1 }).where(eq(stops.id, removed.stopId)).run();

    const feed = listFeedDates(db, scope);
    expect(feed[0]?.stopCount).toBe(1);
    expect(feed[0]?.totalMinor).toBe(42000);
  });

  it('keeps a date visible when every one of its stops is tombstoned', () => {
    const { db, coupleId, userId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };

    const only = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 42000, currencyCode: 'PHP',
    });
    db.update(stops).set({ deletedAt: 1 }).where(eq(stops.id, only.stopId)).run();

    // Guards the leftJoin ON-clause: moving isNull(stops.deletedAt) into the
    // WHERE clause would make this date vanish from the feed entirely.
    const feed = listFeedDates(db, scope);
    expect(feed).toHaveLength(1);
    expect(feed[0]?.stopCount).toBe(0);
    expect(feed[0]?.totalMinor).toBe(0);
  });

  it('excludes soft-deleted dates and stops', () => {
    const { db, coupleId, userId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };

    const kept = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 42000, currencyCode: 'PHP',
    });
    const removed = captureStop(db, AUG_4, {
      coupleId, userId, kind: 'food', amountMinor: 99000, currencyCode: 'PHP',
    });

    db.update(dates).set({ deletedAt: 1 }).where(eq(dates.id, removed.dateId)).run();

    const feed = listFeedDates(db, scope);
    expect(feed).toHaveLength(1);
    expect(feed[0]?.id).toBe(kept.dateId);
  });

  it('excludes stops in other currencies from counts and totals', () => {
    const { db, coupleId, userId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };

    captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 10000, currencyCode: 'PHP', placeName: 'Cafe Ysabel',
    });
    captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 10000, currencyCode: 'JPY', placeName: 'Ichiran',
    });
    captureStop(db, AUG_4, {
      coupleId, userId, kind: 'food', amountMinor: 5000, currencyCode: 'JPY', placeName: 'Ichiran',
    });

    // Both are 10000 minor units, but ₱100.00 and ¥10000 are not ₱200.00.
    const feed = listFeedDates(db, scope);
    expect(feed).toHaveLength(2);

    const aug3 = feed.find((d) => d.occurredOn === '2026-08-03');
    expect(aug3?.totalMinor).toBe(10000);
    expect(aug3?.stopCount).toBe(1);
    expect(aug3?.currencyCode).toBe('PHP');
    // Only the PHP stop's place counts — the JPY stop is excluded by the same
    // ON-clause currency predicate that excludes it from stopCount/totalMinor.
    expect(aug3?.places).toEqual(['Cafe Ysabel']);

    // A date whose only stop is in another currency must still appear in the
    // feed — the currency predicate lives in the ON clause, not the WHERE —
    // with a zero total rather than vanishing entirely, and with no places:
    // its one stop ("Ichiran") is filtered out by that same predicate, so a
    // places aggregate that ignored the ON-clause scoping would leak it in
    // here instead of the row disappearing outright.
    const aug4 = feed.find((d) => d.occurredOn === '2026-08-04');
    expect(aug4?.stopCount).toBe(0);
    expect(aug4?.totalMinor).toBe(0);
    expect(aug4?.currencyCode).toBe('PHP');
    expect(aug4?.places).toEqual([]);
  });

  it('lists distinct place names and counts distinct payers', () => {
    const { db, coupleId, userId } = setup();
    const partnerId = 'partner-user';
    const scope = { coupleId, currencyCode: 'PHP' };

    captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 10000, currencyCode: 'PHP', placeName: 'Cafe Ysabel',
    });
    captureStop(db, AUG_3, {
      coupleId, userId, kind: 'activity', amountMinor: 20000, currencyCode: 'PHP', placeName: 'Cafe Ysabel',
    });
    captureStop(db, AUG_3, {
      coupleId, userId: partnerId, kind: 'transport', amountMinor: 5000, currencyCode: 'PHP', placeName: 'Grab',
    });

    const feed = listFeedDates(db, scope);
    const aug3 = feed.find((d) => d.occurredOn === '2026-08-03');

    // Three stops, two distinct place names — group_concat(distinct ...) must
    // collapse the repeated "Cafe Ysabel" rather than listing it twice.
    expect(aug3?.places).toEqual(['Cafe Ysabel', 'Grab']);
    // Two distinct payers even though one of them paid for two of the three
    // stops — counting stops instead of distinct payers would read 3 here.
    expect(aug3?.payerCount).toBe(2);
  });

  it('keeps a place name containing a comma as one place, not two', () => {
    // Place names are free text (unlike kinds, a closed enum), so joining
    // them on a comma would split "Bo's Coffee, BGC" into two places. The
    // query joins on char(31) instead precisely to avoid this.
    const { db, coupleId, userId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };

    captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 10000, currencyCode: 'PHP', placeName: "Bo's Coffee, BGC",
    });

    const feed = listFeedDates(db, scope);

    expect(feed[0]?.places).toEqual(["Bo's Coffee, BGC"]);
  });

  it('still collapses duplicate place names once DISTINCT is dropped from the query', () => {
    // group_concat can't combine DISTINCT with a custom separator, so the
    // dedup now happens in toFeedDate instead of in SQL — this proves that
    // path still collapses repeats rather than listing "Cafe Ysabel" twice.
    const { db, coupleId, userId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };

    captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 10000, currencyCode: 'PHP', placeName: 'Cafe Ysabel',
    });
    captureStop(db, AUG_3, {
      coupleId, userId, kind: 'activity', amountMinor: 20000, currencyCode: 'PHP', placeName: 'Cafe Ysabel',
    });

    const feed = listFeedDates(db, scope);

    expect(feed[0]?.places).toEqual(['Cafe Ysabel']);
  });

  it('returns every stop\'s kind in stop order, repeats included', () => {
    // Spec §8: the timeline is the shape of the evening, so a dinner -> gig
    // -> late-night-food date must come back as [food, activity, food], not
    // the distinct, alphabetically sorted [activity, food] `kinds` gives.
    const { db, coupleId, userId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };

    captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 1000, currencyCode: 'PHP' });
    captureStop(db, AUG_3, { coupleId, userId, kind: 'activity', amountMinor: 2000, currencyCode: 'PHP' });
    captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 3000, currencyCode: 'PHP' });

    const feed = listFeedDates(db, scope);

    expect(feed[0]?.kindSequence).toEqual(['food', 'activity', 'food']);
    // Chips still see the distinct, sorted set.
    expect(feed[0]?.kinds).toEqual(['activity', 'food']);
  });

  it('carries the cover photo uri onto the feed card', () => {
    const { db, coupleId, userId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };

    const captured = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 42000, currencyCode: 'PHP',
    });
    const photoId = attachPhoto(db, AUG_3, {
      dateId: captured.dateId, localUri: 'file:///cover.jpg', width: 4, height: 3,
    });
    db.update(dates).set({ coverPhotoId: photoId }).where(eq(dates.id, captured.dateId)).run();

    const feed = listFeedDates(db, scope);

    expect(feed).toHaveLength(1);
    expect(feed[0]?.coverUri).toBe('file:///cover.jpg');
  });

  it('reports no cover when the cover photo has been tombstoned', () => {
    const { db, coupleId, userId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };

    const captured = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 42000, currencyCode: 'PHP',
    });
    const photoId = attachPhoto(db, AUG_3, {
      dateId: captured.dateId, localUri: 'file:///cover.jpg', width: 4, height: 3,
    });
    db.update(dates).set({ coverPhotoId: photoId }).where(eq(dates.id, captured.dateId)).run();
    db.update(photos).set({ deletedAt: 1_785_000_000_000 }).where(eq(photos.id, photoId)).run();

    const feed = listFeedDates(db, scope);

    // The date must still appear, just without a cover — a tombstoned photo
    // must not turn the leftJoin into a filter on the whole row.
    expect(feed).toHaveLength(1);
    expect(feed[0]?.coverUri).toBeNull();
  });

  it('does not let the cover join inflate the stop count or total', () => {
    const { db, coupleId, userId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };

    const captured = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 42000, currencyCode: 'PHP',
    });
    // A second, non-cover photo on the same date. Dates accumulate photos as
    // captures happen, so a date with one cover photo set almost always has
    // others lying around too. If the join matched on dateId instead of the
    // photo's own id, this second photo would multiply the stop rows.
    captureStop(db, AUG_3, {
      coupleId, userId, kind: 'transport', amountMinor: 8000, currencyCode: 'PHP',
      photo: { localUri: 'file:///candid.jpg', width: 4, height: 3 },
    });
    const photoId = attachPhoto(db, AUG_3, {
      dateId: captured.dateId, localUri: 'file:///cover.jpg', width: 4, height: 3,
    });
    db.update(dates).set({ coverPhotoId: photoId }).where(eq(dates.id, captured.dateId)).run();

    const feed = listFeedDates(db, scope);

    expect(feed[0]?.stopCount).toBe(2);
    expect(feed[0]?.totalMinor).toBe(50000);
  });
});
