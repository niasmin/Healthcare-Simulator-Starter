import { CORRIDOR_UPKEEP_PER_TILE, ROOMS } from '../../data/rooms';
import { rectArea } from '../../domain/grid';
import type { GameState, Satang } from '../../domain/types';
import { post } from '../helpers';
import { dayOf } from './time';

/** Daily building upkeep (cleaning, utilities). Fictional balancing values. */
export function dailyUpkeep(state: GameState): Satang {
  let total = 0;
  for (const room of state.site.rooms) total += ROOMS[room.type].upkeepPerTileSatang * rectArea(room.rect);
  const corridorTiles = state.site.corridor.reduce((a, b) => a + b, 0);
  total += CORRIDOR_UPKEEP_PER_TILE * corridorTiles;
  return total;
}

/** Runs once at each midnight. One upkeep entry per day, referenced by day number. */
export function chargeDailyUpkeep(state: GameState): GameState {
  const amount = dailyUpkeep(state);
  if (amount <= 0) return state;
  const day = dayOf(state.minute - 1); // the day that just ended
  return post(state, -amount, 'upkeep', 'ledger.upkeep', { ref: `day-${day}`, memoParams: { day } });
}
