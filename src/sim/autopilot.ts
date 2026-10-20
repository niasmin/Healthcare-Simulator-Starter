import { EVENT_DEFS } from '../data/events';
import { prefabCost, prefabDef } from '../data/prefabs';
import { thb } from '../domain/money';
import { wageFor } from '../data/staff';
import { freeBeds } from '../domain/rules/beds';
import type { AutoSettings, EventDefId, GameState, ShiftSlot, StaffRole } from '../domain/types';
import { buildSomewhere, tryCmd, type Apply } from './autoBuild';
import { advanceChapter, campaignTurn, dailyCare, heldForWorkforce } from './autoCampaign';
import { chapterDef } from '../data/chapters';
import { SKILL_OWNER } from './selectors';
import { log } from './helpers';
import { dailyRunningCost, rosterView } from './selectors';
import { choiceBlocker } from './systems/events';

/**
 * Autopilot: optional helpers that make the routine decisions for the player, so they can just
 * watch the home run. Every action goes through the same public commands a player would use,
 * so all rules and invariants still hold. Off by default; deterministic (no randomness of its own).
 * - events: answers events and staff requests at once, with a sensible choice, without pausing.
 * - admit: fills free beds from the waiting list (urgent referrals first), and the stroke unit.
 * - carePlan: writes a care plan for every resident who has none (needs an RN on the staff).
 * - staff: hires and rosters staff to the roster advice, one new person per gap.
 * - build: once a day, builds a ready-made room the home is missing (station, staff room, therapy),
 *   another 10-bed ward when every bed is taken and families are waiting, or a villa for premium
 *   families, only where a corridor already reaches and only with a month's running costs to spare.
 */

export const AUTO_KEYS = ['events', 'admit', 'carePlan', 'staff', 'staffCare', 'build', 'garden', 'estate', 'pricing', 'shop', 'homecare', 'training', 'placements', 'branches', 'chapters'] as const;
export type AutoKey = (typeof AUTO_KEYS)[number];
export const AUTO_OFF: Required<AutoSettings> = {
  events: false,
  admit: false,
  carePlan: false,
  staff: false,
  build: false,
  estate: false,
  homecare: false,
  training: false,
  placements: false,
  branches: false,
  shop: false,
  pricing: false,
  garden: false,
  staffCare: false,
  chapters: false,
};
/** How the switches are grouped in the Autopilot window. */
export const AUTO_GROUPS: Array<{ id: string; keys: AutoKey[] }> = [
  { id: 'daily', keys: ['events', 'admit', 'carePlan', 'staff', 'staffCare'] },
  { id: 'growth', keys: ['build', 'garden', 'estate', 'pricing', 'shop'] },
  { id: 'business', keys: ['homecare', 'training', 'placements', 'branches'] },
  { id: 'campaign', keys: ['chapters'] },
];
/** Building keeps this much in the bank on top of 30 days of running costs. */
export const BUILD_RESERVE = thb(200_000);
/** Building happens once a day, at 08:00. */
export const BUILD_MINUTE = 8 * 60;

/** Preferred answers, best first; the first one that can be taken is used. */
export const AUTO_CHOICES: Record<EventDefId, string[]> = {
  family_visit: ['standard', 'special', 'postpone'],
  resident_change: ['assess', 'refer', 'monitor'],
  // A staff member's request is accepted (the raise), keeping the team together.
  staff_resign: ['raise', 'bonus', 'accept'],
  referral: ['accept_beds', 'decline'],
};


export function autoSettings(state: GameState): Required<AutoSettings> {
  return { ...AUTO_OFF, ...state.auto };
}

function answerEvent(state: GameState, apply: Apply): GameState {
  const active = state.events.active;
  if (!active) return state;
  const choice = AUTO_CHOICES[active.defId].find((c) => EVENT_DEFS[active.defId].choices.some((x) => x.id === c) && !choiceBlocker(state, c));
  if (!choice) return state;
  const [s, done] = tryCmd(state, apply, { type: 'resolveEvent', choiceId: choice });
  return done ? log(s, 'info', 'auto.log.event') : s;
}

function admitAll(state: GameState, apply: Apply): GameState {
  let s = state;
  // Urgent referrals first, then a chapter programme nobody is in yet, then the longest waiting.
  const programmes = chapterDef(s.chapter.id).programmes ?? [];
  const missing = (g: string) => programmes.includes(g as never) && !s.residents.some((r) => r.group === g);
  const queue = [...s.waitlist].sort((a, b) => (a.referralDeadline ?? Infinity) - (b.referralDeadline ?? Infinity) || Number(missing(b.group)) - Number(missing(a.group)));
  for (const c of queue) if (freeBeds(s, c.group, !!c.premium).length) [s] = tryCmd(s, apply, { type: 'admitResident', candidateId: c.id });
  for (const r of [...s.hospital.referrals]) {
    let ok: boolean;
    [s, ok] = tryCmd(s, apply, { type: 'admitInpatient', referralId: r.id });
    if (!ok) break;
  }
  return s;
}

function planAll(state: GameState, apply: Apply): GameState {
  let s = state;
  for (const r of state.residents) if (!r.carePlan) [s] = tryCmd(s, apply, { type: 'createCarePlan', residentId: r.id });
  return s;
}

/** Fill each gap in the roster advice: someone on the staff with no shift yet, or a new hire. */
function staffAll(state: GameState, apply: Apply): GameState {
  if (!state.residents.length && !state.hospital.inpatients.length) return state;
  let s = state;
  // Gaps: the RN each day shift needs, skills nobody on the shift has, then each role's headcount.
  const view = rosterView(s);
  const gaps: Array<{ role: StaffRole; slot: ShiftSlot; n: number }> = [];
  for (const sum of view.slots) {
    if (sum.missingRn && !view.cells.some((c) => c.slot === sum.slot && c.role === 'rn' && c.need > c.staff.length)) gaps.push({ role: 'rn', slot: sum.slot, n: 1 });
    for (const k of sum.missingSkills) if (!view.cells.some((c) => c.slot === sum.slot && c.role === SKILL_OWNER[k] && c.need > c.staff.length)) gaps.push({ role: SKILL_OWNER[k], slot: sum.slot, n: 1 });
  }
  for (const c of view.cells) if (c.need > c.staff.length) gaps.push({ role: c.role, slot: c.slot, n: c.need - c.staff.length });
  for (const cell of gaps) {
    for (let gap = cell.n; gap > 0; gap--) {
      const shifted = new Set(s.shifts.map((x) => x.employeeId));
      const idle = s.employees.find((e) => e.role === cell.role && !shifted.has(e.id) && !heldForWorkforce(s, e.id));
      let id = idle?.id;
      if (!id) {
        const c = s.applicants.find((a) => a.role === cell.role);
        // Never hire into debt: keep at least a month's wage for the new person in the bank.
        if (!c || s.organization.cashSatang < wageFor(c.role, c.experienceYears)) break;
        const out = apply(s, { type: 'hireStaff', candidateId: c.id });
        if (!out.result.ok || !out.result.id) break;
        s = out.state;
        id = out.result.id;
      }
      const [next, ok] = tryCmd(s, apply, { type: 'assignShift', employeeId: id, slot: cell.slot });
      if (!ok) break;
      s = next;
    }
  }
  return s;
}

/** "Play every chapter" brings every growth, business and everyday helper with it. */
export const CHAPTERS_COVER: AutoKey[] = ['staffCare', 'build', 'garden', 'estate', 'pricing', 'shop', 'homecare', 'training', 'placements', 'branches'];
export function effectiveSettings(a: Required<AutoSettings>): Required<AutoSettings> {
  return a.chapters ? { ...a, ...Object.fromEntries(CHAPTERS_COVER.map((k) => [k, true])) } : a;
}

/** What the home should build next, or null. One room a day at most. */
export function nextBuild(state: GameState): string | null {
  const has = (t: string) => state.site.rooms.some((r) => r.type === t);
  if (!has('ward')) return 'ward10';
  if (!has('nursing_station')) return 'station';
  if (!has('staff_room')) return 'staff';
  if (!has('therapy')) return 'therapy';
  const waiting = state.waitlist.filter((c) => !c.premium).length;
  if (waiting >= 3 && !freeBeds(state).length) return 'ward10';
  if (state.chapter.id >= 3 && state.waitlist.some((c) => c.premium) && !freeBeds(state, undefined, true).length) return 'villa';
  return null;
}

function buildNext(state: GameState, apply: Apply): GameState {
  const prefab = nextBuild(state);
  const def = prefab ? prefabDef(prefab) : undefined;
  if (!prefab || !def) return state;
  // Only with a month of running costs (and a reserve) still in the bank afterwards.
  if (state.organization.cashSatang - prefabCost(def) < 30 * dailyRunningCost(state) + BUILD_RESERVE) return state;
  const built = buildSomewhere(state, apply, prefab);
  return built ? log(built.state, 'good', 'auto.log.build', { prefab }) : state;
}

/**
 * Run the switched-on helpers. Events every tick (so nothing waits); the rest once an hour.
 * `speed` is the game speed before this tick, restored when a chapter verdict is followed straight on.
 */
export function autopilot(state: GameState, apply: Apply, speed: GameState['speed'] = state.speed): GameState {
  const a = state.auto;
  if (!a) return state;
  let s = state;
  if (a.events) s = answerEvent(s, apply);
  if (a.chapters && s.chapter.result) s = advanceChapter(s, apply, speed);
  if (s.minute % 60 !== 0) return s;
  if (a.build && s.minute % (24 * 60) === BUILD_MINUTE) s = buildNext(s, apply);
  const all = effectiveSettings(autoSettings(s));
  if (all.staffCare || all.pricing) s = dailyCare(s, apply, all);
  const business = all.chapters || all.build || all.estate || all.homecare || all.training || all.placements || all.branches || all.shop || all.garden;
  if (business && (s.minute % (24 * 60) === 7 * 60 || s.minute % (24 * 60) === 15 * 60)) s = campaignTurn(s, apply, all);
  if (a.staff) s = staffAll(s, apply);
  if (a.admit) s = admitAll(s, apply);
  if (a.carePlan) s = planAll(s, apply);
  return s;
}
