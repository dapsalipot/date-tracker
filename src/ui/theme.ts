const type = {
  display: { fontSize: 34, lineHeight: 38, letterSpacing: 0, fontWeight: '800' as const },
  title: { fontSize: 22, lineHeight: 28, letterSpacing: 0, fontWeight: '800' as const },
  body: { fontSize: 16, lineHeight: 24, letterSpacing: 0, fontWeight: '400' as const },
  meta: { fontSize: 13, lineHeight: 18, letterSpacing: 0, fontWeight: '600' as const },
  micro: { fontSize: 11, lineHeight: 14, letterSpacing: 1.5, fontWeight: '700' as const },
} as const;

const motion = { fast: 120, base: 220 } as const;

export const theme = {
  type,
  motion,
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64 },
  radius: { sm: 8, md: 12, lg: 18, xl: 24 },
  screenMargin: 20,
} as const;
