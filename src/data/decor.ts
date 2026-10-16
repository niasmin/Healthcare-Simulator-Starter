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
};

export const DECOR_ORDER: DecorType[] = ['tree', 'tree2', 'sakura', 'flowers', 'hedge', 'planter', 'lamp', 'umbrella', 'fountain', 'gazebo'];

/** Appeal stops helping beyond this total. */
export const MAX_APPEAL = 30;
/** Daily garden upkeep per item. */
export const DECOR_UPKEEP = thb(10);

export function gardenAppeal(decor: { type: DecorType }[]): number {
  return Math.min(MAX_APPEAL, decor.reduce((a, d) => a + DECOR[d.type].appeal, 0));
}
