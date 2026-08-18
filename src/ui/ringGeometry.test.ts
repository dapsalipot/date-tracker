import { describe, expect, it } from 'vitest';
import { RING_START, ringArcs } from './ringGeometry';

describe('ringArcs', () => {
  it('gives a single slice the whole circle', () => {
    const arcs = ringArcs([{ key: 'food', totalMinor: 5000 }]);

    expect(arcs).toHaveLength(1);
    expect(arcs[0]?.sweepAngle).toBe(360);
    // No gap: with one slice there is no neighbour to separate from, so a gap
    // would just be a notch cut out of a complete circle.
  });

  it('starts at the top of the circle, not at 3 o\'clock', () => {
    const arcs = ringArcs([{ key: 'food', totalMinor: 5000 }]);

    expect(arcs[0]?.startAngle).toBe(RING_START);
    expect(RING_START).toBe(-90);
  });

  it('splits two equal slices in half', () => {
    const arcs = ringArcs([
      { key: 'food', totalMinor: 5000 },
      { key: 'gift', totalMinor: 5000 },
    ]);

    expect(arcs[0]?.fraction).toBe(0.5);
    expect(arcs[1]?.fraction).toBe(0.5);
    expect(arcs[0]?.sweepAngle).toBe(arcs[1]?.sweepAngle);
  });

  it('sizes each arc by its share of the month', () => {
    const arcs = ringArcs([
      { key: 'food', totalMinor: 7500 },
      { key: 'gift', totalMinor: 2500 },
    ]);

    expect(arcs[0]?.fraction).toBe(0.75);
    expect(arcs[1]?.fraction).toBe(0.25);
    expect(arcs[0]?.sweepAngle).toBeCloseTo((arcs[1]?.sweepAngle ?? 0) * 3, 6);
  });

  it('lays arcs end to end without overlapping', () => {
    const arcs = ringArcs([
      { key: 'food', totalMinor: 5000 },
      { key: 'gift', totalMinor: 3000 },
      { key: 'transport', totalMinor: 2000 },
    ]);

    for (let i = 1; i < arcs.length; i += 1) {
      const previous = arcs[i - 1];
      const current = arcs[i];
      // Exactly one gap of ground between neighbours. Asserting only that they
      // do not overlap is satisfied by arcs that touch, which leaves the gap
      // itself unproven and the slices visually fused.
      const separation =
        (current?.startAngle ?? 0) - ((previous?.startAngle ?? 0) + (previous?.sweepAngle ?? 0));
      expect(separation).toBeCloseTo(2, 6);
    }
  });

  it('closes the circle, leaving only the gaps', () => {
    const arcs = ringArcs([
      { key: 'food', totalMinor: 5000 },
      { key: 'gift', totalMinor: 3000 },
      { key: 'transport', totalMinor: 2000 },
    ]);

    const swept = arcs.reduce((sum, a) => sum + a.sweepAngle, 0);
    // 3 gaps of 2 degrees. A ring that does not close reads as missing data.
    expect(swept).toBeCloseTo(360 - 3 * 2, 6);
  });

  it('returns no arcs when nothing was spent', () => {
    // Not a zero-size ring — no ring. Dividing by a zero total would make every
    // angle NaN, which Skia draws as nothing while hiding the reason.
    expect(ringArcs([{ key: 'food', totalMinor: 0 }])).toEqual([]);
    expect(ringArcs([])).toEqual([]);
  });

  it('ignores a kind with no spend rather than drawing a zero-width arc', () => {
    const arcs = ringArcs([
      { key: 'food', totalMinor: 5000 },
      { key: 'gift', totalMinor: 0 },
    ]);

    expect(arcs.map((a) => a.key)).toEqual(['food']);
    // And with the empty kind gone, one slice remains — so no gap.
    expect(arcs[0]?.sweepAngle).toBe(360);
  });

  it('does not pad a tiny slice to a legible size', () => {
    // The ring sits directly above the exact numbers. Inflating a small slice
    // would make the picture disagree with the figures beneath it.
    const arcs = ringArcs([
      { key: 'food', totalMinor: 999_000 },
      { key: 'gift', totalMinor: 1_000 },
    ]);

    expect(arcs[1]?.fraction).toBeCloseTo(0.001, 6);
    expect(arcs[1]?.sweepAngle).toBeLessThan(1);
  });
});
