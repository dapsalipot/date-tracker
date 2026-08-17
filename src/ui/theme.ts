import type { StopKind } from '@/domain/stops/taxonomy';

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
 * Dates happen at night. A dark ground is honest to when the app is used,
 * flatters photographs, and lets saturated accents read without becoming candy.
 *
 * `surface` is the original brand plum, demoted from ground to card. On a dark
 * UI the floor must sit below the cards.
 */
const role = {
  ground: '#121016',
  surface: '#1E1B24',
  line: '#2C2833',
  ink: '#F5F2EE',
  inkMuted: '#8A8290',
  /** The second brand colour: actions, key numbers, FAB, active tab. */
  primary: '#FF6B4A',
  onPrimary: '#1A0A05',
} as const;

/**
 * Six kinds, six hues, cool-shifted so warm-red stays the brand's alone.
 * These OUTLINE chips and FILL bars — never the reverse. Filled cool chips
 * beside a solid orange button turn a card into competing colour masses.
 */
const kind: Record<StopKind, string> = {
  food: '#F5C242',
  transport: '#6BD97F',
  activity: '#3DD6C4',
  shopping: '#5B9DFF',
  gift: '#C77DFF',
  other: '#8A8290',
};

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
  kind,
  motion,
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64 },
  radius: { sm: 6, md: 10, lg: 14 },
  screenMargin: 20,
} as const;
