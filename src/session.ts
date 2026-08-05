import { db, appDeps } from '@/db/client';
import { ensureLocalContext, type LocalContext } from '@/domain/identity/bootstrap';
import type { Deps } from '@/domain/deps';

const FALLBACK_TIMEZONE = 'Asia/Manila';

// Module scope rather than a render-phase useMemo: ensureLocalContext WRITES to
// the database. useMemo initializers may be re-invoked — StrictMode deliberately
// double-invokes them to surface impurity, and the React Compiler (enabled in
// app.json) assumes render is pure. Caching here makes "exactly once per
// process" a property of this code instead of React's memo semantics.
let cachedContext: LocalContext | null = null;
let cachedDeps: Deps | null = null;

export function getLocalContext(): LocalContext {
  cachedContext ??= ensureLocalContext(db, appDeps(FALLBACK_TIMEZONE));
  return cachedContext;
}

/** Deps carrying the couple's own timezone, not the fallback. */
export function getAppDeps(): Deps {
  cachedDeps ??= appDeps(getLocalContext().timezone);
  return cachedDeps;
}
