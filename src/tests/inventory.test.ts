import { advance, applyCommand } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { BAD_LOT_PERCENT, BASE_SHELF_PACKS, BULK_DAYS, BULK_MIN_PACKS, BULK_PERCENT, RACK_SHELF_PACKS, SHORTAGE_PERCENT, STARTER_STOCK, STATION_SHELF_PACKS, STOCK, EXPRESS_MINUTES, EXPRESS_PERCENT, SUPPLY_NEWS_EVERY } from '../data/inventory';
import { dailyResidentCosts } from '../sim/systems/billing';
import { arrivalOf, incoming, inventoryDayEnd, onHand, orderCost, projectedDailyUse, shelfCapacity, shelfFree, shelfUsed, stockLevels, supplyNewsFor, takeStock } from '../sim/systems/inventory';
import { reconcile } from '../domain/rules/ledger';
import { pctOf } from '../domain/money';
import type { CareGroup, GameState, ShiftSlot, StaffRole } from '../domain/types';
import { admitPlanned, buildHome, hire, ok, quietEvents } from './helpers';
import { MINUTES_PER_DAY } from '../sim/constants';
import { roomOpen } from '../sim/systems/support';

const STAFF: Array<[StaffRole, ShiftSlot[]]> = [
  ['rn', ['morning']],
  ['rn', ['afternoon']],
  ['caregiver', ['morning']],
  ['caregiver', ['afternoon']],
  ['caregiver', ['night']],
  ['pt', ['morning']],
  ['ot', ['morning']],
  ['pn', ['morning']],
  ['caregiver', ['morning']],
];
const GROUPS: CareGroup[] = ['active_aging', 'stroke_rehab', 'bedridden'];

function home(stock: boolean, n = 10): GameState {
  let s = quietEvents(buildHome(createInitialState(41)));
  if (stock) s = ok(s, { type: 'setInventory', on: true });
  for (const [role, slots] of STAFF) [s] = hire(s, role, slots);
  for (let i = 0; i < n; i++) {
    const g = GROUPS[i % 3];
    [s] = admitPlanned(s, { group: g, careLevel: g === 'active_aging' ? 2 : g === 'stroke_rehab' ? 3 : 4 });
  }
  return s;
}

const inv = (s: GameState) => s.inventory!;
const spent = (s: GameState, cat: string) => -s.ledger.filter((e) => e.category === cat).reduce((a, e) => a + e.amountSatang, 0);

describe('stock room', () => {
  it('opens with a free starter kit and replaces the flat daily supplies charge', () => {
    const s = ok(createInitialState(1), { type: 'setInventory', on: true });
    for (const [item, qty] of Object.entries(STARTER_STOCK)) expect(onHand(inv(s), item as keyof typeof STOCK)).toBe(qty);
    expect(s.organization.cashSatang).toBe(createInitialState(1).organization.cashSatang);

    const off = home(false);
    const on = home(true);
    const a = advance(off, 144 * 10);
    const b = advance(on, 144 * 10);
    expect(a.ledger.filter((e) => e.memo === 'ledger.supplies')).toHaveLength(10);
    expect(b.ledger.filter((e) => e.memo === 'ledger.supplies')).toHaveLength(0);
    expect(b.ledger.some((e) => e.memo === 'ledger.stock_order')).toBe(true);
    // The forecast follows the stock bought for today's care plans.
    expect(dailyResidentCosts(on).supplies).toBeGreaterThan(0);
    expect(reconcile(b).ok).toBe(true);
  });

  it('a task uses its stock when it starts, earliest expiry first', () => {
    let s = ok(createInitialState(1), { type: 'setInventory', on: true });
    s = { ...s, inventory: { ...inv(s), lots: { ...inv(s).lots, gloves: [{ qty: 1, expiresDay: 5 }, { qty: 5, expiresDay: 50 }] } } };
    const after = takeStock(inv(s), 'personal_care')!;
    expect(after.lots.gloves).toEqual([{ qty: 5, expiresDay: 50 }]);
    expect(after.lots.diapers![0].qty).toBe(STARTER_STOCK.diapers! - 1);
    expect(after.month.used).toEqual({ gloves: 1, diapers: 1 });
    expect(takeStock({ ...after, lots: { ...after.lots, diapers: [] } }, 'personal_care')).toBeNull();
    // Activities need nothing.
    expect(takeStock({ ...after, lots: {} }, 'activity')).toEqual({ ...after, lots: {} });
  });

  it('without stock, care cannot start: the tasks are missed and the home is warned', () => {
    let s = home(true);
    s = ok(s, { type: 'setStockAuto', on: false });
    s = { ...s, inventory: { ...inv(s), lots: {} } };
    const day = advance(s, 144);
    const full = advance(ok(home(true), { type: 'setStockAuto', on: true }), 144);
    expect(day.history.at(-1)!.missed).toBeGreaterThan(full.history.at(-1)!.missed + 20);
    expect(day.log.filter((l) => l.key === 'log.stockout').length).toBeGreaterThan(0);
    // One warning per item per day.
    const items = day.log.filter((l) => l.key === 'log.stockout').map((l) => `${l.params!.item}@${Math.floor(l.at / MINUTES_PER_DAY)}`);
    expect(new Set(items).size).toBe(items.length);
  });

  it('regular orders arrive at 08:00 the next day; express in two hours at a premium', () => {
    let s = ok(createInitialState(1), { type: 'setInventory', on: true });
    s = ok(s, { type: 'setStockAuto', on: false });
    const cash = s.organization.cashSatang;
    const r = applyCommand(s, { type: 'orderStock', item: 'ppe', packs: 2 });
    expect(r.result).toEqual({ ok: true, costSatang: STOCK.ppe.packSatang * 2 });
    s = r.state;
    expect(s.organization.cashSatang).toBe(cash - STOCK.ppe.packSatang * 2);
    expect(incoming(inv(s), 'ppe')).toBe(40);
    const dayStart = Math.ceil(s.minute / MINUTES_PER_DAY) * MINUTES_PER_DAY;
    expect(inv(s).orders[0].arriveAt).toBe(dayStart + 8 * 60);
    s = advance(s, (dayStart + 7 * 60 - s.minute) / 10);
    expect(onHand(inv(s), 'ppe')).toBe(0);
    s = advance(s, 6);
    expect(onHand(inv(s), 'ppe')).toBe(40);
    expect(inv(s).orders).toHaveLength(0);

    const x = applyCommand(s, { type: 'orderStock', item: 'feeding', packs: 1, express: true });
    expect(x.result).toEqual({ ok: true, costSatang: pctOf(STOCK.feeding.packSatang, EXPRESS_PERCENT) });
    const later = advance(x.state, EXPRESS_MINUTES / 10);
    expect(onHand(inv(later), 'feeding')).toBe(STOCK.feeding.pack);
  });

  it('rejects bad orders and orders without a stock room', () => {
    const s = createInitialState(1);
    expect(applyCommand(s, { type: 'orderStock', item: 'ppe', packs: 1 }).result).toEqual({ ok: false, reason: 'inventory_off' });
    const on = ok(s, { type: 'setInventory', on: true });
    expect(applyCommand(on, { type: 'orderStock', item: 'ppe', packs: 0 }).result.ok).toBe(false);
    expect(applyCommand(on, { type: 'orderStock', item: 'ppe', packs: 1.5 }).result.ok).toBe(false);
    const broke = { ...on, organization: { ...on.organization, cashSatang: 0 } };
    expect(applyCommand(broke, { type: 'orderStock', item: 'ppe', packs: 1 }).result).toEqual({ ok: false, reason: 'insufficient_funds' });
    expect(applyCommand(on, { type: 'setStockLevel', item: 'ppe', levels: { min: 5, max: 2 } }).result.ok).toBe(false);
  });

  it('throws away expired stock at midnight and counts it as waste', () => {
    let s = ok(createInitialState(1), { type: 'setInventory', on: true });
    s = { ...s, inventory: { ...inv(s), lots: { medkit: [{ qty: 7, expiresDay: 1 }, { qty: 3, expiresDay: 9 }] } } };
    s = inventoryDayEnd(s, 1);
    expect(inv(s).lots.medkit).toEqual([{ qty: 3, expiresDay: 9 }]);
    expect(inv(s).month.wasted.medkit).toBe(7);
    expect(s.log.at(-1)!.key).toBe('log.stock_expired');
  });

  it('closes a month-end count with opening, movements and closing stock', () => {
    let s = home(true);
    s = advance(s, 144 * 31);
    const rep = inv(s).reports[0];
    expect(rep.month).toBe(1);
    for (const item of ['gloves', 'diapers', 'medkit'] as const) {
      const flow = (rep.opening[item] ?? 0) + (rep.received[item] ?? 0) - (rep.used[item] ?? 0) - (rep.wasted[item] ?? 0);
      expect(rep.closing[item]).toBe(flow);
    }
    expect(rep.spentSatang).toBe(spent({ ...s, ledger: s.ledger.filter((e) => e.at < 30 * MINUTES_PER_DAY) }, 'supplies'));
    expect(inv(s).month.month).toBe(2);
  });

  it('player levels override the automatic reorder point', () => {
    let s = home(true);
    const auto = stockLevels(s, 'gloves');
    expect(auto.auto).toBe(true);
    expect(auto.min).toBeGreaterThan(0);
    s = ok(s, { type: 'setStockLevel', item: 'gloves', levels: { min: 9, max: 12 } });
    expect(stockLevels(s, 'gloves')).toEqual({ min: 9, max: 12, auto: false });
    s = ok(s, { type: 'setStockLevel', item: 'gloves', levels: null });
    expect(stockLevels(s, 'gloves').auto).toBe(true);
    expect(projectedDailyUse(s).gloves).toBeGreaterThan(0);
  });

  it('with auto reorder, 60 days run as well as the flat charge, at a similar cost', () => {
    const off = advance(home(false), 144 * 60);
    const on = advance(home(true), 144 * 60);
    const missed = (s: GameState) => s.history.reduce((a, d) => a + d.missed, 0);
    expect(missed(on)).toBeLessThanOrEqual(missed(off) + 5);
    expect(on.log.filter((l) => l.key === 'log.stockout').length).toBe(0);
    const ratio = spent(on, 'supplies') / spent(off, 'supplies');
    expect(ratio).toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(1.3);
    expect(reconcile(on).ok).toBe(true);
  });

  it('shelf space limits what can be stored and ordered; storage-room racks add space', () => {
    let s = home(true);
    s = ok(s, { type: 'setStockAuto', on: false });
    const stations = s.site.rooms.filter((r) => r.type === 'nursing_station').length;
    expect(shelfCapacity(s)).toBe(BASE_SHELF_PACKS + STATION_SHELF_PACKS * stations);
    // A part-used pack takes a whole place.
    expect(shelfUsed(inv(s))).toBe(Object.entries(STARTER_STOCK).reduce((a, [i, q]) => a + Math.ceil(q! / STOCK[i as keyof typeof STOCK].pack), 0));
    const free = shelfFree(s);
    expect(applyCommand(s, { type: 'orderStock', item: 'gloves', packs: free + 1 }).result).toEqual({ ok: false, reason: 'no_space' });
    s = ok(s, { type: 'orderStock', item: 'gloves', packs: free });
    expect(shelfFree(s)).toBe(0);
    // A storage room (the prefab has two racks) adds 60 places a rack.
    let stored: GameState | null = null;
    for (let y = 0; y < 20 && !stored; y++)
      for (let x = 0; x < 20 && !stored; x++) {
        const out = applyCommand(s, { type: 'placePrefab', prefab: 'storage', origin: { x, y } });
        if (out.result.ok && roomOpen(out.state, 'storage_room')) stored = out.state;
      }
    expect(shelfFree(stored!)).toBe(RACK_SHELF_PACKS * 2);
  });

  it('the wholesaler is cheaper and slower, with a minimum order', () => {
    const s = ok(ok(createInitialState(1), { type: 'setInventory', on: true }), { type: 'setStockAuto', on: false });
    expect(applyCommand(s, { type: 'orderStock', item: 'gloves', packs: BULK_MIN_PACKS - 1, bulk: true }).result).toEqual({ ok: false, reason: 'min_order', params: { n: BULK_MIN_PACKS } });
    expect(orderCost(s, 'gloves', 5, 'bulk')).toBe(pctOf(STOCK.gloves.packSatang * 5, BULK_PERCENT));
    const dayStart = Math.floor(s.minute / MINUTES_PER_DAY) * MINUTES_PER_DAY;
    expect(arrivalOf(s, 'gloves', 'bulk')).toBe(dayStart + BULK_DAYS * MINUTES_PER_DAY + 8 * 60);
    expect(arrivalOf(s, 'gloves')).toBe(dayStart + MINUTES_PER_DAY + 8 * 60);
  });

  it('supply news: shortages make an item dearer and a day slower; a bad lot spoils part of the next delivery', () => {
    let s = ok(home(true), { type: 'setStockAuto', on: false });
    const day = Math.floor(s.minute / MINUTES_PER_DAY) + 1;
    s = { ...s, inventory: { ...inv(s), shortage: { item: 'gloves', untilDay: day } } };
    expect(orderCost(s, 'gloves', 1)).toBe(pctOf(STOCK.gloves.packSatang, SHORTAGE_PERCENT));
    expect(orderCost(s, 'gloves', 1, 'express')).toBe(pctOf(STOCK.gloves.packSatang, EXPRESS_PERCENT));
    const dayStart = (day - 1) * MINUTES_PER_DAY;
    expect(arrivalOf(s, 'gloves')).toBe(dayStart + 2 * MINUTES_PER_DAY + 8 * 60);
    s = { ...s, inventory: { ...inv(s), shortage: undefined, badLot: 'feeding' } };
    s = ok(s, { type: 'orderStock', item: 'feeding', packs: 2, express: true });
    const before = onHand(inv(s), 'feeding');
    s = advance(s, EXPRESS_MINUTES / 10);
    const spoiled = Math.round((20 * BAD_LOT_PERCENT) / 100);
    expect(inv(s).badLot).toBeUndefined();
    expect(inv(s).month.wasted.feeding).toBe(spoiled);
    expect(onHand(inv(s), 'feeding')).toBeLessThanOrEqual(before + 20 - spoiled);
    expect(s.log.some((l) => l.key === 'log.stock_bad_lot')).toBe(true);
  });

  it('supply news comes about one day in twelve, from a hash (never the PRNG)', () => {
    const s = home(true);
    const days = Array.from({ length: 600 }, (_, i) => i + 5).filter((d) => supplyNewsFor(s, d));
    expect(days.length).toBeGreaterThan(600 / SUPPLY_NEWS_EVERY / 2);
    expect(days.length).toBeLessThan((600 / SUPPLY_NEWS_EVERY) * 2);
    expect(supplyNewsFor(s, 3)).toBeNull();
    // Same answer every time for the same seed and day.
    expect(days.map((d) => supplyNewsFor(s, d))).toEqual(days.map((d) => supplyNewsFor(s, d)));
  });
});
