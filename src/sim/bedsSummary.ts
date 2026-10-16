import { allRoomStatuses } from '../domain/rules/rooms';
import type { GameState } from '../domain/types';

/** Operational bed capacity across all wards. */
export function summarizeBeds(state: GameState): number {
  const statuses = allRoomStatuses(state.site);
  let n = 0;
  for (const st of statuses.values()) n += st.capacity;
  return n;
}
