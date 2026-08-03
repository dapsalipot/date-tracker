import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from './schema';

/**
 * Both expo-sqlite and better-sqlite3 are synchronous drivers, so one type
 * covers the app and the Node test suite. Repositories accept this rather than
 * importing a singleton, which is what lets them be tested without a simulator.
 */
export type AppDatabase = BaseSQLiteDatabase<'sync', unknown, typeof schema>;
