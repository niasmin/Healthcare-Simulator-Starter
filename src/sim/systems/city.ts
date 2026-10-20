import { CITY_PLACES, MALL_DEAL_DAYS } from '../../data/city';
import type { CityPlace, GameState, ReasonCode } from '../../domain/types';
import { clamp, log, post, r2 } from '../helpers';
import { dayOf } from './time';

/** What a visit to a place costs the home today. */
export function cityCost(state: GameState, place: CityPlace): number {
  const def = CITY_PLACES[place];
  return (def.flat ?? 0) + (def.perStaff ?? 0) * state.employees.length + (def.perResident ?? 0) * state.residents.length;
}

/** Why a visit can't happen now, or null. */
export function cityBlocker(state: GameState, place: CityPlace): ReasonCode | null {
  const def = CITY_PLACES[place];
  if (!def) return 'not_found';
  if (state.city?.used[place] === dayOf(state.minute)) return 'already_today';
  if ((def.for === 'staff' && !state.employees.length) || (def.for === 'residents' && !state.residents.length)) return 'nobody_to_treat';
  if (state.organization.cashSatang < cityCost(state, place)) return 'insufficient_funds';
  return null;
}

/** Whether the mall's supply deal is running today. */
export function mallDeal(state: GameState): boolean {
  return (state.city?.mallUntilDay ?? 0) >= dayOf(state.minute);
}

/** Pay for the visit and give everyone it is for their treat. */
export function visitPlace(state: GameState, place: CityPlace): GameState {
  const def = CITY_PLACES[place];
  const day = dayOf(state.minute);
  const cost = cityCost(state, place);
  let s: GameState = {
    ...state,
    city: { ...state.city, used: { ...state.city?.used, [place]: day }, ...(place === 'mall' ? { mallUntilDay: day + MALL_DEAL_DAYS - 1 } : {}) },
  };
  if (def.morale) s = { ...s, employees: s.employees.map((e) => ({ ...e, morale: r2(clamp(e.morale + def.morale!)) })) };
  if (def.happiness || def.satisfaction)
    s = {
      ...s,
      residents: s.residents.map((r) => ({
        ...r,
        needs: { ...r.needs, happiness: r2(clamp(r.needs.happiness + (def.happiness ?? 0))), satisfaction: r2(clamp(r.needs.satisfaction + (def.satisfaction ?? 0))) },
      })),
    };
  if (cost > 0) s = post(s, -cost, 'outing', 'ledger.outing', { memoParams: { place } });
  return log(s, 'good', 'log.outing', { place });
}
