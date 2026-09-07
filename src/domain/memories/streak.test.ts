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

describe('weekStreak across the year boundary', () => {
  // Verified against an independent calendar: 2026 is a 53-ISO-week year, and
  // 2027-01-03 belongs to ISO week (2026, 53). An implementation keyed on
  // `${year}-W${week}` reads that as "2026-53" while its neighbour reads
  // "2027-01", so adjacency and sort order both break exactly here. Anchoring
  // on the Monday's own date is what makes New Year an ordinary week.
  const NEW_YEAR_RUN = [
    '2026-12-21', // Mon, week of 2026-12-21
    '2026-12-27', // Sun, same week
    '2026-12-28', // Mon, week of 2026-12-28
    '2027-01-03', // Sun, same week — ISO (2026, 53)
    '2027-01-04', // Mon, week of 2027-01-04
    '2027-01-11', // Mon, week of 2027-01-11
  ] as const;

  it('counts a run that crosses New Year as consecutive', () => {
    expect(weekStreak(NEW_YEAR_RUN, '2027-01-11')).toEqual({
      current: 4,
      longest: 4,
      endedLastWeek: false,
    });
  });

  it('splits the Sunday and Monday that straddle New Year into two weeks', () => {
    // 2027-01-03 is a Sunday and 2027-01-04 the Monday after it. One week
    // apart, not one week — this is the pair that a Sunday-start week would
    // silently merge.
    expect(weekStreak(['2027-01-03', '2027-01-04'], '2027-01-04')).toMatchObject({
      current: 2,
      longest: 2,
    });
  });

  it('counts December 31 and January 1 as the same week when they share a Monday', () => {
    // Thu 2026-12-31 and Fri 2027-01-01 both sit in the week of 2026-12-28.
    // A year-keyed implementation counts two; the calendar says one.
    expect(weekStreak(['2026-12-31', '2027-01-01'], '2027-01-01')).toMatchObject({
      current: 1,
      longest: 1,
    });
  });
});
