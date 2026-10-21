import { thb } from '../domain/money';
import type { CareGroup, PriceLevel, RevenueStream, VisitPlan } from '../domain/types';

/**
 * Billing catalogue. ALL VALUES ARE FICTIONAL GAME BALANCING, not real tariffs.
 * (The GDD's CMNH figures are reference data only and are not used here.)
 */

/** Monthly room & care fee by abstract care level 1..4 at the standard price level. */
export const MONTHLY_FEE_BY_LEVEL: Record<number, number> = {
  1: thb(29_000),
  2: thb(33_000),
  3: thb(39_000),
  4: thb(46_000),
};

/** Extra monthly fee for a private villa (Chapter 3 premium tier, standard price level). */
export const VILLA_FEE = thb(42_000);

/** Home-care visit prices (Chapter 4), billed per completed visit. */
export const VISIT_PRICE: Record<VisitPlan, number> = { caregiver: thb(900), nurse: thb(1_500) };

/** Extra monthly fee for the Chapter 2 specialised programmes (standard price level). */
export const PROGRAMME_FEE: Partial<Record<CareGroup, number>> = {
  dementia: thb(4_000),
  tube_feeding: thb(6_000),
  airway: thb(12_000),
  advanced_dementia: thb(10_000),
  post_surgery: thb(8_000),
};

export const PRICE_LEVELS: PriceLevel[] = ['value', 'standard', 'premium'];

export const PRICE_MULTIPLIER: Record<PriceLevel, number> = { value: 0.9, standard: 1, premium: 1.2 };

/** New waiting-list arrivals per day [min, max] by price level. */
export const WAITLIST_ARRIVALS: Record<PriceLevel, [number, number]> = { value: [2, 3], standard: [1, 2], premium: [0, 1] };

/** Extra satisfaction drift per tick: premium prices raise expectations. */
export const PRICE_SATISFACTION_DRIFT: Record<PriceLevel, number> = { value: 0.02, standard: 0, premium: -0.06 };

/** Billable services, charged per completed session on the next monthly invoice. */
export const SERVICE_PRICE: Record<Exclude<RevenueStream, 'room_care' | 'homecare' | 'workforce' | 'hospital' | 'network'>, number> = {
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
export function monthlyFee(level: number, price: PriceLevel, group?: CareGroup, premium = false): number {
  const base = MONTHLY_FEE_BY_LEVEL[level] + (group ? (PROGRAMME_FEE[group] ?? 0) : 0) + (premium ? VILLA_FEE : 0);
  return Math.floor((base * PRICE_MULTIPLIER[price]) / 100) * 100;
}

/** Extra daily supplies for programmes (feeding sets, airway consumables). */
export const PROGRAMME_SUPPLIES_PER_DAY: Partial<Record<CareGroup, number>> = { tube_feeding: thb(40), airway: thb(90), advanced_dementia: thb(30), post_surgery: thb(60) };
