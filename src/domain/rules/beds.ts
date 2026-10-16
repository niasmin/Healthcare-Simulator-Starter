import type { GameState, Room } from '../types';
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
export function freeBeds(state: GameState): string[] {
  const statuses = allRoomStatuses(state.site);
  const taken = new Set(state.residents.map((r) => r.bedId));
  const out: string[] = [];
  for (const room of state.site.rooms) {
    if (room.type !== 'ward') continue;
    const st = statuses.get(room.id)!;
    if (!st.operational) continue;
    for (let i = 0; i < st.capacity; i++) {
      const id = bedId(room.id, i);
      if (!taken.has(id)) out.push(id);
    }
  }
  return out;
}

export function roomOfResident(state: GameState, residentBedId: string): Room | undefined {
  const { roomId } = parseBedId(residentBedId);
  return state.site.rooms.find((r) => r.id === roomId);
}
