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
  const open: Array<{ ids: string[]; share: number; order: number; secured: boolean }> = [];
  state.site.rooms.forEach((room, order) => {
    if (room.type !== (premium ? 'villa' : 'ward')) return;
    const st = statuses.get(room.id)!;
    if (!st.operational) return;
    if (needs && !premium && !needs.every((k) => (room.equipment[k] ?? 0) > 0)) return;
    // Other residents fill ordinary wards first, keeping specialised beds for those who need them.
    const secured = !needs && PROGRAMME_EQUIPMENT.some((k) => (room.equipment[k] ?? 0) > 0);
    const ids: string[] = [];
    let used = 0;
    for (let i = 0; i < st.capacity; i++) {
      const id = bedId(room.id, i);
      if (taken.has(id)) used++;
      else ids.push(id);
    }
    if (ids.length) open.push({ ids, share: used / st.capacity, order, secured });
  });
  // The emptiest ward first (ties in building order), so every ward is used and none sits idle.
  open.sort((a, b) => Number(a.secured) - Number(b.secured) || a.share - b.share || a.order - b.order);
  return open.flatMap((w) => w.ids);
}

export function roomOfResident(state: GameState, residentBedId: string): Room | undefined {
  const { roomId } = parseBedId(residentBedId);
  return state.site.rooms.find((r) => r.id === roomId);
}
