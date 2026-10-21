import { thb } from '../domain/money';
import type { StockItem, TaskKind } from '../domain/types';

/**
 * Care consumables (fictional game balancing).
 *
 * The groups and the min/max reorder idea follow a real care home's month-end stock count
 * (79 lines of supplies and medicines), folded into eight abstract groups. Medicines are ONE
 * abstract "basic medication kit": no drug names, doses or clinical choices appear in the game.
 * Prices are game values tuned so a home that keeps its stock tidy spends about what the old
 * flat daily supplies charge cost; they are not real prices.
 *
 * Stock is counted in uses (one glove pair, one diaper change, one feeding set ...) and bought in packs.
 */
export interface StockDef {
  id: StockItem;
  icon: string;
  /** Uses in one pack. */
  pack: number;
  /** Price of one pack. */
  packSatang: number;
  /** Days a delivered pack stays usable. */
  shelfDays: number;
}

export const STOCK_ITEMS: StockItem[] = ['gloves', 'diapers', 'ppe', 'dressing', 'feeding', 'syringes', 'suction', 'medkit'];

export const STOCK: Record<StockItem, StockDef> = {
  gloves: { id: 'gloves', icon: '🧤', pack: 100, packSatang: thb(200), shelfDays: 365 },
  diapers: { id: 'diapers', icon: '🩲', pack: 10, packSatang: thb(80), shelfDays: 365 },
  ppe: { id: 'ppe', icon: '😷', pack: 20, packSatang: thb(260), shelfDays: 180 },
  dressing: { id: 'dressing', icon: '🩹', pack: 10, packSatang: thb(360), shelfDays: 120 },
  feeding: { id: 'feeding', icon: '🍼', pack: 10, packSatang: thb(120), shelfDays: 120 },
  syringes: { id: 'syringes', icon: '💉', pack: 50, packSatang: thb(320), shelfDays: 365 },
  suction: { id: 'suction', icon: '🫁', pack: 10, packSatang: thb(160), shelfDays: 365 },
  medkit: { id: 'medkit', icon: '💊', pack: 30, packSatang: thb(600), shelfDays: 60 },
};

/** What one care task uses up when it starts. Tasks not listed need no stock. */
export const TASK_STOCK: Partial<Record<TaskKind, Partial<Record<StockItem, number>>>> = {
  med_round: { medkit: 1 },
  vital_signs: { syringes: 1 },
  recovery_check: { dressing: 1, gloves: 1 },
  personal_care: { gloves: 1, diapers: 1 },
  repositioning: { gloves: 1 },
  comfort_round: { gloves: 1, diapers: 1 },
  tube_feed: { feeding: 1, gloves: 1 },
  airway_care: { suction: 1, ppe: 1, gloves: 1 },
};

/** Regular orders arrive at this hour of the next day. */
export const DELIVERY_HOUR = 8;
/** Express orders (a courier from the nearby medical supplier) arrive this many minutes after ordering, at this share of the normal price. */
export const EXPRESS_MINUTES = 60;
export const EXPRESS_PERCENT = 150;
/** Automatic reordering keeps between these many days of projected use on hand. */
export const MIN_COVER_DAYS = 3;
export const MAX_COVER_DAYS = 10;
/** Automatic express orders cover the work due within this window. */
export const EXPRESS_LOOKAHEAD_MINUTES = 240;
/** Free starter stock when the stock room opens, in uses: about ten days for a full ten-bed home. */
export const STARTER_STOCK: Partial<Record<StockItem, number>> = { gloves: 600, diapers: 200, syringes: 200, medkit: 200 };
/**
 * Shelf space, in packs (a part-used pack takes a whole place): a cupboard everywhere, more in each
 * nursing station and pharmacy, and the most on the racks of a storage room.
 */
export const BASE_SHELF_PACKS = 40;
export const STATION_SHELF_PACKS = 30;
export const PHARMACY_SHELF_PACKS = 40;
export const RACK_SHELF_PACKS = 60;
/** The wholesaler: cheaper, slower, and only by the case. */
export const BULK_PERCENT = 85;
export const BULK_DAYS = 3;
export const BULK_MIN_PACKS = 5;
/**
 * Supply news, from a hash of the seed and the day (never the PRNG): about one day in twelve, from
 * day 5. A shortage makes an item dearer and a day slower to come for three days; a bad lot spoils
 * part of the next delivery of an item.
 */
export const SUPPLY_NEWS_EVERY = 12;
export const SUPPLY_NEWS_FROM_DAY = 5;
export const SHORTAGE_DAYS = 3;
export const SHORTAGE_PERCENT = 130;
export const BAD_LOT_PERCENT = 20;
/** Month-end stock counts kept for the report. */
export const STOCK_REPORTS_KEPT = 6;
