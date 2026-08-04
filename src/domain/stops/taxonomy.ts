export const STOP_KINDS = ['food', 'transport', 'activity', 'shopping', 'gift', 'other'] as const;

export type StopKind = (typeof STOP_KINDS)[number];

/**
 * Two levels by design. `kind` is chosen during quick-capture (six chips) and is
 * effectively permanent once data exists. `subkind` is optional, set later in the
 * composer, and can be added or renamed without breaking historical roll-ups.
 */
export const SUBKINDS: Readonly<Record<StopKind, readonly string[]>> = {
  food: ['restaurant', 'cafe', 'dessert', 'street', 'groceries'],
  transport: ['grab', 'fuel', 'toll', 'parking', 'jeep', 'bus'],
  activity: ['tickets', 'movie', 'videoke', 'sports', 'event'],
  shopping: ['clothes', 'books', 'home', 'other'],
  gift: ['flowers', 'jewelry', 'surprise'],
  other: [],
};

export function isValidSubkind(kind: StopKind, subkind: string): boolean {
  return SUBKINDS[kind].includes(subkind);
}
