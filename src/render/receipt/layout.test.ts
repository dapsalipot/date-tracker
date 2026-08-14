import { describe, expect, it, vi } from 'vitest';

/**
 * Skia is a native module, so it is stubbed here. This is NOT a pixel test —
 * spec §11 rules those out as flaky. `ReceiptTemplate` is a plain function that
 * returns an element tree, so its LAYOUT ARITHMETIC can be asserted in plain
 * Node: every element carries the `y` the template computed for it, and the
 * canvas has a known height. That is enough to prove nothing falls off the
 * bottom, which is a defect no amount of reading the code reliably catches.
 */
vi.mock('@shopify/react-native-skia', () => ({
  Canvas: 'Canvas',
  Fill: 'Fill',
  Group: 'Group',
  Line: 'Line',
  Text: 'Text',
  matchFont: ({ fontSize }: { fontSize: number }) => ({
    // Rough monospace approximation. Exact glyph metrics do not matter; what
    // matters is that a longer string measures wider, so the shrink-to-fit and
    // truncation paths are exercised.
    measureText: (text: string) => ({ width: text.length * fontSize * 0.55 }),
  }),
}));

const { ReceiptTemplate, RECEIPT_SIZES } = await import('./ReceiptTemplate');

type Placed = { key: string; y: number; text: string | undefined };

function placed(vm: Parameters<typeof ReceiptTemplate>[0]['vm'], size: 'post' | 'story'): Placed[] {
  const root = ReceiptTemplate({ vm, size }) as unknown as {
    props: { children: { key: string; props: Record<string, unknown> }[] };
  };
  return root.props.children
    .filter((child) => typeof child.props?.y === 'number')
    .map((child) => ({
      key: child.key,
      y: child.props.y as number,
      text: child.props.text as string | undefined,
    }));
}

function makeVm(stopCount: number, overrides: Record<string, unknown> = {}) {
  return {
    title: 'Tagaytay',
    occurredOn: '2026-08-14',
    lines: Array.from({ length: stopCount }, (_, i) => ({
      label: `stop ${i + 1}`,
      detail: 'Somewhere · cafe',
      money: '₱420.00',
    })),
    people: [{ name: 'Me', money: '₱2,340.00' }],
    total: '₱2,340.00',
    rating: 5,
    stopCount,
    ...overrides,
  } as Parameters<typeof ReceiptTemplate>[0]['vm'];
}

describe('receipt layout', () => {
  it('keeps every element on the canvas for a normal date', () => {
    const { height } = RECEIPT_SIZES.post;

    const elements = placed(makeVm(4), 'post');

    const lowest = Math.max(...elements.map((e) => e.y));
    expect(lowest).toBeLessThanOrEqual(height);
  });

  it('never clips the total off a long date', () => {
    const { height } = RECEIPT_SIZES.post;

    const elements = placed(makeVm(15), 'post');

    // The total is the number the reader is looking for. Before the height
    // budget it simply fell past the bottom edge and the Group clipped it away
    // with no error — the receipt exported without a total on it.
    const total = elements.find((e) => e.key === 'total-amount');
    expect(total).toBeDefined();
    expect(total!.y).toBeLessThanOrEqual(height);

    const offCanvas = elements.filter((e) => e.y > height);
    expect(offCanvas).toEqual([]);
  });

  it('says how many stops it could not fit', () => {
    const elements = placed(makeVm(15), 'post');

    const overflow = elements.find((e) => e.key === 'overflow');
    expect(overflow).toBeDefined();
    expect(overflow!.text).toMatch(/^\+\d+ more stops?$/);
  });

  it('shows no overflow note when everything fits', () => {
    const elements = placed(makeVm(3), 'post');

    expect(elements.find((e) => e.key === 'overflow')).toBeUndefined();
  });

  it('fits more stops on a story canvas than a post canvas', () => {
    const postLabels = placed(makeVm(15), 'post').filter((e) => e.key.startsWith('label-'));
    const storyLabels = placed(makeVm(15), 'story').filter((e) => e.key.startsWith('label-'));

    expect(storyLabels.length).toBeGreaterThan(postLabels.length);
  });

  it('truncates a title that would run off the right edge', () => {
    const elements = placed(makeVm(3, { title: 'A'.repeat(200) }), 'post');

    const title = elements.find((e) => e.key === 'title');
    expect(title?.text).toMatch(/…$/);
    expect(title!.text!.length).toBeLessThan(200);
  });

  it('leaves a short title untouched', () => {
    const elements = placed(makeVm(3, { title: 'Tagaytay' }), 'post');

    expect(elements.find((e) => e.key === 'title')?.text).toBe('Tagaytay');
  });

  it('draws no closing rule when there is nothing below it', () => {
    // hidden mode with a solo unpriced payer: no people block, no total, no
    // rating — so a divider would hang under nothing.
    const elements = placed(
      makeVm(2, { people: [{ name: 'Me', money: null }], total: null, rating: null }),
      'post',
    );

    expect(elements.find((e) => e.key === 'divider-people')).toBeUndefined();
  });
});
