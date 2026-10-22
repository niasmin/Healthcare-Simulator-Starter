import {
  CARER_ROLES,
  DRILL_SATANG,
  DRILL_VALID_DAYS,
  FINE_PER_ITEM_SATANG,
  FINE_REPUTATION,
  FIRST_INSPECTION_DAYS,
  FOLLOW_UP_DAYS,
  INSPECTION_EVERY_DAYS,
  INSPECTION_NOTICE_DAYS,
  INSPECTIONS_KEPT,
  PASS_REPUTATION,
  REASSESS_DAYS,
  RESIDENTS_PER_CARER,
  SAFETY_KIT_SATANG,
  STANDARDS,
  TEAM_ROLES,
} from '../../data/standards';
import { reachableCorridor } from '../../domain/rules/navigation';
import { roomStatus } from '../../domain/rules/rooms';
import type { Employee, GameState, ReasonCode, RoomType, StandardId, StandardsState } from '../../domain/types';
import { MINUTES_PER_DAY } from '../constants';
import { log, post } from '../helpers';
import { dayOf } from './time';

export interface StandardCheck {
  id: StandardId;
  ok: boolean;
  /** Numbers for the message (have / need, days ...). */
  params?: Record<string, number>;
}

/** Staff working in the home (not placed with a partner or managing a branch). */
const inHouse = (_s: GameState, e: Employee) => !e.placement && !e.branch;

/** Carers with at least one shift on the roster. */
export function rosteredCarers(state: GameState): number {
  return state.employees.filter((e) => inHouse(state, e) && CARER_ROLES.includes(e.role) && state.shifts.some((x) => x.employeeId === e.id)).length;
}

export function carersNeeded(state: GameState): number {
  return Math.ceil(state.residents.length / RESIDENTS_PER_CARER);
}

/** Days since a resident's assessment (care plan), or null without one. */
export function planAgeDays(state: GameState, createdAt: number): number {
  return Math.floor((state.minute - createdAt) / MINUTES_PER_DAY);
}

/** A care plan this old is due for its three-monthly review. */
export function needsReassessment(state: GameState, createdAt: number): boolean {
  return planAgeDays(state, createdAt) >= REASSESS_DAYS;
}

/**
 * The checklist, computed from the state alone (pure, no PRNG). It can be read whether or not
 * the mode is on, so a player can get ready before switching it on.
 */
export function standardsChecklist(state: GameState): StandardCheck[] {
  const reachable = reachableCorridor(state.site);
  const has = (...types: RoomType[]) => state.site.rooms.some((r) => types.includes(r.type) && roomStatus(r, state.site, reachable).operational);
  const st = state.standards;
  const day = dayOf(state.minute);
  return STANDARDS.map(({ id }): StandardCheck => {
    switch (id) {
      case 'ratio': {
        const have = rosteredCarers(state);
        const need = carersNeeded(state);
        return { id, ok: have >= need, params: { have, need, per: RESIDENTS_PER_CARER } };
      }
      case 'night_watch': {
        const have = state.shifts.filter((x) => x.slot === 'night' && state.employees.some((e) => e.id === x.employeeId && inHouse(state, e) && CARER_ROLES.includes(e.role))).length;
        return { id, ok: state.residents.length === 0 || have > 0, params: { have } };
      }
      case 'coordination':
        return { id, ok: has('nursing_station') };
      case 'common_area':
        return { id, ok: has('therapy', 'dining_room') };
      case 'bathroom':
        return { id, ok: has('bathroom') };
      case 'safety_kit':
        return { id, ok: !!st?.safetyKit };
      case 'drill': {
        const since = st?.drillDay == null ? null : day - st.drillDay;
        return { id, ok: since !== null && since < DRILL_VALID_DAYS, params: since === null ? undefined : { days: DRILL_VALID_DAYS - since } };
      }
      case 'assessment': {
        const due = state.residents.filter((r) => !r.carePlan || needsReassessment(state, r.carePlan.createdAt)).length;
        return { id, ok: due === 0, params: { due } };
      }
      case 'team':
        return { id, ok: state.employees.some((e) => inHouse(state, e) && TEAM_ROLES.includes(e.role)) };
    }
  });
}

export const failedStandards = (state: GameState): StandardId[] => standardsChecklist(state).filter((c) => !c.ok).map((c) => c.id);

/** Switch the mode on (the first inspection comes after a grace period) or off (history kept). */
export function setStandards(state: GameState, on: boolean): GameState {
  const day = dayOf(state.minute);
  const prev = state.standards;
  if (!on) return prev ? { ...state, standards: { ...prev, on: false } } : state;
  if (prev?.on) return state;
  const standards: StandardsState = {
    safetyKit: false,
    drillDay: null,
    history: [],
    ...prev,
    on: true,
    nextInspection: day + FIRST_INSPECTION_DAYS,
    followUp: false,
  };
  return log({ ...state, standards }, 'info', 'log.standards_on', { day: standards.nextInspection });
}

export function safetyKitBlocker(state: GameState): ReasonCode | null {
  if (!state.standards?.on) return 'standards_off';
  if (state.standards.safetyKit) return 'already_done';
  if (state.organization.cashSatang < SAFETY_KIT_SATANG) return 'insufficient_funds';
  return null;
}

export function buySafetyKit(state: GameState): GameState {
  let s = post(state, -SAFETY_KIT_SATANG, 'equipment', 'ledger.safety_kit');
  s = { ...s, standards: { ...s.standards!, safetyKit: true } };
  return log(s, 'good', 'log.safety_kit');
}

export function drillBlocker(state: GameState): ReasonCode | null {
  if (!state.standards?.on) return 'standards_off';
  if (state.standards.drillDay === dayOf(state.minute)) return 'already_done';
  if (state.organization.cashSatang < DRILL_SATANG) return 'insufficient_funds';
  return null;
}

export function runDrill(state: GameState): GameState {
  let s = post(state, -DRILL_SATANG, 'training', 'ledger.drill');
  s = { ...s, standards: { ...s.standards!, drillDay: dayOf(s.minute) } };
  return log(s, 'good', 'log.drill');
}

/** Midnight: warn ahead of a visit, and on the day itself the inspector checks the list. */
export function standardsDayEnd(state: GameState, closingDay: number): GameState {
  const st = state.standards;
  if (!st?.on) return state;
  if (closingDay + INSPECTION_NOTICE_DAYS === st.nextInspection) {
    return log(state, 'warn', 'log.inspection_notice', { days: INSPECTION_NOTICE_DAYS, n: failedStandards(state).length });
  }
  if (closingDay < st.nextInspection) return state;
  const failed = failedStandards(state);
  let s = state;
  let fine = 0;
  let next: Pick<StandardsState, 'nextInspection' | 'followUp'>;
  let reputation = s.organization.reputation;
  if (!failed.length) {
    reputation += PASS_REPUTATION;
    s = log(s, 'good', 'log.inspection_pass');
    next = { nextInspection: closingDay + INSPECTION_EVERY_DAYS, followUp: false };
  } else if (!st.followUp) {
    s = log(s, 'warn', 'log.inspection_order', { n: failed.length, days: FOLLOW_UP_DAYS });
    next = { nextInspection: closingDay + FOLLOW_UP_DAYS, followUp: true };
  } else {
    fine = failed.length * FINE_PER_ITEM_SATANG;
    reputation -= FINE_REPUTATION;
    s = post(s, -fine, 'event', 'ledger.inspection_fine', { memoParams: { n: failed.length } });
    s = log(s, 'warn', 'log.inspection_fine', { n: failed.length });
    next = { nextInspection: closingDay + INSPECTION_EVERY_DAYS, followUp: false };
  }
  reputation = Math.max(0, Math.min(100, reputation));
  const history = [...st.history, { day: closingDay, failed, followUp: st.followUp, fineSatang: fine }].slice(-INSPECTIONS_KEPT);
  return { ...s, organization: { ...s.organization, reputation }, standards: { ...st, ...next, history } };
}
