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
  door_sensor: { id: 'door_sensor', costSatang: thb(35_000), color: 0x8a5a9e },
  feeding_pump: { id: 'feeding_pump', costSatang: thb(12_000), color: 0xe8eef2 },
  suction_unit: { id: 'suction_unit', costSatang: thb(20_000), color: 0xdfe8f0 },
  care_van: { id: 'care_van', costSatang: thb(180_000), color: 0xf4f6f8 },
  training_manikin: { id: 'training_manikin', costSatang: thb(25_000), color: 0xe9c9a8 },
  whiteboard: { id: 'whiteboard', costSatang: thb(8_000), color: 0xf7f7f2 },
  exam_desk: { id: 'exam_desk', costSatang: thb(45_000), color: 0xdfe6ee },
  waiting_chairs: { id: 'waiting_chairs', costSatang: thb(10_000), color: 0x6d8fb3 },
  vital_monitor: { id: 'vital_monitor', costSatang: thb(40_000), color: 0x3d4b5c },
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
  /** First chapter in which the room can be built (default 1). */
  unlockChapter?: number;
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
    upkeepPerTileSatang: thb(25),
    equipment: [
      { id: 'care_bed', required: 1, max: (r) => Math.floor(rectArea(r) / TILES_PER_BED) },
      { id: 'call_system', required: 1, max: () => 1 },
      // Optional: secures the ward so residents living with dementia can stay there.
      { id: 'door_sensor', required: 0, max: () => 1 },
      // Optional: let the ward take tube-feeding (pump) and tracheostomy (pump + suction) residents.
      { id: 'feeding_pump', required: 0, max: () => 1 },
      { id: 'suction_unit', required: 0, max: () => 1 },
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
    upkeepPerTileSatang: thb(25),
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
    upkeepPerTileSatang: thb(20),
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
    upkeepPerTileSatang: thb(15),
    equipment: [
      { id: 'lockers', required: 1, max: () => 2 },
      { id: 'rest_sofa', required: 0, max: () => 2 },
    ],
    floorColor: 0xeedcc4,
    wallColor: 0xa77b4f,
  },
  villa: {
    type: 'villa',
    minSide: 3,
    minArea: 9,
    maxArea: 16,
    baseCostSatang: thb(80_000),
    costPerTileSatang: thb(10_000),
    upkeepPerTileSatang: thb(45),
    // A private suite for one premium resident: bed, call bell and a living corner.
    equipment: [
      { id: 'care_bed', required: 1, max: () => 1 },
      { id: 'call_system', required: 1, max: () => 1 },
      { id: 'rest_sofa', required: 1, max: () => 1 },
    ],
    floorColor: 0xeadfca,
    wallColor: 0xb08850,
    unlockChapter: 3,
  },
  homecare_office: {
    type: 'homecare_office',
    minSide: 2,
    minArea: 4,
    maxArea: 12,
    baseCostSatang: thb(60_000),
    costPerTileSatang: thb(12_000),
    upkeepPerTileSatang: thb(25),
    // Each van carries one visit at a time.
    equipment: [
      { id: 'nurse_desk', required: 1, max: () => 1 },
      { id: 'care_van', required: 1, max: (r) => Math.max(1, Math.floor(rectArea(r) / 3)) },
    ],
    floorColor: 0xcfe3ec,
    wallColor: 0x3f7f9a,
    unlockChapter: 4,
  },
  training_room: {
    type: 'training_room',
    minSide: 2,
    minArea: 6,
    maxArea: 16,
    baseCostSatang: thb(50_000),
    costPerTileSatang: thb(12_000),
    upkeepPerTileSatang: thb(20),
    // One training manikin per seat: how many staff can be in class at once.
    equipment: [
      { id: 'whiteboard', required: 1, max: () => 1 },
      { id: 'training_manikin', required: 1, max: (r) => Math.max(1, Math.floor(rectArea(r) / 3)) },
    ],
    floorColor: 0xd9e4f0,
    wallColor: 0x2f7d8c,
    unlockChapter: 5,
  },
  // Chapter 6: the outpatient clinic. Each examination desk sees one patient at a time.
  neuro_clinic: {
    type: 'neuro_clinic',
    minSide: 2,
    minArea: 6,
    maxArea: 16,
    baseCostSatang: thb(120_000),
    costPerTileSatang: thb(15_000),
    upkeepPerTileSatang: thb(35),
    equipment: [
      { id: 'waiting_chairs', required: 1, max: () => 1 },
      { id: 'exam_desk', required: 1, max: (r) => Math.max(1, Math.floor(rectArea(r) / 4)) },
    ],
    floorColor: 0xdde7f3,
    wallColor: 0x3b5ba5,
    unlockChapter: 6,
  },
  // Chapter 6: short-stay beds for clinic patients referred for observation and early rehabilitation.
  stroke_unit: {
    type: 'stroke_unit',
    minSide: 2,
    minArea: 6,
    maxArea: 20,
    baseCostSatang: thb(150_000),
    costPerTileSatang: thb(15_000),
    upkeepPerTileSatang: thb(40),
    equipment: [
      { id: 'care_bed', required: 1, max: (r) => Math.floor(rectArea(r) / TILES_PER_BED) },
      { id: 'call_system', required: 1, max: () => 1 },
      { id: 'vital_monitor', required: 1, max: () => 1 },
    ],
    floorColor: 0xe6dff0,
    wallColor: 0x7a4fa0,
    unlockChapter: 6,
  },
};



export const ROOM_TYPES: RoomType[] = ['ward', 'nursing_station', 'therapy', 'staff_room', 'villa', 'homecare_office', 'training_room', 'neuro_clinic', 'stroke_unit'];
/** Rooms whose care beds count as resident capacity. */
export const BED_ROOMS: RoomType[] = ['ward', 'villa'];

export const CORRIDOR_COST_PER_TILE: Satang = thb(3_000);
export const CORRIDOR_UPKEEP_PER_TILE: Satang = thb(5);

/** Percentage of the original price refunded on demolition / selling equipment. */
export const REFUND_PERCENT = 50;

export function roomConstructionCost(type: RoomType, rect: Rect): Satang {
  const def = ROOMS[type];
  return def.baseCostSatang + def.costPerTileSatang * rectArea(rect);
}

export function equipmentSlot(type: RoomType, id: EquipmentId): EquipmentSlot | undefined {
  return ROOMS[type].equipment.find((e) => e.id === id);
}
