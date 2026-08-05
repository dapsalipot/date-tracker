import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { dates, stops } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import { STOP_KINDS, type StopKind } from './taxonomy';

/**
 * All six kinds, most-recently-used first. Always returns the full set — the
 * capture sheet shows every chip, and hiding one because it has no history
 * would make the rarely-used categories permanently unreachable.
 */
export function kindsByRecentUse(db: AppDatabase, coupleId: string): StopKind[] {
  const used = db
    .select({ kind: stops.kind, lastUsed: sql<number>`max(${stops.updatedAt})` })
    .from(stops)
    .innerJoin(dates, eq(stops.dateId, dates.id))
    .where(and(eq(dates.coupleId, coupleId), isNull(dates.deletedAt), isNull(stops.deletedAt)))
    .groupBy(stops.kind)
    .orderBy(desc(sql`max(${stops.updatedAt})`))
    .all();

  const ordered = used
    .map((row) => row.kind)
    .filter((kind): kind is StopKind => (STOP_KINDS as readonly string[]).includes(kind));

  const seen = new Set(ordered);
  return [...ordered, ...STOP_KINDS.filter((kind) => !seen.has(kind))];
}
