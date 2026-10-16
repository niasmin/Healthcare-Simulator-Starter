import { thb } from '../domain/money';
import type { EquipmentId, Rect, RoomType, Satang } from '../domain/types';
import { rectArea } from '../domain/grid';

/**
 * Room and equipment catalogue.
 * ALL PRICES ARE FICTIONAL GAME-BALANCING VALUES, not real construction or clinical costs.
 */

export interface EquipmentDef {
  id: EquipmentId;
  costSatang: Satang;
  /** Render colour for the iso prop. */
  color: number;
}

export const EQUIPMENT: Record<EquipmentId, EquipmentDef> = {
  care_bed: { id: 'care_bed', costSatang: thb(18_000), color: 0xf4f1ea },
  call_system: { id: 'call_system', costSatang: thb(25_000), color: 0xe0614b },
  med_cart: { id: 'med_cart', costSatang: thb(30_000), color: 0x5b8fd6 },
  nurse_desk: { id: 'nurse_desk', costSatang: thb(30_000), color: 0xc9a46a },
  exercise_mat: { id: 'exercise_mat', costSatang: thb(20_000), color: 0x6cbf8e },
  parallel_bars: { id: 'parallel_bars', costSatang: thb(60_000), color: 0x9aa4b1 },
  lockers: { id: 'lockers', costSatang: thb(15_000), color: 0x7c86a8 },
  rest_sofa: { id: 'rest_sofa', costSatang: thb(12_000), color: 0xd98a6c },
};

export interface EquipmentSlot {
  id: EquipmentId;
  /** Minimum installed for the room to operate (0 = optional). */
  required: number;
  /** Maximum installable for a given footprint. */
  max: (rect: Rect) => number;
}

export interface RoomDef {
  type: RoomType;
  /** Shortest allowed side, in cells. */
  minSide: number;
  minArea: number;
  maxArea: number;
  baseCostSatang: Satang;
  costPerTileSatang: Satang;
  /** Daily upkeep per tile (cleaning, utilities). */
  upkeepPerTileSatang: Satang;
  equipment: EquipmentSlot[];
  floorColor: number;
  wallColor: number;
}

/** A care bed needs two tiles of floor space (bed + clearance). */
export const TILES_PER_BED = 2;

export const ROOMS: Record<RoomType, RoomDef> = {
  ward: {
    type: 'ward',
    minSide: 2,
    minArea: 4,
    maxArea: 30,
    baseCostSatang: thb(50_000),
    costPerTileSatang: thb(12_000),
    upkeepPerTileSatang: thb(120),
    equipment: [
      { id: 'care_bed', required: 1, max: (r) => Math.floor(rectArea(r) / TILES_PER_BED) },
      { id: 'call_system', required: 1, max: () => 1 },
    ],
    floorColor: 0xb9d7cf,
    wallColor: 0x4f8a80,
  },
  nursing_station: {
    type: 'nursing_station',
    minSide: 2,
    minArea: 6,
    maxArea: 16,
    baseCostSatang: thb(40_000),
    costPerTileSatang: thb(12_000),
    upkeepPerTileSatang: thb(120),
    equipment: [
      { id: 'nurse_desk', required: 1, max: () => 2 },
      { id: 'med_cart', required: 1, max: () => 2 },
    ],
    floorColor: 0xc5d3ec,
    wallColor: 0x4a6aa5,
  },
  therapy: {
    type: 'therapy',
    minSide: 3,
    minArea: 9,
    maxArea: 24,
    baseCostSatang: thb(40_000),
    costPerTileSatang: thb(12_000),
    upkeepPerTileSatang: thb(100),
    equipment: [
      { id: 'exercise_mat', required: 1, max: (r) => Math.max(1, Math.floor(rectArea(r) / 4)) },
      { id: 'parallel_bars', required: 1, max: () => 2 },
    ],
    floorColor: 0xd5e6c3,
    wallColor: 0x6b8f4e,
  },
  staff_room: {
    type: 'staff_room',
    minSide: 2,
    minArea: 4,
    maxArea: 12,
    baseCostSatang: thb(30_000),
    costPerTileSatang: thb(12_000),
    upkeepPerTileSatang: thb(80),
    equipment: [
      { id: 'lockers', required: 1, max: () => 2 },
      { id: 'rest_sofa', required: 0, max: () => 2 },
    ],
    floorColor: 0xeedcc4,
    wallColor: 0xa77b4f,
  },
};

export const ROOM_TYPES: RoomType[] = ['ward', 'nursing_station', 'therapy', 'staff_room'];

export const CORRIDOR_COST_PER_TILE: Satang = thb(3_000);
export const CORRIDOR_UPKEEP_PER_TILE: Satang = thb(10);

/** Percentage of the original price refunded on demolition / selling equipment. */
export const REFUND_PERCENT = 50;

export function roomConstructionCost(type: RoomType, rect: Rect): Satang {
  const def = ROOMS[type];
  return def.baseCostSatang + def.costPerTileSatang * rectArea(rect);
}

export function equipmentSlot(type: RoomType, id: EquipmentId): EquipmentSlot | undefined {
  return ROOMS[type].equipment.find((e) => e.id === id);
}
