import { describe, expect, it } from 'vitest';
import type { FeedDate } from './repository';
import { buildFeedRows, splitHero } from './rhythm';

// A properly typed fixture, not `as never`: that cast switched off type
// checking exactly where FeedDate's fields are threaded through, so adding a
// required field to FeedDate (as `kindSequence` was) wouldn't fail this file
// even though every call site here would then be building an incomplete row.
const d = (id: string, occurredOn: string, status = 'published'): FeedDate => ({
  id, occurredOn, status, title: null, stopCount: 1, totalMinor: 1, currencyCode: 'PHP',
  coverUri: null, kinds: [], kindSequence: [], places: [], payerCount: 1,
});

describe('splitHero', () => {
  it('promotes the newest published date', () => {
    const { hero, rest } = splitHero([d('a', '2026-08-17'), d('b', '2026-08-02')]);
    expect(hero?.id).toBe('a');
    expect(rest.map((r) => r.id)).toEqual(['b']);
  });

  it('picks by date, not by list order', () => {
    // The feed arrives sorted, but a hero chosen by position silently breaks
    // the moment any caller sorts differently.
    const { hero } = splitHero([d('old', '2026-08-02'), d('new', '2026-08-17')]);
    expect(hero?.id).toBe('new');
  });

  it('never promotes a draft', () => {
    // A draft is unfinished and usually has no cover; as a full-bleed hero it
    // would be the largest, emptiest thing on the screen.
    const { hero, rest } = splitHero([d('draft', '2026-08-18', 'draft'), d('pub', '2026-08-01')]);
    expect(hero?.id).toBe('pub');
    expect(rest.map((r) => r.id)).toEqual(['draft']);
  });

  it('returns no hero when nothing is published', () => {
    const { hero, rest } = splitHero([d('draft', '2026-08-18', 'draft')]);
    expect(hero).toBeNull();
    expect(rest).toHaveLength(1);
  });

  it('handles an empty feed', () => {
    expect(splitHero([])).toEqual({ hero: null, rest: [] });
  });

  it('keeps every date exactly once', () => {
    const input = [d('a', '2026-08-17'), d('b', '2026-08-02'), d('c', '2026-08-09')];
    const { hero, rest } = splitHero(input);
    expect([...(hero ? [hero.id] : []), ...rest.map((r) => r.id)].sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('buildFeedRows', () => {
  it('leads with a hero row, then pairs the rest in their original order', () => {
    const rows = buildFeedRows([d('a', '2026-08-17'), d('b', '2026-08-02'), d('c', '2026-08-09')]);
    expect(rows).toEqual([
      { type: 'hero', date: d('a', '2026-08-17') },
      { type: 'pair', dates: [d('b', '2026-08-02'), d('c', '2026-08-09')] },
    ]);
  });

  it('has no hero row when nothing is published, just a pair row', () => {
    const rows = buildFeedRows([d('draft', '2026-08-18', 'draft')]);
    expect(rows).toEqual([{ type: 'pair', dates: [d('draft', '2026-08-18', 'draft')] }]);
  });
});
