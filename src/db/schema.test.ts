import { describe, expect, it } from 'vitest';
import { createTestDb } from '@/test/testDb';
import { couples, coupleMembers, users } from './schema';
import { newId } from './id';

describe('schema', () => {
  it('applies migrations and round-trips a couple', () => {
    const db = createTestDb();
    const id = newId();

    db.insert(couples)
      .values({ id, currencyCode: 'PHP', timezone: 'Asia/Manila', createdAt: 1, updatedAt: 1 })
      .run();

    const rows = db.select().from(couples).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(id);
    expect(rows[0]?.currencyCode).toBe('PHP');
  });

  it('generates distinct ids', () => {
    expect(newId()).not.toBe(newId());
  });

  it('gives users, couples and couple_members tombstone columns', () => {
    const db = createTestDb();
    const userId = newId();
    const coupleId = newId();

    db.insert(users).values({ id: userId, displayName: 'Me', updatedAt: 10 }).run();
    db.insert(couples)
      .values({ id: coupleId, currencyCode: 'PHP', timezone: 'Asia/Manila', createdAt: 10, updatedAt: 10 })
      .run();
    db.insert(coupleMembers)
      .values({ coupleId, userId, joinedAt: 10, updatedAt: 10 })
      .run();

    expect(db.select().from(users).all()[0]?.deletedAt).toBeNull();
    expect(db.select().from(couples).all()[0]?.deletedAt).toBeNull();
    expect(db.select().from(coupleMembers).all()[0]?.deletedAt).toBeNull();
    expect(db.select().from(coupleMembers).all()[0]?.updatedAt).toBe(10);
  });
});
