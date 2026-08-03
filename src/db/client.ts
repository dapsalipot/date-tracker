import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';
import type { AppDatabase } from './types';

// enableChangeListener is required for drizzle's useLiveQuery to react to writes.
const expoDb = openDatabaseSync('datetracker.db', { enableChangeListener: true });

const drizzleDb = drizzle(expoDb, { schema });

/**
 * Typed handle passed to repositories. The cast widens the concrete expo type
 * to the driver-agnostic `AppDatabase` so the same repositories run under
 * better-sqlite3 in Node tests.
 */
export const db = drizzleDb as unknown as AppDatabase;

/** Concrete handle for drizzle's migrator, which requires the expo type. */
export const migrationDb = drizzleDb;

export { expoDb };
