import type { FeedDate } from './repository';

/**
 * Splits the feed into the one date shown full-bleed and the rest shown two-up.
 *
 * Varying the card size is what stops the feed reading as empty and as
 * monotonous at the same time; a uniform column fails one or the other.
 */
export function splitHero(dates: readonly FeedDate[]): {
  hero: FeedDate | null;
  rest: readonly FeedDate[];
} {
  let hero: FeedDate | null = null;

  for (const date of dates) {
    if (date.status !== 'published') continue;
    // Compared by date rather than taken from position: the feed happens to
    // arrive sorted, but a hero chosen by index breaks silently the day a
    // caller sorts differently.
    if (hero === null || date.occurredOn > hero.occurredOn) hero = date;
  }

  return { hero, rest: hero === null ? dates : dates.filter((d) => d.id !== hero!.id) };
}
