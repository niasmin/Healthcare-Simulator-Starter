import { thb } from '../domain/money';
import type { BranchKind, PersonName, StaffRole } from '../domain/types';

/**
 * Chapter 7 catalogue: branch sites run from headquarters. Branches are simulated at portfolio
 * level (capacity, occupancy, quality), not as separate maps.
 * ALL PRICES, RATES AND COSTS ARE FICTIONAL GAME BALANCING.
 */
export interface BranchDef {
  kind: BranchKind;
  /** One-off cost to open (building, fit-out, licences). */
  capexSatang: number;
  /** Beds, Home Care clients, or clinic visits per day. */
  capacity: number;
  /** Revenue per unit in use per day. */
  ratePerUnit: number;
  /** Running cost per day, plus per unit in use (local staff, supplies). */
  fixedPerDay: number;
  costPerUnit: number;
  /** Roles that may manage this kind of branch. */
  managers: StaffRole[];
}

export const BRANCHES: Record<BranchKind, BranchDef> = {
  nursing: { kind: 'nursing', capexSatang: thb(1_800_000), capacity: 20, ratePerUnit: thb(1_200), fixedPerDay: thb(6_000), costPerUnit: thb(450), managers: ['rn'] },
  homecare: { kind: 'homecare', capexSatang: thb(600_000), capacity: 15, ratePerUnit: thb(950), fixedPerDay: thb(2_500), costPerUnit: thb(350), managers: ['rn', 'pn'] },
  clinic: { kind: 'clinic', capexSatang: thb(1_200_000), capacity: 30, ratePerUnit: thb(1_000), fixedPerDay: thb(9_000), costPerUnit: thb(200), managers: ['doctor'] },
};
export const BRANCH_ORDER: BranchKind[] = ['nursing', 'homecare', 'clinic'];
export const MAX_BRANCHES = 5;

/** Quality: target = base + manager and headquarters bonuses; it moves this share of the gap each day. */
export const QUALITY_BASE = 55;
export const QUALITY_NO_MANAGER = 30;
export const BONUS_CERTIFIED = 10;
export const BONUS_MORALE = 5;
export const MORALE_LINE = 70;
export const BONUS_TRAINING_ROOM = 5;
export const BONUS_REPUTATION = 5;
export const REPUTATION_LINE = 80;
export const QUALITY_PULL = 0.2;
export const START_QUALITY = 50;

/** Occupancy grows while quality and the network's name are good, and shrinks when quality is poor. */
export const GROW_QUALITY = 60;
export const GROW_REPUTATION = 50;
export const GROW_SHARE = 0.08;
export const SHRINK_QUALITY = 50;
export const SHRINK_SHARE = 0.05;

/** A support visit from headquarters: a one-off cost, an immediate quality lift, then a cooldown. */
export const SUPPORT_COST = thb(50_000);
export const SUPPORT_QUALITY = 10;
export const SUPPORT_COOLDOWN_DAYS = 7;

/** A full clinic branch refers one patient to headquarters' stroke unit on this share (percent) of days; less when quieter. */
export const CLINIC_REFERRAL_PERCENT = 30;

/** Closing a branch refunds this share of its opening cost. */
export const CLOSE_REFUND_PERCENT = 30;

/** Fictional districts for branch names. */
export const DISTRICTS: PersonName[] = [
  { th: 'สาขาแม่ริม', en: 'Mae Rim branch' },
  { th: 'สาขาหางดง', en: 'Hang Dong branch' },
  { th: 'สาขาสันกำแพง', en: 'San Kamphaeng branch' },
  { th: 'สาขาดอยสะเก็ด', en: 'Doi Saket branch' },
  { th: 'สาขาลำพูน', en: 'Lamphun branch' },
  { th: 'สาขาสารภี', en: 'Saraphi branch' },
];
