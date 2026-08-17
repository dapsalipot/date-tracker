import { describe, expect, it } from 'vitest';
import { theme } from './theme';

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
    expect(ratio).toBeLessThanOrEqual(0.5);
  });

  it('gives every step a line height taller than its size', () => {
    for (const step of Object.values(theme.type)) {
      expect(step.lineHeight).toBeGreaterThan(step.fontSize);
    }
  });

  it('letterspaces micro, and only micro', () => {
    expect(theme.type.micro.letterSpacing).toBeGreaterThan(0);
    expect(theme.type.display.letterSpacing ?? 0).toBe(0);
  });
});
