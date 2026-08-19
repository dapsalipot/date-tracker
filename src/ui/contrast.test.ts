import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance } from './contrast';

describe('contrastRatio', () => {
  it('gives black on white the maximum 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('gives a colour against itself 1:1', () => {
    expect(contrastRatio('#A61B34', '#A61B34')).toBeCloseTo(1, 6);
  });

  it('does not care which argument is lighter', () => {
    expect(contrastRatio('#A61B34', '#FFFFFF')).toBeCloseTo(
      contrastRatio('#FFFFFF', '#A61B34'),
      6,
    );
  });

  it('matches known WCAG values', () => {
    // Verified against the published formula; these anchor the implementation
    // so a refactor cannot quietly change what "passes AA" means.
    expect(contrastRatio('#FFFFFF', '#A61B34')).toBeCloseTo(7.4, 1);
    expect(contrastRatio('#2A2018', '#EFE4D4')).toBeCloseTo(12.7, 1);
  });

  it('applies the sRGB gamma curve, not a linear ramp', () => {
    // Mid grey is perceptually half but linearly ~0.216. A naive implementation
    // that skips the transfer function returns 0.5 here and every threshold
    // in the theme test silently shifts.
    expect(relativeLuminance('#808080')).toBeCloseTo(0.2159, 3);
  });

  it('reads all three channels', () => {
    // Green dominates luminance; a bug that reads only the red channel makes
    // pure green and pure red measure the same.
    expect(relativeLuminance('#00FF00')).toBeGreaterThan(relativeLuminance('#FF0000'));
  });
});
