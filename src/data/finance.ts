import { thb } from '../domain/money';
import type { PriceLevel, RevenueStream } from '../domain/types';

/**
 * Billing catalogue. ALL VALUES ARE FICTIONAL GAME BALANCING, not real tariffs.
 * (The GDD's CMNH figures are reference data only and are not used here.)
 */

/** Monthly room & care fee by abstract care level 1..4 at the standard price level. */
export const MONTHLY_FEE_BY_LEVEL: Record<number, number> = {
  1: thb(24_000),
  2: thb(28_000),
  3: thb(33_000),
  4: thb(38_000),
};

export const PRICE_LEVELS: PriceLevel[] = ['value', 'standard', 'premium'];

export const PRICE_MULTIPLIER: Record<PriceLevel, number> = { value: 0.9, standard: 1, premium: 1.2 };

/** New waiting-list arrivals per day [min, max] by price level. */
export const WAITLIST_ARRIVALS: Record<PriceLevel, [number, number]> = { value: [2, 3], standard: [1, 2], premium: [0, 1] };

/** Extra satisfaction drift per tick: premium prices raise expectations. */
export const PRICE_SATISFACTION_DRIFT: Record<PriceLevel, number> = { value: 0.01, standard: 0, premium: -0.015 };

/** Billable services, charged per completed session on the next monthly invoice. */
export const SERVICE_PRICE: Record<Exclude<RevenueStream, 'room_care'>, number> = {
  therapy: thb(300),
  activity: thb(100),
  special: thb(3_000),
};

/** Daily running costs per resident. */
export const FOOD_PER_RESIDENT_DAY = thb(80);
export const SUPPLIES_BASE_PER_DAY = thb(20);
export const SUPPLIES_PER_LEVEL_DAY = thb(15);

export const DAYS_PER_MONTH = 30;

/** Families pay an invoice this many days after it is issued [min, max]. */
export const PAYMENT_DELAY_DAYS: [number, number] = [1, 5];

export function monthOfDay(day: number): number {
  return Math.floor((day - 1) / DAYS_PER_MONTH) + 1;
}

export function dayInMonth(day: number): number {
  return ((day - 1) % DAYS_PER_MONTH) + 1;
}

/** Monthly fee for a level at a price level, rounded down to whole baht. */
export function monthlyFee(level: number, price: PriceLevel): number {
  return Math.floor((MONTHLY_FEE_BY_LEVEL[level] * PRICE_MULTIPLIER[price]) / 100) * 100;
}
