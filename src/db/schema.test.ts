import { describe, expect, it } from 'vitest';
import { createTestDb } from '@/test/testDb';
import { couples } from './schema';
import { newId } from './id';

describe('schema', () => {
  it('applies migrations and round-trips a couple', () => {
    const db = createTestDb();
    const id = newId();

    db.insert(couples).values({ id, currencyCode: 'PHP', timezone: 'Asia/Manila', createdAt: 1 }).run();

    const rows = db.select().from(couples).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(id);
    expect(rows[0]?.currencyCode).toBe('PHP');
  });

  it('generates distinct ids', () => {
    expect(newId()).not.toBe(newId());
  });
});
