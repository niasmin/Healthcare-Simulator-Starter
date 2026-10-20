import { thb } from '../domain/money';
import type { CityPlace } from '../domain/types';

/**
 * The town around the home: places on the city map the player can visit for a small treat.
 * Each can be used once a game day. ALL PRICES AND EFFECTS ARE FICTIONAL GAME BALANCING.
 */
export interface CityPlaceDef {
  id: CityPlace;
  /** Cost per employee on the staff, per resident, or a flat amount. */
  perStaff?: number;
  perResident?: number;
  flat?: number;
  /** Who it is for (an outing for nobody is refused). */
  for: 'staff' | 'residents' | 'home';
  /** Points added to each person (clamped at 100). */
  morale?: number;
  happiness?: number;
  satisfaction?: number;
}

export const CITY_PLACES: Record<CityPlace, CityPlaceDef> = {
  coffee: { id: 'coffee', perStaff: thb(80), for: 'staff', morale: 5 },
  cake: { id: 'cake', perResident: thb(120), for: 'residents', happiness: 6 },
  restaurant: { id: 'restaurant', perResident: thb(350), for: 'residents', happiness: 3, satisfaction: 4 },
  park: { id: 'park', for: 'residents', happiness: 2 },
  mall: { id: 'mall', flat: thb(30_000), for: 'home' },
};
export const CITY_ORDER: CityPlace[] = ['coffee', 'cake', 'restaurant', 'mall', 'park'];

/** The mall's bulk-buy deal: daily supplies cost this share for the next days. */
export const MALL_SUPPLIES_PERCENT = 90;
export const MALL_DEAL_DAYS = 7;
