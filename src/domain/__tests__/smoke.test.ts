import { describe, expect, it } from 'vitest';

describe('test harness', () => {
  it('runs in a node environment', () => {
    expect(typeof process.versions.node).toBe('string');
  });
});
