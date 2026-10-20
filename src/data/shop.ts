import { thb } from '../domain/money';
import type { GameState, UpgradeId } from '../domain/types';

/**
 * The shop ("ร้านค้า"): permanent upgrades for the home, bought once with game cash. Each has one
 * plain, mechanical effect. ALL PRICES AND EFFECTS ARE FICTIONAL GAME BALANCING.
 */
export interface UpgradeDef {
  id: UpgradeId;
  costSatang: number;
  /** First chapter in which it can be bought (the sandbox unlocks all). */
  unlockChapter: number;
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  online_marketing: { id: 'online_marketing', costSatang: thb(150_000), unlockChapter: 1 },
  staff_welfare: { id: 'staff_welfare', costSatang: thb(200_000), unlockChapter: 1 },
  central_kitchen: { id: 'central_kitchen', costSatang: thb(250_000), unlockChapter: 1 },
  family_app: { id: 'family_app', costSatang: thb(180_000), unlockChapter: 2 },
  laundry_supply: { id: 'laundry_supply', costSatang: thb(300_000), unlockChapter: 2 },
  smart_call: { id: 'smart_call', costSatang: thb(350_000), unlockChapter: 3 },
  family_lounge: { id: 'family_lounge', costSatang: thb(220_000), unlockChapter: 1 },
  solar_roof: { id: 'solar_roof', costSatang: thb(400_000), unlockChapter: 2 },
  ehr_system: { id: 'ehr_system', costSatang: thb(320_000), unlockChapter: 2 },
  training_scholarship: { id: 'training_scholarship', costSatang: thb(250_000), unlockChapter: 5 },
};
export const UPGRADE_ORDER: UpgradeId[] = ['online_marketing', 'staff_welfare', 'central_kitchen', 'family_lounge', 'family_app', 'laundry_supply', 'solar_roof', 'ehr_system', 'smart_call', 'training_scholarship'];

/** Effects (used by the engine). */
export const MARKETING_EXTRA_ENQUIRIES = 1;
export const WELFARE_MORALE_PER_DAY = 1;
export const KITCHEN_FOOD_PERCENT = 75;
export const LAUNDRY_SUPPLIES_PERCENT = 80;
export const FAMILY_APP_REPUTATION = 0.2;
export const FAMILY_APP_SATISFACTION_LINE = 60;
export const SMART_CALL_EXTRA_GRACE = 30;
/** Family lounge: relatives visit in comfort, so families are a little more satisfied each day. */
export const LOUNGE_SATISFACTION_PER_DAY = 0.3;
/** Solar roof: electricity off the roof cuts daily building upkeep. */
export const SOLAR_UPKEEP_PERCENT = 85;
/** Electronic health records: medication rounds and vital signs take a fifth less time. */
export const EHR_TASK_PERCENT = 80;
/** Training scholarship fund: courses cost less. */
export const SCHOLARSHIP_COURSE_PERCENT = 70;

export function hasUpgrade(state: GameState, id: UpgradeId): boolean {
  return !!state.upgrades?.includes(id);
}
