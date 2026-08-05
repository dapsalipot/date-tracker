/**
 * The couple a query is scoped to, plus the currency its totals are expressed
 * in. Summing amount_minor across currencies is meaningless — ₱100 and ¥10000
 * are both 10000 minor units — so every aggregation filters on currency.
 *
 * `LocalContext` satisfies this structurally, so callers pass their context.
 */
export interface CoupleScope {
  readonly coupleId: string;
  readonly currencyCode: string;
}
