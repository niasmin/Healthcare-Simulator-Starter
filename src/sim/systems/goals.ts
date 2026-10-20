import { CITY_ORDER } from '../../data/city';
import { ACHIEVEMENTS, ALL_MISSIONS_BONUS, MISSIONS, MISSION_ORDER, MISSIONS_PER_DAY } from '../../data/goals';
import { ROLE_ORDER } from '../../data/staff';
import { allRoomStatuses } from '../../domain/rules/rooms';
import type { AchievementId, GameState, GoalsState, MissionId } from '../../domain/types';
import { summarizeBeds } from '../bedsSummary';
import { townRanking } from '../rivalStats';
import { dayOf } from './time';

/**
 * Daily missions and achievements. Pure and deterministic: a day's three missions come from a hash
 * of the seed and the day (the game's RNG is never touched), progress is read from the state, and
 * rewards are stars (no cash). Nothing is written to the event log (it is capped, and other
 * entries matter more); the UI announces new completions itself. Missions are checked every hour (those marked `end` when the
 * day closes); achievements every hour.
 */

const EMPTY: GoalsState = { day: 0, done: [], total: 0, streak: 0, stars: 0, achievements: {} };
export const goalsOf = (state: GameState): GoalsState => state.goals ?? EMPTY;

function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x27d4eb2f);
  return (h ^ (h >>> 13)) >>> 0;
}

/** The day's three missions, in a fixed order for that seed and day. */
export function missionsFor(state: GameState, day: number): MissionId[] {
  return [...MISSION_ORDER]
    .map((id, i) => ({ id, k: hash(state.seed + i * 7919, day) }))
    .sort((a, b) => a.k - b.k)
    .slice(0, MISSIONS_PER_DAY)
    .map((x) => x.id);
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Whether a mission's target is reached right now, for the given day. */
export function missionMet(state: GameState, id: MissionId, day: number): boolean {
  switch (id) {
    case 'no_missed':
      return state.today.done > 0 && state.today.missed === 0;
    case 'tasks40':
      return state.today.done >= 40;
    case 'admit_one':
      return state.residents.some((r) => dayOf(r.admittedAt) === day);
    case 'hire_one':
      return state.employees.some((e) => dayOf(e.hiredAt) === day);
    case 'outing':
      return Object.values(state.city?.used ?? {}).includes(day);
    case 'satisfied75':
      return state.residents.length > 0 && avg(state.residents.map((r) => r.needs.satisfaction)) >= 75;
    case 'happy70':
      return state.residents.length > 0 && avg(state.residents.map((r) => r.needs.happiness)) >= 70;
    case 'cash_up': {
      const last = state.history[state.history.length - 1];
      return !!last && state.organization.cashSatang > last.cash;
    }
    case 'full_beds': {
      const beds = summarizeBeds(state);
      return beds > 0 && state.residents.length >= beds;
    }
  }
}

/** Whether an achievement's condition holds now. */
export function achievementMet(state: GameState, id: AchievementId): boolean {
  switch (id) {
    case 'first_resident':
      return state.residents.length >= 1;
    case 'full_ward':
      return state.residents.length >= 10;
    case 'beds30':
      return summarizeBeds(state) >= 30;
    case 'beds60':
      return summarizeBeds(state) >= 60;
    case 'villas3': {
      const st = allRoomStatuses(state.site);
      return state.site.rooms.filter((r) => r.type === 'villa' && st.get(r.id)?.operational).length >= 3;
    }
    case 'team20':
      return state.employees.length >= 20;
    case 'all_roles':
      return ROLE_ORDER.every((role) => state.employees.some((e) => e.role === role));
    case 'perfect_day': {
      const last = state.history[state.history.length - 1];
      return !!last && last.done > 0 && last.missed === 0;
    }
    case 'happy_week': {
      const week = state.history.slice(-7);
      return week.length === 7 && week.every((d) => d.satisfaction >= 85);
    }
    case 'shopper':
      return (state.upgrades?.length ?? 0) >= 5;
    case 'town_tour':
      return CITY_ORDER.every((p) => state.city?.used[p] !== undefined);
    case 'top_town': {
      const top = townRanking(state, { th: '', en: '' })[0];
      return top.you && state.residents.length > 0;
    }
    case 'missions10':
      return goalsOf(state).total >= 10;
    case 'missions50':
      return goalsOf(state).total >= 50;
  }
}

const complete = (g: GoalsState, id: MissionId): GoalsState => ({ ...g, done: [...g.done, id], total: g.total + 1, stars: g.stars + MISSIONS[id].reward });

function checkAchievements(state: GameState, g: GoalsState): GoalsState {
  let goals = g;
  for (const a of ACHIEVEMENTS) {
    if (goals.achievements[a.id] !== undefined) continue;
    // Each check sees the totals so far (the missions counter can unlock two in one hour).
    if (!achievementMet({ ...state, goals }, a.id)) continue;
    goals = { ...goals, achievements: { ...goals.achievements, [a.id]: dayOf(state.minute) }, stars: goals.stars + a.reward };
  }
  return goals;
}

/** Hourly: missions finished during the day, and new achievements. */
export function goalsTick(state: GameState): GameState {
  const day = dayOf(state.minute);
  let g = goalsOf(state);
  if (g.day !== day) g = { ...g, day, done: [] };
  for (const id of missionsFor(state, day)) if (!MISSIONS[id].end && !g.done.includes(id) && missionMet(state, id, day)) g = complete(g, id);
  g = checkAchievements(state, g);
  return g === state.goals ? state : { ...state, goals: g };
}

/** At day close (before the day's counters reset): the end-of-day missions, the full-set bonus and streak. */
export function goalsDayEnd(state: GameState, closingDay: number): GameState {
  let g = goalsOf(state);
  if (g.day !== closingDay) g = { ...g, day: closingDay, done: [] };
  const ids = missionsFor(state, closingDay);
  for (const id of ids) if (!g.done.includes(id) && missionMet(state, id, closingDay)) g = complete(g, id);
  const all = ids.every((id) => g.done.includes(id));
  g = { ...g, stars: g.stars + (all ? ALL_MISSIONS_BONUS : 0), streak: all ? g.streak + 1 : 0, day: closingDay + 1, done: [] };
  return { ...state, goals: g };
}

/** Today's missions with their status, for the UI. */
export function missionsToday(state: GameState): Array<{ id: MissionId; done: boolean; met: boolean }> {
  const day = dayOf(state.minute);
  const g = goalsOf(state);
  const done = g.day === day ? g.done : [];
  return missionsFor(state, day).map((id) => ({ id, done: done.includes(id), met: missionMet(state, id, day) }));
}
