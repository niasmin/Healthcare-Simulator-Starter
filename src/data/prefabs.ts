import { EQUIPMENT, roomConstructionCost } from './rooms';
import type { EquipmentId, Rect, RoomType } from '../domain/types';

/**
 * Ready-made rooms ("ห้องสำเร็จรูป"): one tap places the room AND installs its equipment.
 * They cost exactly what building and fitting the same room by hand costs, and go through the
 * same placement and equipment rules, so they are a convenience, never a discount.
 */
export interface PrefabDef {
  id: string;
  roomType: RoomType;
  /** Footprint before rotation. */
  w: number;
  h: number;
  equipment: Partial<Record<EquipmentId, number>>;
}

export const PREFABS: PrefabDef[] = [
  { id: 'ward10', roomType: 'ward', w: 4, h: 5, equipment: { care_bed: 10, call_system: 1 } },
  { id: 'ward15', roomType: 'ward', w: 5, h: 6, equipment: { care_bed: 15, call_system: 1 } },
  { id: 'station', roomType: 'nursing_station', w: 3, h: 3, equipment: { nurse_desk: 1, med_cart: 1 } },
  { id: 'therapy', roomType: 'therapy', w: 3, h: 3, equipment: { exercise_mat: 1, parallel_bars: 1 } },
  { id: 'staff', roomType: 'staff_room', w: 2, h: 3, equipment: { lockers: 1, rest_sofa: 1 } },
  { id: 'villa', roomType: 'villa', w: 3, h: 3, equipment: { care_bed: 1, call_system: 1, rest_sofa: 1 } },
  { id: 'homecare', roomType: 'homecare_office', w: 4, h: 3, equipment: { nurse_desk: 1, care_van: 1 } },
  { id: 'training', roomType: 'training_room', w: 2, h: 3, equipment: { whiteboard: 1, training_manikin: 2 } },
  { id: 'clinic', roomType: 'neuro_clinic', w: 4, h: 3, equipment: { waiting_chairs: 1, exam_desk: 2 } },
  { id: 'stroke', roomType: 'stroke_unit', w: 4, h: 3, equipment: { care_bed: 6, call_system: 1, vital_monitor: 1 } },
  { id: 'pharmacy', roomType: 'pharmacy', w: 2, h: 2, equipment: { medicine_shelf: 2 } },
  { id: 'dining', roomType: 'dining_room', w: 3, h: 3, equipment: { dining_table: 3 } },
  { id: 'laundry', roomType: 'laundry_room', w: 2, h: 2, equipment: { washer: 2 } },
  { id: 'reception', roomType: 'reception', w: 3, h: 2, equipment: { reception_desk: 1, waiting_chairs: 1 } },
  { id: 'storage', roomType: 'storage_room', w: 2, h: 2, equipment: { storage_rack: 2 } },
];

export function prefabDef(id: string): PrefabDef | undefined {
  return PREFABS.find((p) => p.id === id);
}

/** Footprint with its top-left corner at `origin`; `rotated` swaps width and height. */
export function prefabRect(def: PrefabDef, origin: { x: number; y: number }, rotated = false): Rect {
  return { x: origin.x, y: origin.y, w: rotated ? def.h : def.w, h: rotated ? def.w : def.h };
}

export function prefabCost(def: PrefabDef, rect: Rect = prefabRect(def, { x: 0, y: 0 })): number {
  let total = roomConstructionCost(def.roomType, rect);
  for (const [id, n] of Object.entries(def.equipment) as [EquipmentId, number][]) total += EQUIPMENT[id].costSatang * n;
  return total;
}
