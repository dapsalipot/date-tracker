const family = {
  regular: 'Nunito_400Regular',
  semi: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extra: 'Nunito_800ExtraBold',
} as const;

const type = {
  display: { fontSize: 34, lineHeight: 38, letterSpacing: 0, fontFamily: family.extra },
  title: { fontSize: 22, lineHeight: 28, letterSpacing: 0, fontFamily: family.extra },
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
} as const;
