import { thb } from '../../domain/money';
import { CHAPTERS } from '../../data/chapters';
import type { EmpireState, EmpireYear, GameState } from '../../domain/types';
import { log } from '../helpers';
import { entryDay } from '../selectors';
import { dayOf } from './time';

/**
 * Empire years ("ปีอาณาจักร"): endless yearly goals once the story is over, and in free play from
 * the start. Each year lasts YEAR_DAYS game days and asks a little more than the last; it is
 * judged at its last midnight, pays stars when won, and the next year starts straight away. A
 * missed year is only recorded: the game goes on. Pure and deterministic. FICTIONAL BALANCING.
 */

export const YEAR_DAYS = 60;
/** Stars for a won year: base plus a little more each year. */
export const YEAR_STARS = 5;
/** Years kept on record. */
const KEEP = 12;
const INVESTMENT = new Set(['capital', 'construction', 'equipment', 'refund', 'loan', 'branch']);

export interface YearTarget {
  key: 'residents' | 'reputation' | 'cash' | 'perks' | 'net';
  need: number;
  have: number;
  ok: boolean;
}

/** Empire years run in free play, and in the campaign once the last chapter is won. */
export function empireActive(state: GameState): boolean {
  if (state.mode === 'sandbox') return true;
  if (state.mode === 'challenge') return false;
  const last = CHAPTERS.length;
  return state.chapter.id === last && state.chapter.result?.outcome === 'won';
}

export function yearTargets(state: GameState, year: number, startDay: number, lastDay = dayOf(state.minute) - 1): YearTarget[] {
  // Running profit: income less running costs (building, equipment, upgrades, sales and loans are
  // investment, not the year's trading).
  const net = state.ledger
    .filter((e) => !INVESTMENT.has(e.category) && entryDay(e) >= startDay && entryDay(e) <= lastDay)
    .reduce((a, e) => a + e.amountSatang, 0);
  const t = (key: YearTarget['key'], need: number, have: number): YearTarget => ({ key, need, have, ok: have >= need });
  return [
    t('residents', 8 + 4 * year, state.residents.length),
    t('reputation', Math.min(90, 55 + 3 * year), Math.round(state.organization.reputation)),
    t('cash', thb(1_000_000) * year, state.organization.cashSatang),
    t('perks', Math.min(24, year), (state.perks ?? []).length),
    t('net', 1, net),
  ];
}

function fresh(year: number, startDay: number, past: EmpireYear[] = []): EmpireState {
  return { year, startDay, past };
}

/** Midnight: start the first year when empire play begins; judge a year at its end and start the next. */
export function empireDayEnd(state: GameState, closingDay: number): GameState {
  if (!empireActive(state)) return state;
  if (!state.empire) return log({ ...state, empire: fresh(1, closingDay + 1) }, 'good', 'empire.log.start', { year: 1 });
  const e = state.empire;
  if (closingDay < e.startDay + YEAR_DAYS - 1) return state;
  const targets = yearTargets(state, e.year, e.startDay, closingDay);
  const won = targets.every((x) => x.ok);
  const stars = won ? YEAR_STARS + e.year : 0;
  const record: EmpireYear = { year: e.year, won, day: closingDay, stars };
  let s: GameState = { ...state, empire: fresh(e.year + 1, closingDay + 1, [...e.past, record].slice(-KEEP)) };
  if (stars && s.goals) s = { ...s, goals: { ...s.goals, stars: s.goals.stars + stars } };
  return log(s, won ? 'good' : 'warn', won ? 'empire.log.won' : 'empire.log.missed', { year: e.year, stars });
}

/** Days left in the running year (including today). */
export function yearDaysLeft(state: GameState): number {
  if (!state.empire) return 0;
  return Math.max(0, state.empire.startDay + YEAR_DAYS - dayOf(state.minute));
}
