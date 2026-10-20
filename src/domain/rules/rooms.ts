import { BED_ROOMS, ROOMS } from '../../data/rooms';
import type { EquipmentId, Room, Site } from '../types';
import { findDoor, reachableCorridor, type Door } from './navigation';

export type RoomIssue =
  | { kind: 'no_access' }
  | { kind: 'missing_equipment'; equipment: EquipmentId; need: number; have: number };

export interface RoomStatus {
  operational: boolean;
  door: Door | null;
  issues: RoomIssue[];
  /** Resident capacity provided by this room when operational (wards and villas). */
  capacity: number;
  /** Beds physically installed regardless of operational status. */
  installedBeds: number;
}

export function equipmentCount(room: Room, id: EquipmentId): number {
  return room.equipment[id] ?? 0;
}

/**
 * GDD rule: a room cannot operate without required equipment and a navigable entrance.
 */
export function roomStatus(room: Room, site: Site, reachable: Uint8Array = reachableCorridor(site)): RoomStatus {
  const def = ROOMS[room.type];
  const issues: RoomIssue[] = [];
  const door = findDoor(room, site, reachable);
  if (!door) issues.push({ kind: 'no_access' });
  for (const slot of def.equipment) {
    const have = equipmentCount(room, slot.id);
    if (have < slot.required) issues.push({ kind: 'missing_equipment', equipment: slot.id, need: slot.required, have });
  }
  const operational = issues.length === 0;
  const installedBeds = BED_ROOMS.includes(room.type) ? equipmentCount(room, 'care_bed') : 0;
  return { operational, door, issues, capacity: operational ? installedBeds : 0, installedBeds };
}

export function allRoomStatuses(site: Site): Map<string, RoomStatus> {
  const reachable = reachableCorridor(site);
  const out = new Map<string, RoomStatus>();
  for (const room of site.rooms) out.set(room.id, roomStatus(room, site, reachable));
  return out;
}
