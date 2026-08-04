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
  return {
    nowMs: () => Date.now(),
    todayLocal: () =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
  };
}

export function fixedClock(nowMs: number, todayLocal: string): Clock {
  return { nowMs: () => nowMs, todayLocal: () => todayLocal };
}
