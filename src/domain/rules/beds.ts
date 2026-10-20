import type { CareGroup, GameState, Room } from '../types';
import { GROUP_WARD_EQUIPMENT, PROGRAMME_EQUIPMENT } from '../../data/patients';
import { allRoomStatuses } from './rooms';

/** Bed ids are `${roomId}#${index}` for index < installed bed count. */
export function bedId(roomId: string, index: number): string {
  return `${roomId}#${index}`;
}

export function parseBedId(id: string): { roomId: string; index: number } {
  const i = id.lastIndexOf('#');
  return { roomId: id.slice(0, i), index: Number(id.slice(i + 1)) };
}

export function residentsInRoom(state: GameState, roomId: string) {
  return state.residents.filter((r) => parseBedId(r.bedId).roomId === roomId);
}

/**
 * Free beds in OPERATIONAL wards, in deterministic order (room order, then index).
 * Invariant: a bed id is never held by two residents.
 */
/** Premium residents only take villa beds; everyone else takes ward beds. */
export function freeBeds(state: GameState, group?: CareGroup, premium = false): string[] {
  const statuses = allRoomStatuses(state.site);
  const taken = new Set(state.residents.map((r) => r.bedId));
  const needs = group ? GROUP_WARD_EQUIPMENT[group] : undefined;
  const out: string[] = [];
  const secured: string[] = [];
  for (const room of state.site.rooms) {
    if (room.type !== (premium ? 'villa' : 'ward')) continue;
    const st = statuses.get(room.id)!;
    if (!st.operational) continue;
    if (needs && !premium && !needs.every((k) => (room.equipment[k] ?? 0) > 0)) continue;
    // Other residents fill ordinary wards first, keeping specialised beds for those who need them.
    const list = !needs && PROGRAMME_EQUIPMENT.some((k) => (room.equipment[k] ?? 0) > 0) ? secured : out;
    for (let i = 0; i < st.capacity; i++) {
      const id = bedId(room.id, i);
      if (!taken.has(id)) list.push(id);
    }
  }
  return [...out, ...secured];
}

export function roomOfResident(state: GameState, residentBedId: string): Room | undefined {
  const { roomId } = parseBedId(residentBedId);
  return state.site.rooms.find((r) => r.id === roomId);
}
