import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { dates } from '@/db/schema';
import { createTestDb, testDeps } from '@/test/testDb';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { budgetStatusFor } from '@/domain/budget/status';
import { listStopsForDate } from '@/domain/stops/edit';
import { captureStop, listFeedDates } from '@/domain/dates/repository';
import { deleteDate, loadDateDetail, publishDate, updateDateDetails } from './compose';

const DEPS = testDeps(1_785_000_000_000, '2026-08-03');

function setup() {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, DEPS);
  const captured = captureStop(db, DEPS, {
    coupleId: ctx.coupleId, userId: ctx.userId, kind: 'food', amountMinor: 42000, currencyCode: 'PHP',
  });
  return { db, dateId: captured.dateId };
}

describe('updateDateDetails', () => {
  it('sets the fields it is given and leaves the rest alone', () => {
    const { db, dateId } = setup();

    updateDateDetails(db, DEPS, dateId, { title: 'Bag of Beans Day' });
    updateDateDetails(db, DEPS, dateId, { rating: 5 });

    const detail = loadDateDetail(db, dateId);
    expect(detail?.title).toBe('Bag of Beans Day');
    expect(detail?.rating).toBe(5);
  });

  it('bumps updated_at so sync and draft ordering see the edit', () => {
    const { db, dateId } = setup();
    const updatedAtOf = () =>
      db.select({ updatedAt: dates.updatedAt }).from(dates)
        .where(eq(dates.id, dateId)).all()[0]?.updatedAt;
    const before = updatedAtOf();

    const later = testDeps(1_785_999_999_999, '2026-08-03', 'later');
    updateDateDetails(db, later, dateId, { caption: 'worth the rain' });

    expect(loadDateDetail(db, dateId)?.caption).toBe('worth the rain');
    expect(updatedAtOf()).toBe(1_785_999_999_999);
    expect(updatedAtOf()).not.toBe(before);
  });

  it('moves a date to the day it actually happened', () => {
    const { db, dateId } = setup();

    updateDateDetails(db, DEPS, dateId, { occurredOn: '2026-07-04' });

    expect(loadDateDetail(db, dateId)?.occurredOn).toBe('2026-07-04');
  });

  it('refuses a date in the future', () => {
    // A journal, not a planner. A future date has no stops and would sort above
    // every real memory on the feed.
    const { db, dateId } = setup();

    expect(() => updateDateDetails(db, DEPS, dateId, { occurredOn: '2099-01-01' }))
      .toThrow(/future/i);
    expect(loadDateDetail(db, dateId)?.occurredOn).not.toBe('2099-01-01');
  });

  it('accepts today itself', () => {
    // The boundary matters: "not in the future" must not reject today, which is
    // the day almost every date is captured on.
    const { db, dateId } = setup();

    expect(() => updateDateDetails(db, DEPS, dateId, { occurredOn: DEPS.clock.todayLocal() }))
      .not.toThrow();
  });

  it('refuses a malformed date', () => {
    // occurredOn is compared as a string throughout the app — month grouping,
    // the calendar, and every analytics read use substr on it. A value that is
    // not YYYY-MM-DD corrupts all of them silently.
    //
    // MM-DD-YYYY is used here rather than something like '4 July': it sorts
    // lexically *before* DEPS' today ('07-04-2026' < '2026-08-03' since '0' <
    // '2'), so this only throws if the format guard runs — a value that sorts
    // after today would also be caught by the future-date guard, and the test
    // would pass for the wrong reason.
    const { db, dateId } = setup();

    expect(() => updateDateDetails(db, DEPS, dateId, { occurredOn: '07-04-2026' })).toThrow();
  });

  it('leaves the day alone when the patch omits it', () => {
    const { db, dateId } = setup();
    const before = loadDateDetail(db, dateId)?.occurredOn;

    updateDateDetails(db, DEPS, dateId, { title: 'Dinner' });

    expect(loadDateDetail(db, dateId)?.occurredOn).toBe(before);
  });
});

describe('loadDateDetail', () => {
  it('does not load a tombstoned date', () => {
    const { db, dateId } = setup();
    db.update(dates).set({ deletedAt: 1_785_000_000_000 }).where(eq(dates.id, dateId)).run();

    expect(loadDateDetail(db, dateId)).toBeNull();
  });
});

describe('publishDate', () => {
  it('refuses to publish an untitled date', () => {
    const { db, dateId } = setup();

    expect(() => publishDate(db, DEPS, dateId)).toThrow(/title/i);
    expect(loadDateDetail(db, dateId)?.status).toBe('draft');
  });

  it('publishes once a title exists', () => {
    const { db, dateId } = setup();
    updateDateDetails(db, DEPS, dateId, { title: 'Tagaytay' });

    publishDate(db, DEPS, dateId);

    expect(loadDateDetail(db, dateId)?.status).toBe('published');
  });

});

describe('deleteDate', () => {
  function twoDates() {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    const kept = captureStop(db, DEPS, {
      coupleId: ctx.coupleId, userId: ctx.userId, kind: 'food', amountMinor: 30000, currencyCode: 'PHP',
    });
    updateDateDetails(db, DEPS, kept.dateId, { title: 'Kept' });
    publishDate(db, DEPS, kept.dateId);
    const doomed = captureStop(db, testDeps(1_785_100_000_000, '2026-08-04', 'doom'), {
      coupleId: ctx.coupleId, userId: ctx.userId, kind: 'food', amountMinor: 70000, currencyCode: 'PHP',
    });
    updateDateDetails(db, DEPS, doomed.dateId, { title: 'Doomed' });
    publishDate(db, testDeps(1_785_100_000_000, '2026-08-04', 'doom'), doomed.dateId);
    return { db, scope: { coupleId: ctx.coupleId, currencyCode: 'PHP' }, kept, doomed };
  }

  it('takes the date off the feed', () => {
    // Dates were add-only: a stray capture stayed on the wall forever, and the
    // only existing removal was per-stop, which leaves an empty date behind.
    const { db, scope, doomed } = twoDates();

    deleteDate(db, DEPS, doomed.dateId);

    expect(listFeedDates(db, scope).map((d) => d.id)).not.toContain(doomed.dateId);
  });

  it('leaves every other date alone', () => {
    const { db, scope, kept, doomed } = twoDates();

    deleteDate(db, DEPS, doomed.dateId);

    expect(listFeedDates(db, scope).map((d) => d.id)).toContain(kept.dateId);
  });

  it('keeps the deleted date out of the month total', () => {
    const { db, scope, doomed } = twoDates();
    expect(budgetStatusFor(db, scope, '2026-08', '2026-08-04').spentMinor).toBe(100000);

    deleteDate(db, DEPS, doomed.dateId);

    expect(budgetStatusFor(db, scope, '2026-08', '2026-08-04').spentMinor).toBe(30000);
  });

  it('tombstones the stops that belong to it', () => {
    // Asserted through `listStopsForDate`, not through the month total: every
    // analytics read joins `dates`, so the date's own tombstone already hides
    // the spending and an assertion there passes whether or not the stops were
    // touched. `stopsForDateQuery` selects FROM stops with no join, so it is
    // the one consumer that can actually see the difference.
    const { db, doomed } = twoDates();
    expect(listStopsForDate(db, doomed.dateId)).toHaveLength(1);

    deleteDate(db, DEPS, doomed.dateId);

    expect(listStopsForDate(db, doomed.dateId)).toHaveLength(0);
  });
});
