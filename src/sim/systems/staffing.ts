import { supportApplicants } from './support';
import { hasUpgrade, MARKETING_EXTRA_ENQUIRIES, WELFARE_MORALE_PER_DAY } from '../../data/shop';
import { GROUP_LEVELS, RESIDENT_NAMES } from '../../data/patients';
import { chapterDef, PREMIUM_SHARE } from '../../data/chapters';
import { ROLES, STAFF_NAMES, wageFor } from '../../data/staff';
import { WAITLIST_ARRIVALS } from '../../data/finance';
import { allRoomStatuses } from '../../domain/rules/rooms';
import { isOnShift, shiftMinutes } from '../../domain/rules/shifts';
import type { CareGroup, Employee, GameState, Needs, PersonName, ResidentCandidate, StaffCandidate, StaffRole } from '../../domain/types';
import { allocId, clamp, r2, randInt } from '../helpers';

export const APPLICANT_POOL_SIZE = 8;
export const WAITLIST_SIZE = 8;
export const EXHAUSTED_ENERGY = 15;

function pickName(state: GameState, list: PersonName[], used: Set<string>): [GameState, PersonName] {
  const free = list.filter((n) => !used.has(n.th));
  const pool = free.length ? free : list;
  const [s, i] = randInt(state, 0, pool.length - 1);
  return [s, pool[i]];
}

function usedNames(state: GameState): Set<string> {
  return new Set([...state.employees, ...state.applicants, ...state.residents, ...state.waitlist].map((p) => p.name.th));
}

export function makeApplicant(state: GameState, role: StaffRole): GameState {
  let s = state;
  let name: PersonName;
  [s, name] = pickName(s, STAFF_NAMES, usedNames(s));
  let exp: number;
  [s, exp] = randInt(s, 0, 9);
  let id: string;
  [s, id] = allocId(s, 'app');
  const c: StaffCandidate = { id, name, role, experienceYears: exp };
  return { ...s, applicants: [...s.applicants, c] };
}

const ROLE_WEIGHTS: Array<[StaffRole, number]> = [
  ['caregiver', 35],
  ['pn', 20],
  ['rn', 20],
  ['pt', 12],
  ['ot', 13],
];

export function randomRole(state: GameState): [GameState, StaffRole] {
  const [s, roll] = randInt(state, 1, 100);
  let acc = 0;
  for (const [role, w] of ROLE_WEIGHTS) {
    acc += w;
    if (roll <= acc) return [s, role];
  }
  return [s, 'caregiver'];
}

export function makeResidentCandidate(state: GameState, forced?: { group: CareGroup; referralDeadline?: number; premium?: boolean }): GameState {
  let s = state;
  let name: PersonName;
  [s, name] = pickName(s, RESIDENT_NAMES, usedNames(s));
  let gi: number, age: number, level: number;
  const groups = chapterDef(s.chapter.id).groups;
  [s, gi] = randInt(s, 0, groups.length - 1);
  const group = forced?.group ?? groups[gi];
  [s, age] = randInt(s, 64, 92);
  [s, level] = randInt(s, GROUP_LEVELS[group][0], GROUP_LEVELS[group][1]);
  const ranges: Record<keyof Needs, [number, number]> = {
    physical: [55, 80],
    mobility: group === 'active_aging' ? [60, 85] : group === 'stroke_rehab' ? [25, 45] : group === 'dementia' ? [45, 75] : [5, 20],
    mental: [50, 85],
    happiness: [45, 75],
    satisfaction: [60, 75],
    nutrition: [60, 85],
  };
  const needs = {} as Needs;
  for (const k of Object.keys(ranges) as (keyof Needs)[]) {
    let v: number;
    [s, v] = randInt(s, ranges[k][0], ranges[k][1]);
    needs[k] = v;
  }
  let id: string;
  [s, id] = allocId(s, 'cand');
  // From Chapter 3 some families ask for a private villa (only independent and rehab residents).
  let premium = !!forced?.premium;
  if (s.chapter.id >= 3 && !forced && (group === 'active_aging' || group === 'stroke_rehab')) {
    let roll: number;
    [s, roll] = randInt(s, 1, 100);
    premium = roll <= PREMIUM_SHARE;
  }
  const c: ResidentCandidate = {
    id,
    name,
    age,
    group,
    careLevel: level,
    needs,
    ...(forced?.referralDeadline !== undefined ? { referralDeadline: forced.referralDeadline } : {}),
    ...(premium ? { premium: true } : {}),
  };
  return { ...s, waitlist: [...s.waitlist, c] };
}

/** Starting pools: a guaranteed fair mix of applicants plus a random waitlist. */
export function seedCandidates(state: GameState): GameState {
  let s = state;
  for (const role of ['rn', 'rn', 'pn', 'caregiver', 'caregiver', 'caregiver', 'pt', 'ot'] as StaffRole[]) s = makeApplicant(s, role);
  for (let i = 0; i < 6; i++) s = makeResidentCandidate(s);
  return s;
}

/** Daily refresh: the two oldest applicants leave, new ones arrive; the waitlist grows by 1–2. */
export function refreshCandidates(state: GameState): GameState {
  let s: GameState = { ...state, applicants: state.applicants.slice(Math.min(2, state.applicants.length)) };
  while (s.applicants.length < APPLICANT_POOL_SIZE) {
    let role: StaffRole;
    [s, role] = randomRole(s);
    s = makeApplicant(s, role);
  }
  // From Chapter 6 a neurologist is always among the applicants.
  if (s.chapter.id >= 6 && !s.applicants.some((a) => a.role === 'doctor')) s = makeApplicant(s, 'doctor');
  s = supportApplicants(s);
  const [lo, hi] = WAITLIST_ARRIVALS[s.priceLevel];
  let add: number;
  [s, add] = randInt(s, lo, hi);
  // Word of mouth: a strong reputation brings extra enquiries, a poor one dries them up.
  if (s.organization.reputation >= 70) add++;
  // Shop upgrade: online marketing brings more enquiries.
  if (hasUpgrade(s, 'online_marketing')) add += MARKETING_EXTRA_ENQUIRIES;
  if (s.organization.reputation < 30) add = Math.max(0, add - 1);
  if (s.organization.reputation < 15) add = 0;
  // ...and families already waiting look elsewhere (the oldest leave first; urgent referrals are separate).
  const drop = s.organization.reputation < 15 ? 2 : s.organization.reputation < 30 ? 1 : 0;
  if (drop) {
    const leaving = new Set(s.waitlist.filter((c) => !c.referralDeadline).slice(0, drop).map((c) => c.id));
    s = { ...s, waitlist: s.waitlist.filter((c) => !leaving.has(c.id)) };
  }
  // From Chapter 3, when the list is full the longest-waiting candidate finds another home, so new families keep arriving.
  if (s.chapter.id >= 3 && add > 0) {
    const open = s.waitlist.filter((c) => !c.referralDeadline);
    if (open.length >= WAITLIST_SIZE) s = { ...s, waitlist: s.waitlist.filter((c) => c.id !== open[0].id) };
  }
  for (let i = 0; i < add && s.waitlist.filter((c) => !c.referralDeadline).length < WAITLIST_SIZE; i++) s = makeResidentCandidate(s);
  return s;
}

export function hireFromCandidate(c: StaffCandidate, id: string, now: number): Employee {
  return {
    id,
    name: c.name,
    role: c.role,
    skills: [...ROLES[c.role].skills],
    energy: 100,
    morale: 70,
    wageMonthlySatang: wageFor(c.role, c.experienceYears),
    hiredAt: now,
    busyUntil: now,
    taskId: null,
  };
}

/** Per-tick energy: work drains, a staff room helps idle on-shift staff recover, time off restores. */
export function staffEnergyTick(state: GameState): GameState {
  if (state.employees.length === 0) return state;
  const statuses = allRoomStatuses(state.site);
  const hasStaffRoom = state.site.rooms.some((r) => r.type === 'staff_room' && statuses.get(r.id)?.operational);
  const employees = state.employees.map((e) => {
    let delta: number;
    // At work with a partner organisation (Chapter 5): a working day, wherever it is.
    if (e.taskId?.startsWith('place-')) delta = -0.6;
    else if (!isOnShift(state, e.id, state.minute)) delta = 2.5;
    else if (e.taskId) delta = -0.9;
    else delta = hasStaffRoom ? 0.3 : -0.25;
    const energy = r2(clamp(e.energy + delta));
    return energy === e.energy ? e : { ...e, energy };
  });
  return { ...state, employees };
}

/** Daily morale: double shifts and exhaustion hurt; a staff room helps; otherwise drift to 70. */
export function staffMoraleDaily(state: GameState): GameState {
  const statuses = allRoomStatuses(state.site);
  const hasStaffRoom = state.site.rooms.some((r) => r.type === 'staff_room' && statuses.get(r.id)?.operational);
  const welfare = hasUpgrade(state, 'staff_welfare');
  const employees = state.employees.map((e) => {
    const minutes = state.shifts.filter((s) => s.employeeId === e.id).reduce((a, s) => a + shiftMinutes(s.start, s.end), 0);
    let d = e.morale < 70 ? 1 : e.morale > 70 ? -1 : 0;
    if (minutes > 8 * 60) d -= 4;
    if (e.energy < 30) d -= 3;
    if (hasStaffRoom) d += 1;
    if (welfare) d += WELFARE_MORALE_PER_DAY;
    return { ...e, morale: r2(clamp(e.morale + d)) };
  });
  return { ...state, employees };
}

/** Remove an employee, their shifts, and hand any in-progress task back to the queue. */
export function removeEmployee(state: GameState, employeeId: string): GameState {
  const tasks = state.tasks.map((t) => (t.assigneeId === employeeId && t.status === 'in_progress' ? { ...t, status: 'pending' as const, assigneeId: null, finishAt: null } : t));
  const visits = state.homecare.visits.map((v) => (v.assigneeId === employeeId && v.status === 'in_progress' ? { ...v, status: 'pending' as const, assigneeId: null, finishAt: null } : v));
  const htasks = state.hospital.tasks.map((t) => (t.assigneeId === employeeId && t.status === 'in_progress' ? { ...t, status: 'pending' as const, assigneeId: null, finishAt: null } : t));
  return {
    ...state,
    tasks,
    hospital: { ...state.hospital, tasks: htasks },
    homecare: { ...state.homecare, visits },
    employees: state.employees.filter((x) => x.id !== employeeId),
    shifts: state.shifts.filter((x) => x.employeeId !== employeeId),
    workforce: { ...state.workforce, training: state.workforce.training.filter((t) => t.employeeId !== employeeId) },
  };
}
