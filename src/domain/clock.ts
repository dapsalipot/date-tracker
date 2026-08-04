export interface Clock {
  /** Current time as integer epoch milliseconds. */
  nowMs(): number;
  /** Today's calendar date in the couple's timezone, as ISO YYYY-MM-DD. */
  todayLocal(): string;
}

/**
 * Time is injected rather than read from globals so that every date-boundary
 * behaviour — "capture creates today's draft", month attribution — is testable
 * deterministically instead of only at 11:59pm.
 */
export function systemClock(timezone: string): Clock {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return {
    nowMs: () => Date.now(),
    // formatToParts reads fields by name instead of relying on a locale's
    // field order. `en-CA` happens to render YYYY-MM-DD in current ICU, but
    // that is a locale convention rather than a guarantee — and React Native's
    // Hermes engine has patchier Intl support than Node, so a locale-string
    // approach can pass in tests and misformat on a real Android device.
    todayLocal: () => {
      const parts = formatter.formatToParts(new Date());
      const field = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value ?? '';
      return `${field('year')}-${field('month')}-${field('day')}`;
    },
  };
}

export function fixedClock(nowMs: number, todayLocal: string): Clock {
  return { nowMs: () => nowMs, todayLocal: () => todayLocal };
}
