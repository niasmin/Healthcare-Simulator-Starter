import {
  ACTIVITY_FROM,
  ACTIVITY_TO,
  BATH_FROM,
  BATH_MINUTES,
  BATH_SLOTS,
  NAP_FROM,
  NAP_TO,
  NIGHT_FROM,
  NIGHT_TO,
  VISIT_EVERY,
  VISIT_MINUTES,
  VISIT_POOR_CARE,
  VISIT_SLOTS,
} from '../../data/routine';
import { wellbeing } from './needs';
import type { GameState, Resident } from '../../domain/types';
import { MINUTES_PER_DAY } from '../constants';
import { log } from '../helpers';
import { dayOf } from './time';

function hash(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x27d4eb2f);
  return (h ^ (h >>> 13)) >>> 0;
}

const idNumber = (id: string) => {
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (Math.imul(n, 31) + id.charCodeAt(i)) | 0;
  return n;
};

/** Today's family visit for a resident, as [start, end) minutes of the day, or null. */
export function visitOf(seed: number, day: number, residentId: string): [number, number] | null {
  const h = hash(seed, day, idNumber(residentId));
  if (h % VISIT_EVERY !== 0) return null;
  const start = VISIT_SLOTS[(h >>> 8) % VISIT_SLOTS.length];
  return [start, start + VISIT_MINUTES];
}

/** A resident's half-hour turn in the bathroom this morning, as [start, end). */
export function bathOf(seed: number, day: number, residentId: string): [number, number] {
  const start = BATH_FROM + ((hash(seed + 17, day, idNumber(residentId)) >>> 4) % BATH_SLOTS) * BATH_MINUTES;
  return [start, start + BATH_MINUTES];
}

export type RoutineStep = 'sleep' | 'bath' | 'activity' | 'nap' | 'visit' | 'free';

/** What a resident's day has them doing at this minute (before care tasks, strolls and meals). */
export function routineAt(state: GameState, r: Resident, minute = state.minute): RoutineStep {
  const m = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const day = dayOf(minute);
  const visit = visitOf(state.seed, day, r.id);
  if (visit && m >= visit[0] && m < visit[1]) return 'visit';
  if (m >= NIGHT_FROM || m < NIGHT_TO) return 'sleep';
  if (m >= NAP_FROM && m < NAP_TO) return 'nap';
  const bath = bathOf(state.seed, day, r.id);
  if (m >= bath[0] && m < bath[1]) return 'bath';
  if (m >= ACTIVITY_FROM && m < ACTIVITY_TO) return 'activity';
  return 'free';
}

/**
 * When a family visit starts, a family who find poor care say so (the log). Visits are otherwise
 * looks: families already weigh fees and care every day in their satisfaction.
 */
export function visitsTick(state: GameState): GameState {
  const m = state.minute % MINUTES_PER_DAY;
  if (!VISIT_SLOTS.includes(m) || !state.residents.length) return state;
  const day = dayOf(state.minute);
  let s = state;
  for (const r of state.residents)
    if (visitOf(state.seed, day, r.id)?.[0] === m && wellbeing(r.needs) < VISIT_POOR_CARE) s = log(s, 'warn', 'log.family_worried', { name: r.name.th, nameEn: r.name.en });
  return s;
}
