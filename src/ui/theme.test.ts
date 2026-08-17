import { describe, expect, it } from 'vitest';
import { theme } from './theme';
import { STOP_KINDS } from '@/domain/stops/taxonomy';

describe('type scale', () => {
  it('descends at every step', () => {
    const sizes = [
      theme.type.display.fontSize,
      theme.type.title.fontSize,
      theme.type.body.fontSize,
      theme.type.meta.fontSize,
      theme.type.micro.fontSize,
    ];

    for (let i = 1; i < sizes.length; i += 1) {
      expect(sizes[i]!).toBeLessThan(sizes[i - 1]!);
    }
  });

  it('keeps body under half of display', () => {
    // The span between the headline and the body IS the design. The look this
    // plan replaces was 28/20/16 — descending, but body sat at 0.57 of display
    // and nothing read as dominant. This scale puts it at 0.47.
    //
    // Deliberately NOT a per-step ratio: meta and micro are both small text and
    // their ratio to each other carries no hierarchy, so a uniform gap rule
    // would either reject this scale or be loose enough to accept the old one.
    const ratio = theme.type.body.fontSize / theme.type.display.fontSize;
    expect(ratio).toBeLessThan(0.5);
  });

  it('gives every step a line height taller than its size', () => {
    for (const step of Object.values(theme.type)) {
      expect(step.lineHeight).toBeGreaterThan(step.fontSize);
    }
  });

  it('letterspaces micro, and only micro', () => {
    expect(theme.type.micro.letterSpacing).toBeGreaterThan(0);
    // Every OTHER step, not just display. Letterspacing is what makes micro
    // read as a label rather than small body text; spreading it elsewhere
    // dilutes that signal to nothing.
    for (const [name, step] of Object.entries(theme.type)) {
      if (name === 'micro') continue;
      expect(step.letterSpacing).toBe(0);
    }
  });

  it('keeps the title step distinct from both neighbours', () => {
    // Pinning only display and body leaves the middle of a five-step scale
    // free to collapse: title could drop to 17 against a 16 body and every
    // other assertion here would still pass, erasing the second-largest step
    // in a design whose whole claim is that hierarchy comes from ratio.
    expect(theme.type.title.fontSize / theme.type.display.fontSize).toBeLessThan(0.75);
    expect(theme.type.body.fontSize / theme.type.title.fontSize).toBeLessThan(0.8);
  });
});

describe('colour system', () => {
  it('gives every stop kind its own colour', () => {
    for (const kind of STOP_KINDS) {
      expect(theme.kind[kind]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('never lets a kind wear the brand colour', () => {
    // primary carries actions, key numbers, the FAB and the active tab. A kind
    // wearing it collapses "what this is" into "what you can do".
    for (const kind of STOP_KINDS) {
      expect(theme.kind[kind].toUpperCase()).not.toBe(theme.role.primary.toUpperCase());
    }
  });

  it('keeps every kind colour distinct', () => {
    const used = Object.values(theme.kind).map((hex) => hex.toUpperCase());
    expect(new Set(used).size).toBe(used.length);
  });

  it('keeps the ground darker than the card surface', () => {
    // On a dark UI the floor must sit BELOW the cards. The previous attempt used
    // the brand plum as the ground, which left cards nothing to rise from.
    const luminance = (hex: string) =>
      Number.parseInt(hex.slice(1, 3), 16) +
      Number.parseInt(hex.slice(3, 5), 16) +
      Number.parseInt(hex.slice(5, 7), 16);

    expect(luminance(theme.role.ground)).toBeLessThan(luminance(theme.role.surface));
  });
});
