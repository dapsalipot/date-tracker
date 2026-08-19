/**
 * Deliberately not theme tokens — same category as the receipt export's fixed
 * palette (`theme.ts`): a surface outside the theme system needs colours
 * outside the theme system. These sit on a photograph, not on the theme's
 * surface, and a photo looks the same in both themes. `t.role.onPrimary` is
 * `#FFFFFF` in light but `#1A1206` in dark — a "properly themed" caption
 * would go near-black in dark mode, on a dark scrim, over a possibly-dark
 * photo, and disappear. White (at full and reduced opacity) on a black scrim
 * is legible over any image in either theme, which is exactly why these are
 * fixed rather than themed.
 *
 * Shared by every place that overlays text on a photo — `CalendarGrid`'s
 * day-number badge and `FeedCard`'s hero caption — so this exception lives in
 * one place instead of two copies quietly drifting apart.
 */
export const PHOTO_SCRIM = 'rgba(0,0,0,0.45)';
export const ON_PHOTO = '#FFFFFF';
/** Secondary/muted text over a photo — same white, reduced opacity. */
export const ON_PHOTO_MUTED = 'rgba(255,255,255,0.85)';
