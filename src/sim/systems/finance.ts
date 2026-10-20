import { hasUpgrade, SOLAR_UPKEEP_PERCENT } from '../../data/shop';
import { ACCOUNTANT_COST_PERCENT } from './support';
import { LAUNDRY_UPKEEP_PERCENT, supportActive } from './support';
import { pctOf } from '../../domain/money';
import { CORRIDOR_UPKEEP_PER_TILE, ROOMS } from '../../data/rooms';
import { DECOR_UPKEEP } from '../../data/decor';
import { VAN_COST_PER_DAY } from './homecare';
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
  total += DECOR_UPKEEP * state.site.decor.length;
  // Home Care vans cost fuel and insurance every day.
  total += VAN_COST_PER_DAY * state.site.rooms.reduce((a, r) => a + (r.equipment.care_van ?? 0), 0);
  // In-house laundry and cleaning staff, solar panels and the accountant's checks cut the bill.
  if (supportActive(state, 'cleaner')) total = pctOf(total, LAUNDRY_UPKEEP_PERCENT);
  if (hasUpgrade(state, 'solar_roof')) total = pctOf(total, SOLAR_UPKEEP_PERCENT);
  if (supportActive(state, 'accountant')) total = pctOf(total, ACCOUNTANT_COST_PERCENT);
  return total;
}

/** Runs once at each midnight. One upkeep entry per day, referenced by day number. */
export function chargeDailyUpkeep(state: GameState): GameState {
  const amount = dailyUpkeep(state);
  if (amount <= 0) return state;
  const day = dayOf(state.minute - 1); // the day that just ended
  return post(state, -amount, 'upkeep', 'ledger.upkeep', { ref: `day-${day}`, memoParams: { day } });
}

/** One employee's daily pay: 1/30 of the monthly wage, rounded down to whole baht. */
export function dailyWage(monthlySatang: Satang): Satang {
  return Math.floor(monthlySatang / 30 / 100) * 100;
}

/** Daily payroll for all staff. One ledger entry per day. */
export function dailyPayroll(state: GameState): Satang {
  return state.employees.reduce((a, e) => a + dailyWage(e.wageMonthlySatang), 0);
}

export function chargeDailyPayroll(state: GameState): GameState {
  const amount = dailyPayroll(state);
  if (amount <= 0) return state;
  const day = dayOf(state.minute - 1);
  return post(state, -amount, 'payroll', 'ledger.payroll', { ref: `payroll-day-${day}`, memoParams: { day, n: state.employees.length } });
}
