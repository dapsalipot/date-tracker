export interface RingInput {
  readonly key: string;
  readonly totalMinor: number;
}

export interface RingArc {
  readonly key: string;
  /** Degrees clockwise from 12 o'clock. */
  readonly startAngle: number;
  readonly sweepAngle: number;
  readonly fraction: number;
}

/**
 * Where a ring chart's arcs begin. Skia measures angles from 3 o'clock, but a
 * reader starts at the top, so every arc is shifted a quarter turn back.
 */
export const RING_START = -90;

/** Degrees of ground left between neighbouring arcs so they read as separate. */
const GAP = 2;

/**
 * Turns a month's spend into ring arcs.
 *
 * The arcs are honest: a slice's sweep is exactly its share of the month, with
 * no minimum width. A 0.3% slice is meant to be almost invisible — that is the
 * information. Padding it to a legible size would make the ring disagree with
 * the numbers printed directly beneath it.
 */
export function ringArcs(slices: readonly RingInput[]): RingArc[] {
  // Dropping the empty kinds is also what makes the division below safe: with
  // only positive totals left, a non-empty `usable` cannot sum to zero, and an
  // empty one never reaches the division at all.
  const usable = slices.filter((s) => s.totalMinor > 0);
  const total = usable.reduce((sum, s) => sum + s.totalMinor, 0);

  // One slice has no neighbour to be separated from, so a gap would just be a
  // notch cut out of a complete circle.
  const gap = usable.length > 1 ? GAP : 0;
  const drawable = 360 - gap * usable.length;

  let angle = RING_START;

  return usable.map((slice) => {
    const fraction = slice.totalMinor / total;
    const sweepAngle = drawable * fraction;
    const arc = { key: slice.key, startAngle: angle, sweepAngle, fraction };
    angle += sweepAngle + gap;
    return arc;
  });
}
