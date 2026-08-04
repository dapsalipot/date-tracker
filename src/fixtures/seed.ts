import { fixedClock } from '@/domain/clock';
import { captureStop } from '@/domain/dates/repository';
import { setBudget } from '@/domain/budget/status';
import { periodMonthFor } from '@/domain/budget/period';
import type { AppDatabase } from '@/db/types';
import type { StopKind } from '@/domain/stops/taxonomy';

interface Template {
  kind: StopKind;
  subkind: string;
  label: string;
  placeName: string;
  baseMinor: number;
}

const TEMPLATES: readonly Template[] = [
  { kind: 'food', subkind: 'cafe', label: 'Morning coffee', placeName: 'Bo\'s Coffee', baseMinor: 42000 },
  { kind: 'food', subkind: 'restaurant', label: 'Lunch', placeName: 'Bag of Beans', baseMinor: 124000 },
  { kind: 'food', subkind: 'dessert', label: 'Milk tea', placeName: 'Macao Imperial', baseMinor: 32000 },
  { kind: 'transport', subkind: 'fuel', label: 'Gas', placeName: 'Shell', baseMinor: 68000 },
  { kind: 'transport', subkind: 'grab', label: 'Grab ride', placeName: 'Grab', baseMinor: 38000 },
  { kind: 'activity', subkind: 'movie', label: 'Cinema', placeName: 'SM Cinema', baseMinor: 56000 },
  { kind: 'activity', subkind: 'videoke', label: 'Videoke', placeName: 'Centerstage', baseMinor: 90000 },
  { kind: 'shopping', subkind: 'clothes', label: 'Uniqlo run', placeName: 'Uniqlo', baseMinor: 149000 },
  { kind: 'gift', subkind: 'flowers', label: 'Flowers', placeName: 'Dangwa', baseMinor: 75000 },
];

/**
 * Deterministic pseudo-random in [0, 1) so fixtures are reproducible.
 *
 * mulberry32, not the usual `Math.sin(seed * 12.9898)` trick: ECMA-262 does not
 * require Math.sin to be correctly rounded, so a sin-based generator can produce
 * different fixtures in Node (V8) than on-device (Hermes). This uses only
 * Math.imul, XOR and shifts, all of which are bit-exact per spec.
 */
function seededUnit(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shiftDays(isoDate: string, days: number): string {
  const [y = '0', m = '0', d = '0'] = isoDate.split('-');
  const base = Date.UTC(Number(y), Number(m) - 1, Number(d));
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Seeds roughly a year of realistic history. Without this the dashboard cannot
 * be developed without hand-logging fifty dates, and charts get shipped having
 * only ever been seen with three data points.
 */
export function seedTwelveMonths(
  db: AppDatabase,
  coupleId: string,
  userId: string,
  endDate: string,
): void {
  const dateCount = 48;
  const months = new Set<string>();

  for (let i = 0; i < dateCount; i += 1) {
    const day = shiftDays(endDate, -i * 7 - Math.floor(seededUnit(i) * 3));
    // Derived from the day actually generated. A parallel loop over un-jittered
    // offsets can miss a month: jitter only moves dates earlier, so the oldest
    // sample can land in a month no budget was ever created for.
    months.add(periodMonthFor(day));
    const clock = fixedClock(Date.parse(`${day}T12:00:00Z`), day);

    const stopCount = 2 + Math.floor(seededUnit(i + 100) * 3);
    for (let s = 0; s < stopCount; s += 1) {
      const template = TEMPLATES[(i + s * 3) % TEMPLATES.length];
      if (!template) continue;

      const jitter = 0.8 + seededUnit(i * 10 + s) * 0.4;
      captureStop(db, clock, {
        coupleId,
        userId,
        kind: template.kind,
        subkind: template.subkind,
        label: template.label,
        placeName: template.placeName,
        amountMinor: Math.round((template.baseMinor * jitter) / 100) * 100,
        currencyCode: 'PHP',
      });
    }
  }

  const seedClock = fixedClock(Date.parse(`${endDate}T12:00:00Z`), endDate);
  for (const month of months) {
    setBudget(db, coupleId, month, 800000, seedClock);
  }
}
