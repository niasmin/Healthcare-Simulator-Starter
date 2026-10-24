import { thb } from '../domain/money';
import type { DecorType } from '../domain/types';

/**
 * Garden and decoration catalogue (sprites from the project's Game Assets Pack).
 * "Appeal" makes the grounds pleasanter: it slows residents' happiness decay and
 * lifts mental well-being a little. FICTIONAL balancing values.
 */
export interface DecorDef {
  type: DecorType;
  costSatang: number;
  appeal: number;
  /** Star-shop items cost stars instead of cash. */
  stars?: number;
}

export const DECOR: Record<DecorType, DecorDef> = {
  tree: { type: 'tree', costSatang: thb(2_000), appeal: 1 },
  tree2: { type: 'tree2', costSatang: thb(2_000), appeal: 1 },
  sakura: { type: 'sakura', costSatang: thb(3_500), appeal: 2 },
  flowers: { type: 'flowers', costSatang: thb(1_200), appeal: 1 },
  hedge: { type: 'hedge', costSatang: thb(1_500), appeal: 1 },
  planter: { type: 'planter', costSatang: thb(1_500), appeal: 1 },
  lamp: { type: 'lamp', costSatang: thb(800), appeal: 0.5 },
  umbrella: { type: 'umbrella', costSatang: thb(8_000), appeal: 3 },
  fountain: { type: 'fountain', costSatang: thb(25_000), appeal: 5 },
  gazebo: { type: 'gazebo', costSatang: thb(30_000), appeal: 6 },
  // A tile of lotus pond: neighbouring tiles join into one pond (or a canal along a path).
  pond: { type: 'pond', costSatang: thb(4_000), appeal: 1.5 },
  // A Thai pavilion on stilts: beside a pond its posts stand in the water.
  sala: { type: 'sala', costSatang: thb(35_000), appeal: 6 },
  // A Thai house on stilts (ruean thai) with a veranda: the grandest garden piece.
  thai_house: { type: 'thai_house', costSatang: thb(60_000), appeal: 8 },
  // A small garden lantern on a post; it lights the lawn at night.
  lantern: { type: 'lantern', costSatang: thb(600), appeal: 0.5 },
  // Star shop: exclusive pieces bought with stars from daily missions and achievements.
  gold_fountain: { type: 'gold_fountain', costSatang: 0, appeal: 6, stars: 40 },
  sakura_arch: { type: 'sakura_arch', costSatang: 0, appeal: 5, stars: 30 },
  statue: { type: 'statue', costSatang: 0, appeal: 4, stars: 20 },
  gold_lantern: { type: 'gold_lantern', costSatang: 0, appeal: 1, stars: 8 },
};
export const STAR_DECOR: DecorType[] = ['gold_lantern', 'statue', 'sakura_arch', 'gold_fountain'];

/** Stars a home can still spend: earned minus spent. */
export function starsLeft(goals: { stars: number; spent?: number } | undefined): number {
  return Math.max(0, (goals?.stars ?? 0) - (goals?.spent ?? 0));
}

export const DECOR_ORDER: DecorType[] = ['tree', 'tree2', 'sakura', 'flowers', 'hedge', 'planter', 'pond', 'lamp', 'lantern', 'umbrella', 'fountain', 'gazebo', 'sala', 'thai_house'];

/** Appeal stops helping beyond this total. */
export const MAX_APPEAL = 30;
/** Daily garden upkeep per item. */
export const DECOR_UPKEEP = thb(10);

export function gardenAppeal(decor: { type: DecorType }[]): number {
  return Math.min(MAX_APPEAL, decor.reduce((a, d) => a + DECOR[d.type].appeal, 0));
}
