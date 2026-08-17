import { describe, expect, it } from 'vitest';
import { createTestDb, testDeps } from '@/test/testDb';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { updateStop } from '@/domain/stops/edit';
import { topPlaces } from './places';

function setup() {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, testDeps(Date.parse('2026-08-14T12:00:00Z'), '2026-08-14', 'boot'));
  return { db, ctx, scope: { coupleId: ctx.coupleId, currencyCode: ctx.currencyCode } };
}

function spend(db: ReturnType<typeof createTestDb>, ctx: { coupleId: string; userId: string },
               kind: string, amountMinor: number, day: string, prefix: string) {
  return captureStop(db, testDeps(Date.parse(`${day}T12:00:00Z`), day, prefix), {
    coupleId: ctx.coupleId, userId: ctx.userId,
    kind: kind as 'food', amountMinor, currencyCode: 'PHP',
  });
}

describe('topPlaces', () => {
  it('ranks places by total spend and counts visits', () => {
    const { db, ctx, scope } = setup();
    const deps = testDeps(1, '2026-08-14', 'up');
    const a = spend(db, ctx, 'food', 20000, '2026-08-01', 'a');
    const b = spend(db, ctx, 'food', 30000, '2026-08-02', 'b');
    const c = spend(db, ctx, 'food', 90000, '2026-08-03', 'c');
    updateStop(db, deps, a.stopId, { placeName: 'Bag of Beans' });
    updateStop(db, deps, b.stopId, { placeName: 'Bag of Beans' });
    updateStop(db, deps, c.stopId, { placeName: 'Antonio\'s' });

    const places = topPlaces(db, scope, '2026-08', 5, 12);

    expect(places[0]).toEqual({ placeName: 'Antonio\'s', totalMinor: 90000, visits: 1 });
    expect(places[1]).toEqual({ placeName: 'Bag of Beans', totalMinor: 50000, visits: 2 });
  });

  it('skips stops with no place name', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 20000, '2026-08-01', 'a');

    // place_name is free text and usually blank; a "(none)" row would top the
    // chart on most couples' data and tell them nothing.
    expect(topPlaces(db, scope, '2026-08', 5, 12)).toEqual([]);
  });

  it('returns at most the requested limit', () => {
    const { db, ctx, scope } = setup();
    const deps = testDeps(1, '2026-08-14', 'up');
    for (let i = 0; i < 7; i += 1) {
      const s = spend(db, ctx, 'food', (i + 1) * 1000, `2026-08-0${i + 1}`, `p${i}`);
      updateStop(db, deps, s.stopId, { placeName: `Place ${i}` });
    }

    expect(topPlaces(db, scope, '2026-08', 5, 12)).toHaveLength(5);
  });
});
