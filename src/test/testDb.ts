import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import { fixedClock } from '@/domain/clock';
import { sequentialIds, type Deps } from '@/domain/deps';

/** Fresh in-memory database with all migrations applied. */
export function createTestDb(): AppDatabase {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: './drizzle' });
  return db as unknown as AppDatabase;
}

/** Deterministic deps for tests: a fixed clock plus stable sequential ids. */
export function testDeps(nowMs: number, todayLocal: string, idPrefix = 'id'): Deps {
  return { clock: fixedClock(nowMs, todayLocal), newId: sequentialIds(idPrefix) };
}
