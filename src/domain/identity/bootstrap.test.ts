import { describe, expect, it } from 'vitest';
import { createTestDb, testDeps } from '@/test/testDb';
import { coupleMembers, couples, users } from '@/db/schema';
import { fixedClock, systemClock } from '@/domain/clock';
import { ensureLocalContext } from './bootstrap';

const clock = fixedClock(1_700_000_000_000, '2026-08-03');
const deps = testDeps(1_700_000_000_000, '2026-08-03');

describe('ensureLocalContext', () => {
  it('creates a user, couple and membership on first run', () => {
    const db = createTestDb();

    const ctx = ensureLocalContext(db, deps);

    expect(db.select().from(users).all()).toHaveLength(1);
    expect(db.select().from(couples).all()).toHaveLength(1);
    expect(db.select().from(coupleMembers).all()).toHaveLength(1);
    expect(ctx.currencyCode).toBe('PHP');
    expect(ctx.timezone).toBe('Asia/Manila');
  });

  it('is idempotent across launches', () => {
    const db = createTestDb();

    const first = ensureLocalContext(db, deps);
    const second = ensureLocalContext(db, deps);

    expect(second.userId).toBe(first.userId);
    expect(second.coupleId).toBe(first.coupleId);
    expect(db.select().from(couples).all()).toHaveLength(1);
  });
});

describe('fixedClock', () => {
  it('returns the values it was given', () => {
    expect(clock.nowMs()).toBe(1_700_000_000_000);
    expect(clock.todayLocal()).toBe('2026-08-03');
  });
});

describe('systemClock', () => {
  it('formats today as ISO YYYY-MM-DD', () => {
    expect(systemClock('Asia/Manila').todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uses the given timezone rather than the machine zone', () => {
    // Pacific/Kiritimati is UTC+14 and Pacific/Niue is UTC-11 — 25 hours apart,
    // so their local calendar dates always differ, whenever this test runs.
    expect(systemClock('Pacific/Kiritimati').todayLocal()).not.toBe(
      systemClock('Pacific/Niue').todayLocal(),
    );
  });
});
