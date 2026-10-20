import { thb } from '../domain/money';
import type { Cell, Satang } from '../domain/types';

/**
 * Starting scenarios. Values are fictional game balancing.
 * The GDD's CMNH reference figures are deliberately NOT used as gameplay tuning.
 */
export interface ScenarioDef {
  id: string;
  orgName: string;
  startingCashSatang: Satang;
  gridWidth: number;
  gridHeight: number;
  entrance: Cell;
  defaultSeed: number;
}

export const STARTER_SCENARIO: ScenarioDef = {
  id: 'starter-nursing-home',
  orgName: 'Healthcare Empire',
  startingCashSatang: thb(2_000_000),
  gridWidth: 20,
  gridHeight: 20,
  entrance: { x: 9, y: 19 },
  defaultSeed: 20261016,
};
