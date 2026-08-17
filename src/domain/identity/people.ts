import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { coupleMembers, dates, stops, users } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { Deps } from '@/domain/deps';

export interface Person {
  id: string;
  displayName: string;
}

/**
 * v1 has no accounts, so a second person is simply a local name the couple
 * types once. That is enough to attribute who paid, which is the only thing
 * this app claims to do with people — spec §2 rejects debt ledgers outright.
 *
 * v2 pairing can later reconcile a placeholder with a real account; the row
 * shape is already what the sync layer expects.
 */

function requireName(displayName: string): string {
  const trimmed = displayName.trim();
  if (trimmed === '') {
    throw new Error('a person needs a name');
  }
  return trimmed;
}

/** Ordered by when they joined, so the person who set the app up leads. */
export function listPeople(db: AppDatabase, coupleId: string): Person[] {
  return db
    .select({ id: users.id, displayName: users.displayName })
    .from(coupleMembers)
    .innerJoin(users, and(eq(users.id, coupleMembers.userId), isNull(users.deletedAt)))
    .where(and(eq(coupleMembers.coupleId, coupleId), isNull(coupleMembers.deletedAt)))
    .orderBy(asc(coupleMembers.joinedAt))
    .all();
}

/**
 * The user row and its membership land together — a person belonging to no
 * couple would be invisible to every read in the app while still occupying
 * their name.
 */
export function addPerson(
  db: AppDatabase,
  deps: Deps,
  coupleId: string,
  displayName: string,
): string {
  const name = requireName(displayName);
  const now = deps.clock.nowMs();

  let created: string | null = null;

  db.transaction((tx) => {
    const userId = deps.newId();
    tx.insert(users).values({ id: userId, displayName: name, updatedAt: now }).run();
    tx.insert(coupleMembers)
      .values({ coupleId, userId, joinedAt: now, updatedAt: now })
      .run();
    created = userId;
  });

  if (created === null) throw new Error('addPerson produced no person');
  return created;
}

export function renamePerson(
  db: AppDatabase,
  deps: Deps,
  userId: string,
  displayName: string,
): void {
  const name = requireName(displayName);
  db.update(users)
    .set({ displayName: name, updatedAt: deps.clock.nowMs() })
    .where(eq(users.id, userId))
    .run();
}

/**
 * Whoever paid most recently, or null if this couple has captured nothing.
 *
 * The capture sheet defaults its payer to this so the common case stays one
 * tap — the five-second target does not survive a required choice on every
 * capture. Null is returned rather than guessing, so the caller decides what
 * an empty history means.
 */
export function lastPayerId(db: AppDatabase, coupleId: string): string | null {
  const rows = db
    .select({ paidByUserId: stops.paidByUserId })
    .from(stops)
    .innerJoin(dates, eq(dates.id, stops.dateId))
    .where(
      and(
        eq(dates.coupleId, coupleId),
        isNull(dates.deletedAt),
        isNull(stops.deletedAt),
        isNotNull(stops.paidByUserId),
      ),
    )
    .orderBy(desc(stops.occurredAt))
    .limit(1)
    .all();

  return rows[0]?.paidByUserId ?? null;
}
