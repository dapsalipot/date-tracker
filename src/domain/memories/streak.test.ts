import { describe, expect, it } from 'vitest';
import { weekStreak } from './streak';

// 2026-08-17 is a Monday. Weeks run Monday to Sunday throughout.
const MONDAY = '2026-08-17';

describe('weekStreak', () => {
  it('counts consecutive weeks', () => {
    const s = weekStreak(['2026-08-17', '2026-08-10', '2026-08-03'], MONDAY);
    expect(s.current).toBe(3);
  });

  it('stops at a missed week', () => {
    // 2026-08-10's week is empty, so the run is this week alone.
    const s = weekStreak(['2026-08-17', '2026-08-03'], MONDAY);
    expect(s.current).toBe(1);
  });

  it('counts several dates in one week once', () => {
    const s = weekStreak(['2026-08-17', '2026-08-19', '2026-08-21'], MONDAY);
    expect(s.current).toBe(1);
  });

  it('treats Sunday and the next Monday as different weeks', () => {
    // This is the assertion that pins the Monday-start rule. Under a
    // Sunday-start week these two days share a week and this returns 1.
    const s = weekStreak(['2026-08-16', '2026-08-17'], MONDAY);
    expect(s.current).toBe(2);
  });

  it('measures to last week when this week is still empty', () => {
    // Early in a week, a couple has not been on a date yet. Showing 0 would
    // punish them for it being Monday morning.
    const s = weekStreak(['2026-08-10', '2026-08-03'], MONDAY);
    expect(s.current).toBe(2);
    expect(s.endedLastWeek).toBe(true);
  });

  it('does not claim the streak ended when this week has a date', () => {
    const s = weekStreak(['2026-08-17'], MONDAY);
    expect(s.endedLastWeek).toBe(false);
  });

  it('keeps the longest run after the current one breaks', () => {
    // Four weeks last year, nothing since: current is 0, longest remembers.
    const s = weekStreak(
      ['2026-06-01', '2026-05-25', '2026-05-18', '2026-05-11'],
      MONDAY,
    );
    expect(s.current).toBe(0);
    expect(s.longest).toBe(4);
    // The streak died in spring, not last week — endedLastWeek must not say
    // otherwise. Pins the `current > 0` guard: without it, this becomes
    // `!weeks.has(thisWeek)`, which is true for any dateless current week.
    expect(s.endedLastWeek).toBe(false);
  });

  it('returns zeroes for no dates at all', () => {
    expect(weekStreak([], MONDAY)).toEqual({ current: 0, longest: 0, endedLastWeek: false });
  });

  it('does not care what order the days arrive in', () => {
    const s = weekStreak(['2026-08-03', '2026-08-17', '2026-08-10'], MONDAY);
    expect(s.current).toBe(3);
  });

  it('does not let a repeated date inside a run break the longest streak', () => {
    // Three consecutive weeks (08-03, 08-10, 08-17), with 08-10 and 08-12
    // both landing in the middle week. That duplicate week-start matters
    // specifically because it falls *inside* an already-accumulating run:
    // an implementation that scans the sorted week list positionally
    // (instead of deduping first) hits the duplicate mid-run, resets its
    // run counter to 1, and only climbs back to 2 by the end — undercounting
    // longest as 2 instead of 3. A two-week fixture can't catch this, since
    // there's no accumulated run yet for the duplicate to interrupt. Do not
    // simplify this down to two weeks; that would silently drop the guard.
    const s = weekStreak(
      ['2026-08-17', '2026-08-10', '2026-08-12', '2026-08-03'],
      MONDAY,
    );
    expect(s.longest).toBe(3);
  });
});
