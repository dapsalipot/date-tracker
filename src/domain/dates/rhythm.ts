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

/** One renderable row of the feed: the hero card, or a two-up pair. */
export type FeedRow =
  | { type: 'hero'; date: FeedDate }
  | { type: 'pair'; dates: readonly FeedDate[] };

/**
 * Pre-chunks a date list into rows a virtualised list can render one at a
 * time: a hero row up front (if any), then the rest paired off. This is what
 * lets `FlatList`/`SectionList` still virtualise a hero+grid layout — one
 * `renderItem` switching on `row.type`, rather than hand-rolling the layout
 * in an unvirtualised `ScrollView` that mounts every card (and every cover
 * photo) at once.
 */
export function buildFeedRows(dates: readonly FeedDate[]): FeedRow[] {
  const { hero, rest } = splitHero(dates);
  const rows: FeedRow[] = [];
  if (hero !== null) rows.push({ type: 'hero', date: hero });
  for (let i = 0; i < rest.length; i += 2) rows.push({ type: 'pair', dates: rest.slice(i, i + 2) });
  return rows;
}
