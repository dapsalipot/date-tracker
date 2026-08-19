/**
 * The Nunito weights this app actually registers with `useFonts`, named once.
 * `app/_layout.tsx` maps every one of these names to a real font asset (and a
 * `Record<RegisteredFont, ...>` there fails to compile if that mapping is
 * incomplete), and `theme.ts` types every `family` entry as one of these
 * names. A `fontFamily` string can then never name a weight nothing loads —
 * previously `family.extra` could be repointed at any string, including a
 * real package export that simply isn't registered, and `tsc` plus the whole
 * suite would stay green while every heading silently fell back to the
 * system font on device.
 */
export const REGISTERED_FONTS = [
  'Nunito_400Regular',
  'Nunito_600SemiBold',
  'Nunito_700Bold',
  'Nunito_800ExtraBold',
] as const;

export type RegisteredFont = (typeof REGISTERED_FONTS)[number];
