import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, testDeps } from '@/test/testDb';
import { dates } from '@/db/schema';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { deleteStop, updateStop } from '@/domain/stops/edit';
import { buildReceiptViewModel } from './receipt';

const TODAY = '2026-08-14';
const DEPS = testDeps(Date.parse('2026-08-14T12:00:00Z'), TODAY, 'r');

function setup() {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, DEPS);
  const first = captureStop(db, DEPS, {
    coupleId: ctx.coupleId, userId: ctx.userId,
    kind: 'food', amountMinor: 42000, currencyCode: 'PHP',
  });
  const second = captureStop(db, DEPS, {
    coupleId: ctx.coupleId, userId: ctx.userId,
    kind: 'transport', amountMinor: 8000, currencyCode: 'PHP',
  });
  db.update(dates).set({ title: 'Tagaytay', rating: 5 }).where(eq(dates.id, first.dateId)).run();
  return {
    db, ctx, dateId: first.dateId, foodStop: first.stopId, rideStop: second.stopId,
    scope: { coupleId: ctx.coupleId, currencyCode: ctx.currencyCode },
  };
}

describe('buildReceiptViewModel', () => {
  it('returns null for a date that does not exist', () => {
    const { db, scope } = setup();
    expect(buildReceiptViewModel(db, scope, 'nope', 'exact', TODAY)).toBeNull();
  });

  it('lists stops in timeline order with their labels', () => {
    const { db, scope, dateId, foodStop } = setup();
    updateStop(db, DEPS, foodStop, { label: 'Bag of Beans', placeName: 'Tagaytay', subkind: 'cafe' });

    const vm = buildReceiptViewModel(db, scope, dateId, 'exact', TODAY)!;

    expect(vm.title).toBe('Tagaytay');
    expect(vm.rating).toBe(5);
    expect(vm.stopCount).toBe(2);
    expect(vm.lines.map((l) => l.label)).toEqual(['Bag of Beans', 'transport']);
    expect(vm.lines[0]?.detail).toBe('Tagaytay · cafe');
  });

  it('falls back to the kind when a stop has no label', () => {
    const { db, scope, dateId } = setup();
    const vm = buildReceiptViewModel(db, scope, dateId, 'exact', TODAY)!;
    expect(vm.lines[0]?.label).toBe('food');
    expect(vm.lines[0]?.detail).toBeNull();
  });

  it('shows real amounts and a grand total in exact mode', () => {
    const { db, scope, dateId } = setup();

    const vm = buildReceiptViewModel(db, scope, dateId, 'exact', TODAY)!;

    expect(vm.lines.map((l) => l.money)).toEqual(['₱420.00', '₱80.00']);
    expect(vm.total).toBe('₱500.00');
  });

  it('hides the grand total in tier mode', () => {
    const { db, scope, dateId } = setup();

    const vm = buildReceiptViewModel(db, scope, dateId, 'tier', TODAY)!;

    // Spec §7.5: tier mode shows per-line symbols and NO grand total. A total
    // alongside tiers would let a reader reconstruct what the tiers hide.
    expect(vm.total).toBeNull();
    expect(vm.people.every((p) => p.money === null)).toBe(true);
  });

  it('shows no monetary content at all in hidden mode', () => {
    const { db, scope, dateId } = setup();

    const vm = buildReceiptViewModel(db, scope, dateId, 'hidden', TODAY)!;

    expect(vm.total).toBeNull();
    expect(vm.lines.every((l) => l.money === null)).toBe(true);
    expect(vm.people.every((p) => p.money === null)).toBe(true);
    // The story still renders — labels, place, rating are not monetary.
    expect(vm.lines.map((l) => l.label)).toEqual(['food', 'transport']);
  });

  it('renders a tier symbol once a kind has enough history', () => {
    const { db, scope, dateId, ctx } = setup();
    // Six food stops on their own earlier dates, spanning 100..600 pesos, so
    // the 420 on this date lands in the middle tier.
    for (let i = 0; i < 6; i += 1) {
      const day = `2026-07-0${i + 1}`;
      captureStop(db, testDeps(Date.parse(`${day}T12:00:00Z`), day, `h${i}`), {
        coupleId: ctx.coupleId, userId: ctx.userId,
        kind: 'food', amountMinor: (i + 1) * 10000, currencyCode: 'PHP',
      });
    }

    const vm = buildReceiptViewModel(db, scope, dateId, 'tier', TODAY)!;

    expect(vm.lines[0]?.money).toBe('₱₱');
  });

  it('shows nothing for a kind with too little history, even in tier mode', () => {
    const { db, scope, dateId } = setup();

    const vm = buildReceiptViewModel(db, scope, dateId, 'tier', TODAY)!;

    // Only this date's two stops exist, so neither kind clears the sample
    // floor. Spec §7.5: fall back to hidden rather than show noise.
    expect(vm.lines.map((l) => l.money)).toEqual([null, null]);
  });

  it('attributes every stop to whoever paid', () => {
    const { db, scope, dateId } = setup();

    const vm = buildReceiptViewModel(db, scope, dateId, 'exact', TODAY)!;

    // v1 has one local user, so this is one row — but the shape is what v2
    // grows a second row into.
    expect(vm.people).toHaveLength(1);
    expect(vm.people[0]?.money).toBe('₱500.00');
    expect(vm.people[0]?.name.length).toBeGreaterThan(0);
  });

  it('excludes tombstoned stops from lines and totals', () => {
    const { db, scope, dateId, rideStop } = setup();
    deleteStop(db, DEPS, rideStop);

    const vm = buildReceiptViewModel(db, scope, dateId, 'exact', TODAY)!;

    expect(vm.lines).toHaveLength(1);
    expect(vm.stopCount).toBe(1);
    expect(vm.total).toBe('₱420.00');
  });

  it('excludes tombstoned stops from the per-person subtotals too', () => {
    const { db, scope, dateId, rideStop } = setup();
    deleteStop(db, DEPS, rideStop);

    const vm = buildReceiptViewModel(db, scope, dateId, 'exact', TODAY)!;

    // `people` comes from its own query, with its own tombstone filter. If
    // that filter goes, the receipt shows a grand total of ₱420 sitting above
    // a "paid by" line reading ₱500 — the same image contradicting itself.
    expect(vm.people[0]?.money).toBe('₱420.00');
    expect(vm.people[0]?.money).toBe(vm.total);
  });
});
