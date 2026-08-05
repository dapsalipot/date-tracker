import { describe, expect, it } from 'vitest';
import { sequentialIds } from './deps';

describe('sequentialIds', () => {
  it('produces stable, ordered ids', () => {
    const next = sequentialIds('stop');
    expect(next()).toBe('stop-1');
    expect(next()).toBe('stop-2');
  });

  it('gives independent generators independent sequences', () => {
    const a = sequentialIds();
    const b = sequentialIds();
    a();
    expect(b()).toBe('id-1');
  });
});
