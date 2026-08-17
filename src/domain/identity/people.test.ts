import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, testDeps } from '@/test/testDb';
import { coupleMembers, users } from '@/db/schema';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { addPerson, lastPayerId, listPeople, renamePerson } from './people';

const DEPS = testDeps(1_786_000_000_000, '2026-08-18', 'ppl');

function setup() {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, DEPS);
  return { db, ctx };
}

describe('listPeople', () => {
  it('starts with the one local person the app bootstraps', () => {
    const { db, ctx } = setup();

    const people = listPeople(db, ctx.coupleId);

    expect(people).toHaveLength(1);
    expect(people[0]?.id).toBe(ctx.userId);
  });

  it('excludes a tombstoned membership', () => {
    const { db, ctx } = setup();
    const them = addPerson(db, DEPS, ctx.coupleId, 'Alex');
    db.update(coupleMembers).set({ deletedAt: 1 }).where(eq(coupleMembers.userId, them)).run();

    expect(listPeople(db, ctx.coupleId).map((p) => p.id)).toEqual([ctx.userId]);
  });

  it("ignores another couple's people", () => {
    const { db, ctx } = setup();
    addPerson(db, DEPS, 'someone-elses-couple', 'Stranger');

    expect(listPeople(db, ctx.coupleId)).toHaveLength(1);
  });

  it('orders by when they joined, so the original person leads', () => {
    const { db, ctx } = setup();
    const later = testDeps(1_786_999_999_999, '2026-08-18', 'later');
    addPerson(db, later, ctx.coupleId, 'Alex');

    const people = listPeople(db, ctx.coupleId);

    expect(people.map((p) => p.displayName)).toEqual(['Me', 'Alex']);
  });
});

describe('addPerson', () => {
  it('creates a person and their membership in one transaction', () => {
    const { db, ctx } = setup();

    const id = addPerson(db, DEPS, ctx.coupleId, 'Alex');

    const people = listPeople(db, ctx.coupleId);
    expect(people).toHaveLength(2);
    expect(people.find((p) => p.id === id)?.displayName).toBe('Alex');
  });

  it('leaves no orphan user when the membership insert fails', () => {
    const { db, ctx } = setup();
    // The user row is inserted first, the membership second. Pre-seeding the
    // membership this call is about to write makes that second insert violate
    // the (couple_id, user_id) primary key — so the failure lands with the user
    // row already written, which is exactly the window a missing transaction
    // would leave open: a person belonging to no couple, invisible to every
    // read in the app while still holding their name.
    const fixed = { ...DEPS, newId: () => 'collides' };
    db.insert(coupleMembers)
      .values({ coupleId: ctx.coupleId, userId: 'collides', joinedAt: 1, updatedAt: 1 })
      .run();

    expect(() => addPerson(db, fixed, ctx.coupleId, 'Alex')).toThrow();

    expect(db.select().from(users).all().map((u) => u.displayName)).toEqual(['Me']);
  });

  it('trims the name and refuses an empty one', () => {
    const { db, ctx } = setup();

    const id = addPerson(db, DEPS, ctx.coupleId, '  Alex  ');
    expect(listPeople(db, ctx.coupleId).find((p) => p.id === id)?.displayName).toBe('Alex');

    // A blank name would render as an invisible payer chip with nothing to tap.
    expect(() => addPerson(db, DEPS, ctx.coupleId, '   ')).toThrow(/name/i);
  });
});

describe('renamePerson', () => {
  it('renames and bumps updated_at', () => {
    const { db, ctx } = setup();
    const later = testDeps(1_786_999_999_999, '2026-08-18', 'later');

    renamePerson(db, later, ctx.userId, 'Danny');

    const me = listPeople(db, ctx.coupleId).find((p) => p.id === ctx.userId);
    expect(me?.displayName).toBe('Danny');
    const row = db.select().from(users).where(eq(users.id, ctx.userId)).all()[0];
    expect(row?.updatedAt).toBe(1_786_999_999_999);
  });

  it('refuses an empty name', () => {
    const { db, ctx } = setup();

    expect(() => renamePerson(db, DEPS, ctx.userId, '  ')).toThrow(/name/i);
  });
});

describe('lastPayerId', () => {
  it('returns whoever paid most recently', () => {
    const { db, ctx } = setup();
    const them = addPerson(db, DEPS, ctx.coupleId, 'Alex');
    captureStop(db, testDeps(1_786_000_000_000, '2026-08-18', 'c1'), {
      coupleId: ctx.coupleId, userId: ctx.userId, kind: 'food', amountMinor: 100, currencyCode: 'PHP',
    });
    captureStop(db, testDeps(1_786_900_000_000, '2026-08-19', 'c2'), {
      coupleId: ctx.coupleId, userId: them, kind: 'food', amountMinor: 200, currencyCode: 'PHP',
    });

    expect(lastPayerId(db, ctx.coupleId)).toBe(them);
  });

  it('returns null when nothing has been captured', () => {
    const { db, ctx } = setup();

    // The screen falls back to the local user; a wrong guess here would
    // silently attribute the first expense of a couple's history.
    expect(lastPayerId(db, ctx.coupleId)).toBeNull();
  });

  it("ignores another couple's stops", () => {
    const { db, ctx } = setup();
    captureStop(db, DEPS, {
      coupleId: 'them', userId: 'stranger', kind: 'food', amountMinor: 100, currencyCode: 'PHP',
    });

    expect(lastPayerId(db, ctx.coupleId)).toBeNull();
  });
});
