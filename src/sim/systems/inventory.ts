import {
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
import type { CareTask, GameState, InventoryState, ReasonCode, StockCounts, StockItem, StockMonth, TaskKind } from '../../domain/types';
import { MINUTES_PER_DAY } from '../constants';
import { allocId, log, post } from '../helpers';
import { supplyPrice } from './billing';
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

export function orderCost(state: GameState, item: StockItem, packs: number, express = false): number {
  const base = supplyPrice(state, STOCK[item].packSatang * packs);
  return express ? pctOf(base, EXPRESS_PERCENT) : base;
}

export function orderBlocker(state: GameState, item: StockItem, packs: number, express = false): ReasonCode | null {
  if (!state.inventory?.on) return 'inventory_off';
  if (!STOCK[item] || !Number.isInteger(packs) || packs < 1 || packs > 999) return 'invalid_choice';
  if (state.organization.cashSatang < orderCost(state, item, packs, express)) return 'insufficient_funds';
  return null;
}

/** Place an order (check orderBlocker first). */
export function orderStock(state: GameState, item: StockItem, packs: number, express = false): GameState {
  const inv = state.inventory!;
  const costSatang = orderCost(state, item, packs, express);
  const arriveAt = express ? state.minute + EXPRESS_MINUTES : (dayOf(state.minute) * MINUTES_PER_DAY) + DELIVERY_HOUR * 60;
  let [s, id] = allocId(state, 'po');
  s = {
    ...s,
    inventory: { ...inv, orders: [...inv.orders, { id, item, packs, arriveAt, costSatang, ...(express ? { express: true } : {}) }], month: { ...inv.month, spentSatang: inv.month.spentSatang + costSatang } },
  };
  return post(s, -costSatang, 'supplies', express ? 'ledger.stock_express' : 'ledger.stock_order', { ref: id, memoParams: { item, packs } });
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
  let received = inv.month.received;
  for (const o of here) {
    const qty = o.packs * STOCK[o.item].pack;
    lots[o.item] = [...(lots[o.item] ?? []), { qty, expiresDay: day + STOCK[o.item].shelfDays }].sort((a, b) => a.expiresDay - b.expiresDay);
    received = add(received, o.item, qty);
  }
  return { ...state, inventory: { ...inv, lots, orders: inv.orders.filter((o) => o.arriveAt > state.minute), month: { ...inv.month, received } } };
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
      const packs = Math.ceil((need - soon) / STOCK[item].pack);
      if (!orderBlocker(s, item, packs, true)) s = orderStock(s, item, packs, true);
    }
    if (!topUp) continue;
    const { min, max } = stockLevels(s, item);
    const level = onHand(s.inventory!, item) + incoming(s.inventory!, item);
    if (max > 0 && level < min * STOCK[item].pack) {
      const packs = Math.ceil((max * STOCK[item].pack - level) / STOCK[item].pack);
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
  if (monthOfDay(newDay) !== inv.month.month) {
    const closing = allOnHand(inv);
    inv = { ...inv, reports: [...inv.reports, { ...inv.month, closing }].slice(-STOCK_REPORTS_KEPT), month: newMonth(monthOfDay(newDay), closing) };
  }
  return { ...s, inventory: inv };
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
