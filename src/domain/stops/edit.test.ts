import { describe, expect, it } from 'vitest';
import { createTestDb, testDeps } from '@/test/testDb';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { deleteStop, listStopsForDate, reorderStops, updateStop } from './edit';

const DEPS = testDeps(1_785_000_000_000, '2026-08-03');

function setup() {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, DEPS);
  const base = { coupleId: ctx.coupleId, userId: ctx.userId, amountMinor: 100, currencyCode: 'PHP' } as const;
  const a = captureStop(db, DEPS, { ...base, kind: 'food' });
  const b = captureStop(db, DEPS, { ...base, kind: 'transport' });
  return { db, dateId: a.dateId, a: a.stopId, b: b.stopId };
}

describe('listStopsForDate', () => {
  it('returns stops in sort order', () => {
    const { db, dateId, a, b } = setup();
    expect(listStopsForDate(db, dateId).map((s) => s.id)).toEqual([a, b]);
  });
});

describe('updateStop', () => {
  it('patches only the given fields', () => {
    const { db, dateId, a } = setup();

    updateStop(db, DEPS, a, { label: 'Morning coffee', subkind: 'cafe' });

    const stop = listStopsForDate(db, dateId).find((s) => s.id === a);
    expect(stop?.label).toBe('Morning coffee');
    expect(stop?.subkind).toBe('cafe');
    expect(stop?.amountMinor).toBe(100);
  });
});

describe('deleteStop', () => {
  it('tombstones and leaves the remaining order intact', () => {
    const { db, dateId, a, b } = setup();

    deleteStop(db, DEPS, a);

    const remaining = listStopsForDate(db, dateId);
    expect(remaining.map((s) => s.id)).toEqual([b]);
    expect(remaining[0]?.sortOrder).toBe(1);
  });
});

describe('reorderStops', () => {
  it('renumbers to match the given order', () => {
    const { db, dateId, a, b } = setup();

    reorderStops(db, DEPS, dateId, [b, a]);

    expect(listStopsForDate(db, dateId).map((s) => s.id)).toEqual([b, a]);
  });

  it('ignores ids that do not belong to the date', () => {
    const { db, dateId, a, b } = setup();

    reorderStops(db, DEPS, dateId, [b, 'not-a-stop', a]);

    expect(listStopsForDate(db, dateId).map((s) => s.id)).toEqual([b, a]);
  });
});
