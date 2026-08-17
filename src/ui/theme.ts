/**
 * Hierarchy comes from ratio, not ornament. Five steps with deliberate gaps —
 * the previous 28/20/16 was descending but so tightly spaced that nothing read
 * as dominant, which is most of why the app looked unstyled.
 */
const type = {
  display: { fontSize: 34, lineHeight: 36, letterSpacing: 0 },
  title: { fontSize: 22, lineHeight: 28, letterSpacing: 0 },
  body: { fontSize: 16, lineHeight: 24, letterSpacing: 0 },
  meta: { fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  micro: { fontSize: 11, lineHeight: 14, letterSpacing: 1.5 },
} as const;

/**
 * The same palette addressed by meaning. Screens ask for a role, so a colour
 * decision changes in one place. `gold` has exactly one job — marking a date as
 * published — which is what keeps it meaningful.
 */
const role = {
  ground: '#FFFBF7',
  ink: '#1F1A24',
  inkMuted: '#A08E86',
  rule: '#EADFD8',
  accent: '#E8927C',
  accentQuiet: '#F7E6E1',
  gold: '#C9A227',
} as const;

const motion = {
  fast: 120,
  base: 220,
} as const;

export const theme = {
  color: {
    ink: '#1F1A24',
    rose: '#E8927C',
    cream: '#FFFBF7',
    blush: '#F7E6E1',
    gold: '#C9A227',
    muted: '#A08E86',
    line: '#EADFD8',
  },
  type,
  role,
  motion,
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64 },
  radius: { sm: 6, md: 10, lg: 14 },
  screenMargin: 20,
} as const;
