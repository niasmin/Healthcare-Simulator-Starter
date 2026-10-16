import { DAILY_EVENT_CHANCE, EVENT_DEFS, EVENT_EXPIRY_MINUTES, EVENT_ORDER, MIN_DAYS_BETWEEN_EVENTS, REFERRAL_COUNT, REFERRAL_DAYS } from '../../data/events';
import { freeBeds } from '../../domain/rules/beds';
import { isOnShift } from '../../domain/rules/shifts';
import type { ActiveEvent, CommandResult, EventDefId, GameState, NeedKey, Resident } from '../../domain/types';
import { allocId, log, post, randInt } from '../helpers';
import { recordService } from './billing';
import { applyNeedDelta } from './needs';
import { makeResidentCandidate, removeEmployee } from './staffing';
import { dayOf } from './time';

/**
 * Event system: data-driven triggers (eligibility + weight + cooldown), a seeded roll at 09:00,
 * player choices with costs and requirements, auto-pause on arrival, and a default choice
 * applied if the event is left unanswered for 12 game hours.
 */

const NURSE = (role: string) => role === 'rn' || role === 'pn';

function eligible(state: GameState, id: EventDefId): boolean {
  const day = dayOf(state.minute);
  const def = EVENT_DEFS[id];
  if (day < def.minDay) return false;
  if ((state.events.cooldownUntil[id] ?? 0) > day) return false;
  switch (id) {
    case 'family_visit':
      return state.residents.length > 0;
    case 'resident_change':
      return state.residents.some((r) => r.careLevel >= 3 || r.needs.physical < 50);
    case 'staff_resign':
      return state.employees.filter((e) => NURSE(e.role)).length >= 2;
    case 'referral':
      return state.organization.reputation >= 55;
  }
}

function weightOf(state: GameState, id: EventDefId): number {
  let w = EVENT_DEFS[id].weight;
  if (id === 'staff_resign') {
    const nurses = state.employees.filter((e) => NURSE(e.role));
    const avg = nurses.reduce((a, e) => a + e.morale, 0) / Math.max(1, nurses.length);
    if (avg < 60) w += 3;
  }
  return w;
}

function pickResident(state: GameState, pool: Resident[]): [GameState, Resident] {
  const [s, i] = randInt(state, 0, pool.length - 1);
  return [s, pool[i]];
}

/** Try to start an event (called at 09:00 every day). Pure and seeded. */
export function eventCheck(state: GameState): GameState {
  if (state.events.active) return state;
  const last = state.events.history[state.events.history.length - 1];
  if (last && dayOf(state.minute) - last.day < MIN_DAYS_BETWEEN_EVENTS) return state;
  let s = state;
  let roll: number;
  [s, roll] = randInt(s, 0, 99);
  if (roll >= DAILY_EVENT_CHANCE) return s;
  const pool = EVENT_ORDER.filter((id) => eligible(s, id));
  if (!pool.length) return s;
  const total = pool.reduce((a, id) => a + weightOf(s, id), 0);
  let pick: number;
  [s, pick] = randInt(s, 1, total);
  let defId = pool[0];
  for (const id of pool) {
    pick -= weightOf(s, id);
    if (pick <= 0) {
      defId = id;
      break;
    }
  }
  return fireEvent(s, defId);
}

/** Start a specific event now (also used by tests and the scripted tutorial later). */
export function fireEvent(state: GameState, defId: EventDefId): GameState {
  let s = state;
  let id: string;
  [s, id] = allocId(s, 'evt');
  const active: ActiveEvent = { id, defId, firedAt: s.minute, expiresAt: s.minute + EVENT_EXPIRY_MINUTES, speedBefore: s.speed };
  if (defId === 'family_visit') {
    let r: Resident;
    [s, r] = pickResident(s, s.residents);
    active.residentId = r.id;
  } else if (defId === 'resident_change') {
    let r: Resident;
    [s, r] = pickResident(s, s.residents.filter((x) => x.careLevel >= 3 || x.needs.physical < 50));
    active.residentId = r.id;
  } else if (defId === 'staff_resign') {
    const nurses = s.employees.filter((e) => NURSE(e.role)).sort((a, b) => a.morale - b.morale || (a.id < b.id ? -1 : 1));
    active.employeeIds = nurses.slice(0, 2).map((e) => e.id);
  }
  s = { ...s, speed: 0, events: { ...s.events, active } };
  return log(s, 'warn', `event.${defId}.title`);
}

function residentDelta(state: GameState, residentId: string | undefined, d: Partial<Record<NeedKey, number>>): GameState {
  if (!residentId) return state;
  return { ...state, residents: state.residents.map((r) => (r.id === residentId ? { ...r, needs: applyNeedDelta(r.needs, d) } : r)) };
}

function reputation(state: GameState, delta: number): GameState {
  const rep = Math.max(0, Math.min(100, Math.round((state.organization.reputation + delta) * 10) / 10));
  return { ...state, organization: { ...state.organization, reputation: rep } };
}

/** Why a choice can't be taken right now, or null. */
export function choiceBlocker(state: GameState, choiceId: string): 'needs_rn_on_shift' | 'insufficient_funds' | null {
  const active = state.events.active;
  if (!active) return null;
  const choice = EVENT_DEFS[active.defId].choices.find((c) => c.id === choiceId);
  if (!choice) return null;
  if (choice.requires === 'rn_on_shift' && !state.employees.some((e) => e.role === 'rn' && isOnShift(state, e.id, state.minute))) return 'needs_rn_on_shift';
  if (choice.costSatang > 0 && state.organization.cashSatang < choice.costSatang) return 'insufficient_funds';
  return null;
}

export function resolveEvent(state: GameState, choiceId: string, auto = false): { state: GameState; result: CommandResult } {
  const active = state.events.active;
  if (!active) return { state, result: { ok: false, reason: 'no_event' } };
  const def = EVENT_DEFS[active.defId];
  const choice = def.choices.find((c) => c.id === choiceId);
  if (!choice) return { state, result: { ok: false, reason: 'invalid_choice' } };
  const blocker = choiceBlocker(state, choiceId);
  if (blocker) return { state, result: { ok: false, reason: blocker } };

  let s = state;
  if (choice.costSatang > 0) s = post(s, -choice.costSatang, 'event', `event.${def.id}.ledger.${choice.id}`, { ref: active.id });
  const rid = active.residentId;
  const day = dayOf(s.minute);

  switch (`${def.id}:${choice.id}`) {
    case 'family_visit:special':
      s = residentDelta(s, rid, { happiness: 20, satisfaction: 15, mental: 6 });
      if (rid) s = recordService(s, rid, 'special');
      s = reputation(s, 2);
      break;
    case 'family_visit:standard':
      s = residentDelta(s, rid, { happiness: 8, satisfaction: 6 });
      s = reputation(s, 0.5);
      break;
    case 'family_visit:postpone':
      s = residentDelta(s, rid, { happiness: -5, satisfaction: -10 });
      s = reputation(s, -1);
      break;

    case 'resident_change:assess': {
      // An on-duty RN (the least busy one) spends an hour on an urgent assessment; their queue waits.
      const rn = s.employees.filter((e) => e.role === 'rn' && isOnShift(s, e.id, s.minute)).sort((a, b) => a.busyUntil - b.busyUntil || (a.id < b.id ? -1 : 1))[0];
      s = { ...s, employees: s.employees.map((e) => (e.id === rn.id ? { ...e, busyUntil: Math.max(e.busyUntil, s.minute) + 60, energy: Math.max(0, e.energy - 8) } : e)) };
      s = residentDelta(s, rid, { physical: 6, satisfaction: 6 });
      s = reputation(s, 1);
      break;
    }
    case 'resident_change:refer':
      s = residentDelta(s, rid, { physical: 10, satisfaction: 8 });
      s = reputation(s, 1);
      break;
    case 'resident_change:monitor':
      s = residentDelta(s, rid, { physical: -12, satisfaction: -10 });
      s = reputation(s, -3);
      break;

    case 'staff_resign:raise':
      s = {
        ...s,
        employees: s.employees.map((e) =>
          active.employeeIds?.includes(e.id) ? { ...e, wageMonthlySatang: Math.floor((e.wageMonthlySatang * 1.1) / 100) * 100, morale: Math.min(100, e.morale + 20) } : e,
        ),
      };
      break;
    case 'staff_resign:bonus':
      s = { ...s, employees: s.employees.map((e) => (active.employeeIds?.includes(e.id) ? { ...e, morale: Math.min(100, e.morale + 12) } : e)) };
      break;
    case 'staff_resign:accept':
      for (const id of active.employeeIds ?? []) s = removeEmployee(s, id);
      break;

    case 'referral:accept_all':
      for (let i = 0; i < REFERRAL_COUNT; i++) s = makeResidentCandidate(s, { group: 'stroke_rehab', referralDeadline: day + REFERRAL_DAYS });
      s = reputation(s, 2);
      break;
    case 'referral:accept_beds': {
      const n = Math.min(REFERRAL_COUNT, freeBeds(s).length);
      for (let i = 0; i < n; i++) s = makeResidentCandidate(s, { group: 'stroke_rehab', referralDeadline: day + 5 });
      s = reputation(s, n > 0 ? 1 : 0);
      break;
    }
    case 'referral:decline':
      break;
  }

  s = {
    ...s,
    speed: auto ? s.speed : active.speedBefore,
    events: {
      active: null,
      cooldownUntil: { ...s.events.cooldownUntil, [def.id]: day + def.cooldownDays },
      history: [...s.events.history, { defId: def.id, choiceId: choice.id, day, auto }].slice(-50),
    },
  };
  s = log(s, auto ? 'warn' : 'info', `event.${def.id}.result.${choice.id}`);
  return { state: s, result: { ok: true } };
}

/** Each tick: an unanswered event past its expiry resolves with the default choice. */
export function eventExpiryTick(state: GameState): GameState {
  const a = state.events.active;
  if (!a || state.minute < a.expiresAt) return state;
  return resolveEvent(state, EVENT_DEFS[a.defId].defaultChoice, true).state;
}

/** Day end: referral candidates past their deadline leave, and the partner hospital is let down. */
export function expireReferrals(state: GameState, closingDay: number): GameState {
  const expired = state.waitlist.filter((c) => c.referralDeadline !== undefined && c.referralDeadline <= closingDay);
  if (!expired.length) return state;
  let s: GameState = { ...state, waitlist: state.waitlist.filter((c) => !expired.includes(c)) };
  s = reputation(s, -expired.length);
  return log(s, 'warn', 'log.referral_expired', { n: expired.length });
}
