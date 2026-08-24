import type { RegisteredFont } from './fonts';

// Typed against `RegisteredFont`, not `as const`: a typo or a rename here
// (e.g. to a real @expo-google-fonts/nunito export that `app/_layout.tsx`
// doesn't register) fails `tsc` instead of silently falling back to the
// system font on device — see fonts.ts.
const family: Record<'regular' | 'semi' | 'bold' | 'extra', RegisteredFont> = {
  regular: 'Nunito_400Regular',
  semi: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extra: 'Nunito_800ExtraBold',
};

const type = {
  display: { fontSize: 34, lineHeight: 38, letterSpacing: 0, fontFamily: family.extra },
  title: { fontSize: 22, lineHeight: 28, letterSpacing: 0, fontFamily: family.extra },
  // Between title and body: a list card's own title needs presence without
  // claiming headline size on a card that's half the screen wide. Bold, not
  // extra — extra stays reserved for the two genuine headline sizes above.
  subtitle: { fontSize: 17, lineHeight: 22, letterSpacing: 0, fontFamily: family.bold },
  body: { fontSize: 16, lineHeight: 24, letterSpacing: 0, fontFamily: family.regular },
  meta: { fontSize: 13, lineHeight: 18, letterSpacing: 0, fontFamily: family.semi },
  micro: { fontSize: 11, lineHeight: 14, letterSpacing: 1.5, fontFamily: family.bold },
} as const;

const motion = { fast: 120, base: 220 } as const;

/**
 * The receipt export's fixed palette — NOT legacy, despite living outside `role`/`kind`.
 * The spec puts the receipt image out of scope for the light/dark redesign: it gets
 * shared to Instagram, so it must look the same regardless of which theme the sender
 * had toggled on-device. Deliberately independent of `themes.ts` — do not migrate this
 * onto the active theme, and do not delete it as unused without re-checking
 * `src/render/receipt/ReceiptTemplate.tsx`, which reads every key here.
 */
const color = {
  ink: '#1F1A24',
  rose: '#E8927C',
  cream: '#FFFBF7',
  blush: '#F7E6E1',
  gold: '#C9A227',
  muted: '#A08E86',
  line: '#EADFD8',
} as const;

export const theme = {
  color,
  type,
  motion,
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64 },
  radius: { sm: 8, md: 12, lg: 18, xl: 24 },
  screenMargin: 20,
  /**
   * A standard iOS tab bar is 49pt above the home-indicator inset. `Screen`
   * sets safe-area edges to top/left/right only, deliberately — the tab bar
   * draws over the content — so anything scrollable has to add that room
   * back itself or its last row is clipped by the bar.
   */
  tabBarHeight: 49,
} as const;
