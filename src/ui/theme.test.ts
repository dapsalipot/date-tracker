import { describe, expect, it } from 'vitest';
import { theme } from './theme';
import { STOP_KINDS } from '@/domain/stops/taxonomy';
import { contrastRatio } from './contrast';
import { darkTheme, lightTheme, themes, type Theme } from './themes';

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

const AA_TEXT = 4.5;
const AA_LARGE = 3;
// Not a legibility tier like the two above — this only guards "not the same
// colour as the button," so it sits far below WCAG's weakest ratio. Set from
// the real palettes: the tightest of all twelve kind-vs-primary pairs is
// light's gift (#7A3FA8) against primary (#A61B34) at 1.098:1, which clears
// 1.05 comfortably while sitting nowhere near a 1:1 collision.
const MIN_KIND_PRIMARY_SEPARATION = 1.05;

function keyPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix];
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([k, v]) => keyPaths(v, prefix === '' ? k : `${prefix}.${k}`))
    .sort();
}

describe('themes', () => {
  it.each([['light', lightTheme], ['dark', darkTheme]] as const)(
    '%s keeps body text legible on both ground and surface',
    (_name, t: Theme) => {
      for (const ink of [t.role.ink, t.role.inkMuted]) {
        expect(contrastRatio(ink, t.role.ground)).toBeGreaterThanOrEqual(AA_TEXT);
        expect(contrastRatio(ink, t.role.surface)).toBeGreaterThanOrEqual(AA_TEXT);
      }
    },
  );

  it.each([['light', lightTheme], ['dark', darkTheme]] as const)(
    '%s can put a label on its primary button',
    (_name, t: Theme) => {
      expect(contrastRatio(t.role.onPrimary, t.role.primary)).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );

  it.each([['light', lightTheme], ['dark', darkTheme]] as const)(
    '%s shows its accent against the ground',
    (_name, t: Theme) => {
      expect(contrastRatio(t.role.primary, t.role.ground)).toBeGreaterThanOrEqual(AA_LARGE);
    },
  );

  it.each([['light', lightTheme], ['dark', darkTheme]] as const)(
    '%s keeps every kind readable as chip text',
    (_name, t: Theme) => {
      // 4.5 and not 3, because a kind colour renders as an 11pt chip LABEL,
      // not merely as a bar fill. The first gold tried here, #B07A12, measured
      // 3.41:1 and was unreadable.
      for (const k of STOP_KINDS) {
        expect(contrastRatio(t.kind[k], t.role.surface)).toBeGreaterThanOrEqual(AA_TEXT);
      }
    },
  );

  it.each([['light', lightTheme], ['dark', darkTheme]] as const)(
    '%s keeps every kind colour distinct from the others',
    (_name, t: Theme) => {
      // Two kinds sharing a hex makes the spending breakdown ambiguous — a bar
      // chart where food and gift render as the same colour.
      const used = STOP_KINDS.map((k) => t.kind[k].toUpperCase());
      expect(new Set(used).size).toBe(used.length);
    },
  );

  it.each([['light', lightTheme], ['dark', darkTheme]] as const)(
    '%s keeps every kind clear of the primary accent',
    (_name, t: Theme) => {
      // Kinds stay clear of red so the accent owns that end of the spectrum
      // alone. Exact-string inequality is too weak to guard this — two colours
      // can be visually indistinguishable without matching strings — so this
      // checks perceptual separation via contrastRatio instead of `!==`.
      for (const k of STOP_KINDS) {
        expect(contrastRatio(t.kind[k], t.role.primary)).toBeGreaterThanOrEqual(
          MIN_KIND_PRIMARY_SEPARATION,
        );
      }
    },
  );

  it('gives both themes identical shapes', () => {
    // A key present in one theme and missing from the other is a crash on
    // whichever screen reads it, on whichever theme the user happens to pick.
    //
    // `lift` is excluded here and checked separately below: it is `Lift | null`
    // by design, an object in light and a bare `null` in dark, so its own
    // internal shape necessarily diverges between themes. Diffing it here would
    // fail on the intended difference rather than on an accidental one.
    const { lift: _darkLift, ...darkRest } = darkTheme;
    const { lift: _lightLift, ...lightRest } = lightTheme;
    expect(keyPaths(darkRest)).toEqual(keyPaths(lightRest));
  });

  it('covers every stop kind in both themes', () => {
    for (const t of [lightTheme, darkTheme]) {
      for (const k of STOP_KINDS) expect(t.kind[k]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('lifts cards in light and refuses to in dark', () => {
    // A shadow on a near-black ground is invisible, and a glow standing in for
    // one looks like a rendering bug. Depth in dark comes from surface + line.
    expect(lightTheme.lift).not.toBeNull();
    expect(darkTheme.lift).toBeNull();
  });

  it('is reachable by name', () => {
    expect(themes.light).toBe(lightTheme);
    expect(themes.dark).toBe(darkTheme);
  });
});
