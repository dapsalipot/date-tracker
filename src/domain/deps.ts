import type { Clock } from './clock';

export type IdGenerator = () => string;

/**
 * Everything non-deterministic that domain code needs, injected rather than
 * imported. Time was already injected; identity now joins it, which removes
 * the last transitive `expo-*` import from the domain module graph and lets
 * these modules run in plain Node with no aliasing.
 */
export interface Deps {
  readonly clock: Clock;
  readonly newId: IdGenerator;
}

/** Deterministic ids for tests. Makes assertions readable and failures stable. */
export function sequentialIds(prefix = 'id'): IdGenerator {
  let n = 0;
  return () => `${prefix}-${(n += 1)}`;
}
