import { applyCommand, step } from './engine';
import { buildSomewhere } from './autoBuild';
import { buyLand } from './autoCampaign';
import { newGameState } from './modes';
import { summarizeBeds } from './bedsSummary';
import { dayOf } from './systems/time';
import { makeResidentCandidate } from './systems/staffing';
import type { GameState, PersonName } from '../domain/types';

/**
 * Rival centres in town, made up by the game so the player has someone to race. They are not
 * simulated: their numbers grow with the calendar from a fixed recipe (deterministic, no RNG
 * state is touched). A visit builds a look-alike home from the same ready-made rooms the player
 * uses, in a throwaway sandbox state. All names are FICTIONAL.
 */

export type RivalStyle = 'standard' | 'premium' | 'value' | 'rehab';
export interface RivalDef {
  id: string;
  name: PersonName;
  style: RivalStyle;
  /** Beds on day 1, beds added every 10 days, and the most it ever has. */
  startBeds: number;
  growth: number;
  maxBeds: number;
  /** Typical reputation and satisfaction (0..100). */
  reputation: number;
  satisfaction: number;
  /** Typical share of beds taken, percent. */
  occupancy: number;
}

export const RIVALS: RivalDef[] = [
  { id: 'aunrak', name: { th: 'บ้านอุ่นรัก', en: 'Aun Rak House' }, style: 'standard', startBeds: 10, growth: 2, maxBeds: 40, reputation: 55, satisfaction: 66, occupancy: 82 },
  { id: 'lanthong', name: { th: 'ลานทองวิลล่า', en: 'Lan Thong Villas' }, style: 'premium', startBeds: 6, growth: 1, maxBeds: 24, reputation: 68, satisfaction: 78, occupancy: 70 },
  { id: 'ruentawan', name: { th: 'เรือนตะวันรีแฮบ', en: 'Ruen Tawan Rehab' }, style: 'rehab', startBeds: 10, growth: 2, maxBeds: 30, reputation: 60, satisfaction: 70, occupancy: 76 },
  { id: 'jaidee', name: { th: 'ใจดีแคร์', en: 'Jaidee Care' }, style: 'value', startBeds: 15, growth: 3, maxBeds: 60, reputation: 45, satisfaction: 58, occupancy: 90 },
  { id: 'baansuan', name: { th: 'บ้านสวนสุขใจ', en: 'Baan Suan Sukjai' }, style: 'standard', startBeds: 8, growth: 1, maxBeds: 30, reputation: 52, satisfaction: 64, occupancy: 78 },
];

export interface CenterStats {
  beds: number;
  residents: number;
  reputation: number;
  satisfaction: number;
  staff: number;
  score: number;
}

/** One score for the ranking: people cared for count most, then name and family satisfaction. */
export function centerScore(s: Omit<CenterStats, 'score'>): number {
  return Math.round(s.residents * 10 + s.beds * 2 + s.reputation * 5 + s.satisfaction * 3);
}

/** A small, repeatable wobble in -1..1 for a rival on a day. */
function wobble(id: string, day: number): number {
  let h = 2166136261;
  for (const ch of `${id}:${day}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 2001) / 1000 - 1;
}

export function rivalStats(r: RivalDef, day: number): CenterStats {
  const beds = Math.min(r.maxBeds, r.startBeds + Math.floor((day - 1) / 10) * r.growth);
  const residents = Math.min(beds, Math.round((beds * (r.occupancy + wobble(r.id, day) * 8)) / 100));
  const reputation = Math.round(Math.max(0, Math.min(100, r.reputation + wobble(r.id, day + 1000) * 6 + Math.min(10, day / 15))));
  const satisfaction = Math.round(Math.max(0, Math.min(100, r.satisfaction + wobble(r.id, day + 2000) * 5)));
  const staff = Math.ceil(residents / 2.5) + 2;
  const base = { beds, residents, reputation, satisfaction, staff };
  return { ...base, score: centerScore(base) };
}

export function playerStats(state: GameState): CenterStats {
  const n = state.residents.length;
  const base = {
    beds: summarizeBeds(state),
    residents: n,
    reputation: Math.round(state.organization.reputation),
    satisfaction: n ? Math.round(state.residents.reduce((a, r) => a + r.needs.satisfaction, 0) / n) : 0,
    staff: state.employees.length,
  };
  return { ...base, score: centerScore(base) };
}

export interface RankRow {
  id: string;
  name: PersonName;
  you: boolean;
  style?: RivalStyle;
  stats: CenterStats;
}

/** The town's ranking today: every rival and the player's home, best score first. */
export function townRanking(state: GameState, yourName: PersonName): RankRow[] {
  const day = dayOf(state.minute);
  const rows: RankRow[] = RIVALS.map((r) => ({ id: r.id, name: r.name, you: false, style: r.style, stats: rivalStats(r, day) }));
  rows.push({ id: 'you', name: yourName, you: true, stats: playerStats(state) });
  return rows.sort((a, b) => b.stats.score - a.stats.score || Number(b.you) - Number(a.you));
}

/** The ready-made rooms a rival of this style and size has, in building order. */
export function rivalPlan(r: RivalDef, beds: number): string[] {
  const plan: string[] = [];
  if (r.style === 'premium') {
    plan.push('ward10');
    for (let b = 10; b < beds; b += 2) plan.push('villa');
    plan.push('dining', 'reception');
  } else {
    for (let b = 0; b < beds; b += r.style === 'value' ? 15 : 10) plan.push(r.style === 'value' ? 'ward15' : 'ward10');
    if (r.style === 'rehab') plan.push('therapy', 'bathroom');
    if (r.style === 'standard') plan.push('dining', 'laundry');
    if (r.style === 'value') plan.push('laundry');
  }
  return plan.slice(0, 8);
}

/**
 * A look-alike of a rival's home for the visit view: the starter campus plus its rooms, with
 * residents and staff moved in for a few hours so the map is lived in. Pure and repeatable.
 */
export function rivalSite(r: RivalDef, day: number): GameState {
  const stats = rivalStats(r, day);
  let s = newGameState('starter', 'sandbox', undefined, 1000 + RIVALS.indexOf(r));
  s = { ...s, organization: { ...s.organization, name: r.name.th } };
  for (const prefab of rivalPlan(r, stats.beds)) {
    let built = buildSomewhere(s, applyCommand, prefab);
    if (!built) {
      s = buyLand(s, applyCommand);
      built = buildSomewhere(s, applyCommand, prefab);
    }
    if (built) s = built.state;
  }
  // Families waiting to move in, about as many as the rival has residents.
  for (let i = s.waitlist.length; i < stats.residents; i++) s = makeResidentCandidate(s, r.style === 'premium' && i % 2 ? { group: 'active_aging', premium: true } : undefined);
  s = { ...s, auto: { admit: true, staff: true, carePlan: true, events: true } };
  for (let i = 0; i < 18; i++) s = step(s);
  return s;
}
