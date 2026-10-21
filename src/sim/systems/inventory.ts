import {
  BAD_LOT_PERCENT,
  BASE_SHELF_PACKS,
  BULK_DAYS,
  BULK_MIN_PACKS,
  BULK_PERCENT,
  PHARMACY_SHELF_PACKS,
  RACK_SHELF_PACKS,
  SHORTAGE_DAYS,
  SHORTAGE_PERCENT,
  STATION_SHELF_PACKS,
  SUPPLY_NEWS_EVERY,
  SUPPLY_NEWS_FROM_DAY,
  DELIVERY_HOUR,
  EXPRESS_LOOKAHEAD_MINUTES,
  EXPRESS_MINUTES,
  EXPRESS_PERCENT,
  MAX_COVER_DAYS,
  MIN_COVER_DAYS,
  STARTER_STOCK,
  STOCK,
  STOCK_ITEMS,
  STOCK_REPORTS_KEPT,
  TASK_STOCK,
} from '../../data/inventory';
import { carePlanSchedule } from '../../data/patients';
import { monthOfDay } from '../../data/finance';
import { pctOf } from '../../domain/money';
import type { CareTask, GameState, InventoryState, OrderKind, ReasonCode, StockCounts, StockItem, StockMonth, TaskKind } from '../../domain/types';
import { MINUTES_PER_DAY } from '../constants';
import { allocId, log, post } from '../helpers';
import { supplyPrice } from './billing';
import { allRoomStatuses } from '../../domain/rules/rooms';
import { dayOf } from './time';

/**
 * Stock room (care consumables).
 * - Care tasks use stock when they start; a task whose stock has run out cannot start (and is
 *   missed once its grace runs out), so running dry costs care quality.
 * - Stock is bought in packs: regular orders arrive at 08:00 the next day, express orders in two
 *   hours at a higher price. Orders are paid when placed (ledger: supplies).
 * - Each delivery keeps its own expiry day; the earliest-expiring stock is used first and anything
 *   past its day is thrown away at midnight.
 * - Auto reorder keeps 3–10 days of projected use on hand, and sends an express order when work due
 *   in the next four hours would otherwise go without.
 * - A month-end count (opening, received, used, expired, closing, value) is kept for six months.
 * Nothing here draws from the PRNG, so switching the stock room on never changes other random rolls.
 */

const add = (c: StockCounts, item: StockItem, n: number): StockCounts => ({ ...c, [item]: (c[item] ?? 0) + n });

function newMonth(month: number, opening: StockCounts): StockMonth {
  return { month, opening, received: {}, used: {}, wasted: {}, spentSatang: 0 };
}

export function onHand(inv: InventoryState, item: StockItem): number {
  return (inv.lots[item] ?? []).reduce((a, l) => a + l.qty, 0);
}

function allOnHand(inv: InventoryState): StockCounts {
  const out: StockCounts = {};
  for (const item of STOCK_ITEMS) out[item] = onHand(inv, item);
  return out;
}

/** Uses already ordered and on the way. */
export function incoming(inv: InventoryState, item: StockItem, by = Infinity): number {
  return inv.orders.filter((o) => o.item === item && o.arriveAt <= by).reduce((a, o) => a + o.packs * STOCK[item].pack, 0);
}

/** Open the stock room with a free starter kit. */
export function openInventory(state: GameState): GameState {
  const day = dayOf(state.minute);
  const lots: InventoryState['lots'] = {};
  for (const item of STOCK_ITEMS) {
    const qty = STARTER_STOCK[item] ?? 0;
    if (qty) lots[item] = [{ qty, expiresDay: day + STOCK[item].shelfDays }];
  }
  const inv: InventoryState = { on: true, auto: true, lots, orders: [], month: newMonth(monthOfDay(day), {}), reports: [] };
  return { ...state, inventory: { ...inv, month: newMonth(monthOfDay(day), allOnHand(inv)) } };
}

/** Switch the stock room on (reopening keeps what was left) or off (back to the flat daily charge). */
export function setInventory(state: GameState, on: boolean): GameState {
  if (!state.inventory) return on ? log(openInventory(state), 'good', 'log.stock_open') : state;
  return { ...state, inventory: { ...state.inventory, on } };
}

/** Uses of each item one day of today's care plans needs. */
export function projectedDailyUse(state: GameState): StockCounts {
  const out: StockCounts = {};
  for (const r of state.residents) {
    if (!r.carePlan) continue;
    for (const [kind] of carePlanSchedule(r.group, r.careLevel))
      for (const [item, n] of Object.entries(TASK_STOCK[kind] ?? {}) as [StockItem, number][]) out[item] = (out[item] ?? 0) + n;
  }
  return out;
}

/** Average spend per day on stock at today's care plans (for forecasts). */
export function stockCostPerDay(state: GameState): number {
  const use = projectedDailyUse(state);
  let total = 0;
  for (const item of STOCK_ITEMS) total += Math.round(((use[item] ?? 0) * STOCK[item].packSatang) / STOCK[item].pack);
  return supplyPrice(state, total);
}

/** Reorder point and order-up-to level, in packs. */
export function stockLevels(state: GameState, item: StockItem): { min: number; max: number; auto: boolean } {
  const set = state.inventory?.levels?.[item];
  if (set) return { ...set, auto: false };
  const daily = projectedDailyUse(state)[item] ?? 0;
  if (!daily) return { min: 0, max: 0, auto: true };
  const min = Math.ceil((daily * MIN_COVER_DAYS) / STOCK[item].pack);
  return { min, max: Math.max(min + 1, Math.ceil((daily * MAX_COVER_DAYS) / STOCK[item].pack)), auto: true };
}

/** Shelf space in packs: a cupboard, plus each open nursing station and pharmacy, plus storage-room racks. */
export function shelfCapacity(state: GameState): number {
  const statuses = allRoomStatuses(state.site);
  let cap = BASE_SHELF_PACKS;
  for (const r of state.site.rooms) {
    if (!statuses.get(r.id)?.operational) continue;
    if (r.type === 'nursing_station') cap += STATION_SHELF_PACKS;
    if (r.type === 'pharmacy') cap += PHARMACY_SHELF_PACKS;
    if (r.type === 'storage_room') cap += RACK_SHELF_PACKS * (r.equipment.storage_rack ?? 0);
  }
  return cap;
}

/** Shelf places taken: packs on hand (a started pack counts whole) and packs on the way. */
export function shelfUsed(inv: InventoryState): number {
  let n = inv.orders.reduce((a, o) => a + o.packs, 0);
  for (const item of STOCK_ITEMS) n += Math.ceil(onHand(inv, item) / STOCK[item].pack);
  return n;
}

export function shelfFree(state: GameState): number {
  return state.inventory ? Math.max(0, shelfCapacity(state) - shelfUsed(state.inventory)) : 0;
}

/** The item in short supply today, if any. */
export function shortageOf(state: GameState): StockItem | null {
  const sh = state.inventory?.shortage;
  return sh && sh.untilDay >= dayOf(state.minute) ? sh.item : null;
}

export function orderCost(state: GameState, item: StockItem, packs: number, kind: OrderKind = 'standard'): number {
  let base = supplyPrice(state, STOCK[item].packSatang * packs);
  if (kind === 'bulk') base = pctOf(base, BULK_PERCENT);
  if (kind !== 'express' && shortageOf(state) === item) base = pctOf(base, SHORTAGE_PERCENT);
  return kind === 'express' ? pctOf(base, EXPRESS_PERCENT) : base;
}

/** When an order placed now arrives. */
export function arrivalOf(state: GameState, item: StockItem, kind: OrderKind = 'standard'): number {
  if (kind === 'express') return state.minute + EXPRESS_MINUTES;
  const days = (kind === 'bulk' ? BULK_DAYS : 1) + (shortageOf(state) === item ? 1 : 0);
  return (dayOf(state.minute) - 1 + days) * MINUTES_PER_DAY + DELIVERY_HOUR * 60;
}

export function orderBlocker(state: GameState, item: StockItem, packs: number, kind: OrderKind = 'standard'): ReasonCode | null {
  if (!state.inventory?.on) return 'inventory_off';
  if (!STOCK[item] || !Number.isInteger(packs) || packs < 1 || packs > 999) return 'invalid_choice';
  if (kind === 'bulk' && packs < BULK_MIN_PACKS) return 'min_order';
  if (packs > shelfFree(state)) return 'no_space';
  if (state.organization.cashSatang < orderCost(state, item, packs, kind)) return 'insufficient_funds';
  return null;
}

/** Place an order (check orderBlocker first). */
export function orderStock(state: GameState, item: StockItem, packs: number, kind: OrderKind = 'standard'): GameState {
  const inv = state.inventory!;
  const costSatang = orderCost(state, item, packs, kind);
  const arriveAt = arrivalOf(state, item, kind);
  let [s, id] = allocId(state, 'po');
  const flag = kind === 'express' ? { express: true } : kind === 'bulk' ? { bulk: true } : {};
  s = {
    ...s,
    inventory: { ...inv, orders: [...inv.orders, { id, item, packs, arriveAt, costSatang, ...flag }], month: { ...inv.month, spentSatang: inv.month.spentSatang + costSatang } },
  };
  return post(s, -costSatang, 'supplies', `ledger.stock_${kind === 'standard' ? 'order' : kind}`, { ref: id, memoParams: { item, packs } });
}

/** Stock a task would use, or null when it needs none. */
export function taskNeeds(kind: TaskKind): Partial<Record<StockItem, number>> | null {
  return TASK_STOCK[kind] ?? null;
}

/** Take a task's stock from the shelves (earliest expiry first), or null if something is short. */
export function takeStock(inv: InventoryState, kind: TaskKind): InventoryState | null {
  const need = TASK_STOCK[kind];
  if (!need) return inv;
  const lots = { ...inv.lots };
  let used = inv.month.used;
  for (const [item, n] of Object.entries(need) as [StockItem, number][]) {
    if (onHand({ ...inv, lots }, item) < n) return null;
    let left = n;
    const next = [...(lots[item] ?? [])].map((l) => ({ ...l }));
    for (const l of next) {
      const take = Math.min(left, l.qty);
      l.qty -= take;
      left -= take;
      if (!left) break;
    }
    lots[item] = next.filter((l) => l.qty > 0);
    used = add(used, item, n);
  }
  return { ...inv, lots, month: { ...inv.month, used } };
}

/** Items a task is short of. */
export function shortOf(inv: InventoryState, kind: TaskKind): StockItem[] {
  return (Object.entries(TASK_STOCK[kind] ?? {}) as [StockItem, number][]).filter(([item, n]) => onHand(inv, item) < n).map(([item]) => item);
}

/** A task could not start for lack of stock: warn once a day per item. */
export function noteShortage(state: GameState, items: StockItem[]): GameState {
  const day = dayOf(state.minute);
  let s = state;
  for (const item of items) {
    if (s.inventory!.warned?.[item] === day) continue;
    s = { ...s, inventory: { ...s.inventory!, warned: { ...s.inventory!.warned, [item]: day } } };
    s = log(s, 'warn', 'log.stockout', { item });
  }
  return s;
}

/** Deliveries that have arrived go on the shelves. */
function receive(state: GameState): GameState {
  const inv = state.inventory!;
  const here = inv.orders.filter((o) => o.arriveAt <= state.minute);
  if (!here.length) return state;
  const day = dayOf(state.minute);
  const lots = { ...inv.lots };
  let { received, wasted } = inv.month;
  let badLot = inv.badLot;
  let s = state;
  for (const o of here) {
    const qty = o.packs * STOCK[o.item].pack;
    received = add(received, o.item, qty);
    // Supply news: part of this delivery arrives spoiled and goes straight in the bin.
    const spoiled = badLot === o.item ? Math.round((qty * BAD_LOT_PERCENT) / 100) : 0;
    if (spoiled) {
      badLot = undefined;
      wasted = add(wasted, o.item, spoiled);
      s = log(s, 'warn', 'log.stock_bad_lot', { item: o.item, n: spoiled });
    }
    lots[o.item] = [...(lots[o.item] ?? []), { qty: qty - spoiled, expiresDay: day + STOCK[o.item].shelfDays }].sort((a, b) => a.expiresDay - b.expiresDay);
  }
  return { ...s, inventory: { ...inv, lots, badLot, orders: inv.orders.filter((o) => o.arriveAt > state.minute), month: { ...inv.month, received, wasted } } };
}

/** Uses that pending tasks due before `by` will need. */
function dueNeed(tasks: CareTask[], item: StockItem, by: number): number {
  let n = 0;
  for (const t of tasks) if (t.status === 'pending' && t.dueAt <= by) n += TASK_STOCK[t.kind]?.[item] ?? 0;
  return n;
}

/** Automatic reordering: top up below the reorder point, and rush what is about to run out. */
function autoReorder(state: GameState, topUp: boolean): GameState {
  let s = state;
  const by = s.minute + EXPRESS_LOOKAHEAD_MINUTES;
  for (const item of STOCK_ITEMS) {
    const inv = s.inventory!;
    const have = onHand(inv, item);
    const need = dueNeed(s.tasks, item, by);
    const soon = have + incoming(inv, item, by);
    if (need > soon) {
      const packs = Math.min(shelfFree(s), Math.ceil((need - soon) / STOCK[item].pack));
      if (packs > 0 && !orderBlocker(s, item, packs, 'express')) s = orderStock(s, item, packs, 'express');
    }
    if (!topUp) continue;
    const { min, max } = stockLevels(s, item);
    const level = onHand(s.inventory!, item) + incoming(s.inventory!, item);
    if (max > 0 && level < min * STOCK[item].pack) {
      // Only what the shelves can take.
      const packs = Math.min(shelfFree(s), Math.ceil((max * STOCK[item].pack - level) / STOCK[item].pack));
      if (packs > 0 && !orderBlocker(s, item, packs)) s = orderStock(s, item, packs);
    }
  }
  return s;
}

/** Every tick: take in deliveries and rush what is about to run out; every hour, top up (if auto is on). */
export function inventoryTick(state: GameState): GameState {
  if (!state.inventory?.on) return state;
  const s = receive(state);
  return s.inventory!.auto ? autoReorder(s, s.minute % 60 === 0) : s;
}

/** Midnight: throw away expired stock; on the first of the month, close the month's count. */
export function inventoryDayEnd(state: GameState, closingDay: number): GameState {
  if (!state.inventory) return state;
  let inv = state.inventory;
  let s = state;
  const newDay = closingDay + 1;
  let wasted = inv.month.wasted;
  const lots = { ...inv.lots };
  for (const item of STOCK_ITEMS) {
    const all = lots[item] ?? [];
    const gone = all.filter((l) => l.expiresDay < newDay).reduce((a, l) => a + l.qty, 0);
    if (!gone) continue;
    lots[item] = all.filter((l) => l.expiresDay >= newDay);
    wasted = add(wasted, item, gone);
    s = log(s, 'warn', 'log.stock_expired', { item, n: gone });
  }
  inv = { ...inv, lots, month: { ...inv.month, wasted } };
  if (inv.on) [s, inv] = supplyNews(s, inv, newDay);
  if (monthOfDay(newDay) !== inv.month.month) {
    const closing = allOnHand(inv);
    inv = { ...inv, reports: [...inv.reports, { ...inv.month, closing }].slice(-STOCK_REPORTS_KEPT), month: newMonth(monthOfDay(newDay), closing) };
  }
  return { ...s, inventory: inv };
}

function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x2545f491, 0x9e3779b1) ^ Math.imul(b + 0x7f4a7c15, 0x85ebca77);
  h ^= h >>> 15;
  h = Math.imul(h, 0x27d4eb2f);
  return (h ^ (h >>> 13)) >>> 0;
}

/** About one day in twelve: a shortage or a bad lot of an item the home uses (seed + day hash, no PRNG). */
export function supplyNewsFor(state: GameState, day: number): { kind: 'shortage' | 'bad_lot'; item: StockItem } | null {
  if (day < SUPPLY_NEWS_FROM_DAY) return null;
  const h = hash(state.seed, day);
  if (h % SUPPLY_NEWS_EVERY !== 0) return null;
  const use = projectedDailyUse(state);
  const items = STOCK_ITEMS.filter((i) => (use[i] ?? 0) > 0);
  if (!items.length) return null;
  return { kind: (h >>> 8) % 2 ? 'bad_lot' : 'shortage', item: items[(h >>> 12) % items.length] };
}

function supplyNews(state: GameState, inv: InventoryState, day: number): [GameState, InventoryState] {
  const news = supplyNewsFor(state, day);
  if (!news) return [state, inv];
  if (news.kind === 'shortage') return [log(state, 'warn', 'log.stock_shortage', { item: news.item, n: SHORTAGE_DAYS }), { ...inv, shortage: { item: news.item, untilDay: day + SHORTAGE_DAYS - 1 } }];
  return [log(state, 'warn', 'log.stock_bad_news', { item: news.item }), { ...inv, badLot: news.item }];
}

/** Value of the stock on hand at list price. */
export function stockValue(counts: StockCounts): number {
  let v = 0;
  for (const item of STOCK_ITEMS) v += Math.round(((counts[item] ?? 0) * STOCK[item].packSatang) / STOCK[item].pack);
  return v;
}

/** Days the stock on hand lasts at today's care plans (null when nothing uses it). */
export function daysLeft(state: GameState, item: StockItem): number | null {
  const daily = projectedDailyUse(state)[item] ?? 0;
  if (!daily || !state.inventory) return null;
  return Math.floor((onHand(state.inventory, item) / daily) * 10) / 10;
}
