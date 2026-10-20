import { EVENT_DEFS } from '../data/events';
import { prefabCost, prefabDef, prefabRect } from '../data/prefabs';
import { thb } from '../domain/money';
import { cellIndex, inBounds, rectInBounds, rectsOverlap } from '../domain/grid';
import { allRoomStatuses } from '../domain/rules/rooms';
import { wageFor } from '../data/staff';
import { freeBeds } from '../domain/rules/beds';
import type { AutoSettings, CommandResult, EventDefId, GameState } from '../domain/types';
import type { Command } from './engine';
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

export const AUTO_KEYS = ['events', 'admit', 'carePlan', 'staff', 'build'] as const;
export const AUTO_OFF: Required<AutoSettings> = { events: false, admit: false, carePlan: false, staff: false, build: false };
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

type Apply = (state: GameState, cmd: Command) => { state: GameState; result: CommandResult };

export function autoSettings(state: GameState): Required<AutoSettings> {
  return { ...AUTO_OFF, ...state.auto };
}

function tryCmd(state: GameState, apply: Apply, cmd: Command): [GameState, boolean] {
  const out = apply(state, cmd);
  return out.result.ok ? [out.state, true] : [state, false];
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
  // Urgent referrals first, then the longest waiting.
  const queue = [...s.waitlist].sort((a, b) => (a.referralDeadline ?? Infinity) - (b.referralDeadline ?? Infinity));
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
  for (const cell of rosterView(s).cells) {
    for (let gap = cell.need - cell.staff.length; gap > 0; gap--) {
      const shifted = new Set(s.shifts.map((x) => x.employeeId));
      const idle = s.employees.find((e) => e.role === cell.role && !shifted.has(e.id) && !e.placement && !e.branch);
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

/**
 * The best spot for a ready-made room: the nearest to the entrance where it fits next to an
 * existing corridor and opens straight away. Returns the state with the room built, or null.
 */
export function buildSomewhere(state: GameState, apply: Apply, prefab: string): GameState | null {
  const def = prefabDef(prefab);
  if (!def) return null;
  const { site } = state;
  const spots: Array<{ x: number; y: number; rotated: boolean; d: number }> = [];
  for (let y = 0; y < site.height; y++)
    for (let x = 0; x < site.width; x++)
      for (const rotated of def.w === def.h ? [false] : [false, true]) {
        const r = prefabRect(def, { x, y }, rotated);
        if (!rectInBounds(r, site.width, site.height) || site.rooms.some((o) => rectsOverlap(o.rect, r))) continue;
        // Some corridor tile must touch the room's side, or it could never open.
        let touches = false;
        for (let i = r.x; i < r.x + r.w && !touches; i++)
          for (const j of [r.y - 1, r.y + r.h]) if (inBounds(i, j, site.width, site.height) && site.corridor[cellIndex(i, j, site.width)]) touches = true;
        for (let j = r.y; j < r.y + r.h && !touches; j++)
          for (const i of [r.x - 1, r.x + r.w]) if (inBounds(i, j, site.width, site.height) && site.corridor[cellIndex(i, j, site.width)]) touches = true;
        if (!touches) continue;
        spots.push({ x, y, rotated, d: Math.abs(x + r.w / 2 - site.entrance.x) + Math.abs(y + r.h / 2 - site.entrance.y) });
      }
  spots.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x || Number(a.rotated) - Number(b.rotated));
  for (const p of spots) {
    const out = apply(state, { type: 'placePrefab', prefab, origin: { x: p.x, y: p.y }, rotated: p.rotated });
    if (!out.result.ok || !out.result.id) continue;
    if (allRoomStatuses(out.state.site).get(out.result.id)?.operational) return out.state;
  }
  return null;
}

function buildNext(state: GameState, apply: Apply): GameState {
  const prefab = nextBuild(state);
  const def = prefab ? prefabDef(prefab) : undefined;
  if (!prefab || !def) return state;
  // Only with a month of running costs (and a reserve) still in the bank afterwards.
  if (state.organization.cashSatang - prefabCost(def) < 30 * dailyRunningCost(state) + BUILD_RESERVE) return state;
  const built = buildSomewhere(state, apply, prefab);
  return built ? log(built, 'good', 'auto.log.build', { prefab }) : state;
}

/** Run the switched-on helpers. Events every tick (so nothing waits); the rest once an hour. */
export function autopilot(state: GameState, apply: Apply): GameState {
  const a = state.auto;
  if (!a) return state;
  let s = state;
  if (a.events) s = answerEvent(s, apply);
  if (s.minute % 60 !== 0) return s;
  if (a.build && s.minute % (24 * 60) === BUILD_MINUTE) s = buildNext(s, apply);
  if (a.staff) s = staffAll(s, apply);
  if (a.admit) s = admitAll(s, apply);
  if (a.carePlan) s = planAll(s, apply);
  return s;
}
