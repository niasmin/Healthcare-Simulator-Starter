import { VISIT_PRICE } from '../../data/finance';
import { RESIDENT_NAMES } from '../../data/patients';
import { allRoomStatuses } from '../../domain/rules/rooms';
import { isOnShift } from '../../domain/rules/shifts';
import type { Employee, GameState, HomeClient, HomeLead, HomeVisit, InvoiceLine, PersonName, Skill, VisitPlan } from '../../domain/types';
import { MINUTES_PER_DAY } from '../constants';
import { allocId, clamp, log, r2, randInt } from '../helpers';
import { issue } from './billing';
import { EXHAUSTED_ENERGY } from './staffing';
import { monthOfDay } from '../../data/finance';
import { dayOf } from './time';

/**
 * Home care (Chapter 4). Clients live at home; each gets one visit a day at their appointment time. A visit takes a qualified,
 * on-shift employee AND a free van out of the building for its whole duration (travel included).
 * Completed visits are billed per client at midnight; missed visits cost satisfaction, and a family
 * whose satisfaction falls below the churn line cancels. All values are fictional game balancing.
 */

/** Appointment times, handed out in turn so visits spread over the morning shift (08:00–13:00). */
export const VISIT_SLOTS = [8 * 60, 9 * 60, 10 * 60, 11 * 60, 12 * 60, 13 * 60];
/** Daily running cost per van (fuel, insurance). */
export const VAN_COST_PER_DAY = 30_000;
export const VISIT_SKILL: Record<VisitPlan, Skill> = { caregiver: 'personal_care', nurse: 'vital_signs' };
/** Minutes away from the home per visit, travel included. */
export const VISIT_DURATION = 100;
/** A visit can start up to this long after its time; later it is missed. */
export const VISIT_GRACE = 90;
export const CHURN_SATISFACTION = 35;
export const MAX_LEADS = 6;

export function emptyHomecare(): GameState['homecare'] {
  return { clients: [], leads: [], visits: [], doneToday: {}, history: [], today: { done: 0, missed: 0 } };
}

/** Vans parked at operational home-care offices: how many visits can be out at once. */
export function vansAvailable(state: GameState): number {
  const statuses = allRoomStatuses(state.site);
  return state.site.rooms.filter((r) => r.type === 'homecare_office' && statuses.get(r.id)?.operational).reduce((a, r) => a + (r.equipment.care_van ?? 0), 0);
}

export function hasHomecareOffice(state: GameState): boolean {
  return vansAvailable(state) > 0;
}

/** Share of visits done over the last `days` closed days (null before any visit was due). */
export function visitRate(state: GameState, days = 7): number | null {
  const recent = state.homecare.history.slice(-days);
  const done = recent.reduce((a, d) => a + d.done, 0);
  const missed = recent.reduce((a, d) => a + d.missed, 0);
  return done + missed ? done / (done + missed) : null;
}

function pick(state: GameState, used: Set<string>): [GameState, PersonName] {
  const free = RESIDENT_NAMES.filter((n) => !used.has(n.th));
  const pool = free.length ? free : RESIDENT_NAMES;
  const [s, i] = randInt(state, 0, pool.length - 1);
  return [s, pool[i]];
}

export function makeLead(state: GameState): GameState {
  let s = state;
  const used = new Set([...s.homecare.clients, ...s.homecare.leads, ...s.residents].map((p) => p.name.th));
  let name: PersonName, age: number, roll: number, id: string;
  [s, name] = pick(s, used);
  [s, age] = randInt(s, 66, 93);
  [s, roll] = randInt(s, 1, 100);
  [s, id] = allocId(s, 'lead');
  const lead: HomeLead = { id, name, age, plan: roll <= 60 ? 'caregiver' : 'nurse' };
  return { ...s, homecare: { ...s.homecare, leads: [...s.homecare.leads, lead] } };
}

export function admitClient(state: GameState, leadId: string): { state: GameState; id: string } | null {
  const lead = state.homecare.leads.find((l) => l.id === leadId);
  if (!lead) return null;
  let [s, id] = allocId(state, 'client');
  // The least-booked appointment slot (earliest on a tie).
  const load = VISIT_SLOTS.map((t) => s.homecare.clients.filter((c) => c.visitAt === t).length);
  const visitAt = VISIT_SLOTS[load.indexOf(Math.min(...load))];
  const client: HomeClient = { id, name: lead.name, age: lead.age, plan: lead.plan, satisfaction: 75, joinedAt: s.minute, visitAt };
  s = { ...s, homecare: { ...s.homecare, leads: s.homecare.leads.filter((l) => l.id !== leadId), clients: [...s.homecare.clients, client] } };
  // The first visit is today if its time has not passed yet.
  const dayStart = Math.floor(s.minute / MINUTES_PER_DAY) * MINUTES_PER_DAY;
  if (s.minute <= dayStart + client.visitAt) s = addVisit(s, client, dayStart);
  return { state: log(s, 'good', 'log.client_joined', { name: client.name.th, nameEn: client.name.en }), id };
}

function addVisit(state: GameState, client: HomeClient, dayStart: number): GameState {
  const [s, id] = allocId(state, 'visit');
  const v: HomeVisit = { id, clientId: client.id, skill: VISIT_SKILL[client.plan], dueAt: dayStart + client.visitAt, duration: VISIT_DURATION, status: 'pending', assigneeId: null, finishAt: null };
  return { ...s, homecare: { ...s.homecare, visits: [...s.homecare.visits, v] } };
}

export function dischargeClient(state: GameState, clientId: string): GameState | null {
  const c = state.homecare.clients.find((x) => x.id === clientId);
  if (!c) return null;
  const busy = new Set(state.homecare.visits.filter((v) => v.clientId === clientId && v.status === 'in_progress').map((v) => v.assigneeId));
  const s: GameState = {
    ...state,
    employees: state.employees.map((e) => (busy.has(e.id) ? { ...e, taskId: null, busyUntil: state.minute } : e)),
    homecare: {
      ...state.homecare,
      clients: state.homecare.clients.filter((x) => x.id !== clientId),
      visits: state.homecare.visits.filter((v) => v.clientId !== clientId || v.status === 'done' || v.status === 'missed'),
    },
  };
  return log(s, 'info', 'log.client_left', { name: c.name.th, nameEn: c.name.en });
}

function staffOrder(a: Employee, b: Employee): number {
  return a.skills.length - b.skills.length || b.energy - a.energy || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Each tick, before in-house care: finish visits, mark late ones missed, send staff out on due ones. */
export function homecareTick(state: GameState): GameState {
  const hc = state.homecare;
  if (!hc.visits.some((v) => v.status === 'pending' || v.status === 'in_progress')) return state;
  const now = state.minute;
  const visits = hc.visits.map((v) => ({ ...v }));
  const clients = new Map(hc.clients.map((c) => [c.id, c]));
  const employees = new Map(state.employees.map((e) => [e.id, e]));
  const doneToday = { ...hc.doneToday };
  let { done, missed } = hc.today;
  let changed = false;

  for (const v of visits) {
    if (v.status !== 'in_progress' || v.finishAt === null || v.finishAt > now) continue;
    v.status = 'done';
    done++;
    changed = true;
    doneToday[v.clientId] = (doneToday[v.clientId] ?? 0) + 1;
    const c = clients.get(v.clientId);
    if (c) clients.set(c.id, { ...c, satisfaction: r2(clamp(c.satisfaction + 3)) });
    const e = v.assigneeId ? employees.get(v.assigneeId) : undefined;
    if (e && e.taskId === v.id) employees.set(e.id, { ...e, taskId: null });
  }
  for (const v of visits) {
    if (v.status !== 'pending' || now <= v.dueAt + VISIT_GRACE) continue;
    v.status = 'missed';
    missed++;
    changed = true;
    const c = clients.get(v.clientId);
    if (c) clients.set(c.id, { ...c, satisfaction: r2(clamp(c.satisfaction - 15)) });
  }
  let free = vansAvailable(state) - visits.filter((v) => v.status === 'in_progress').length;
  for (const v of visits.filter((x) => x.status === 'pending' && x.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt || (a.id < b.id ? -1 : 1))) {
    if (free <= 0) break;
    const e = [...employees.values()]
      .filter((x) => !x.taskId && x.busyUntil <= now && x.energy >= EXHAUSTED_ENERGY && x.skills.includes(v.skill) && isOnShift(state, x.id, now))
      .sort(staffOrder)[0];
    if (!e) continue;
    v.status = 'in_progress';
    v.assigneeId = e.id;
    v.finishAt = now + v.duration;
    employees.set(e.id, { ...e, taskId: v.id, busyUntil: now + v.duration });
    free--;
    changed = true;
  }
  if (!changed) return state;
  return {
    ...state,
    employees: state.employees.map((e) => employees.get(e.id)!),
    homecare: { ...hc, visits, clients: hc.clients.map((c) => clients.get(c.id)!), doneToday, today: { done, missed } },
  };
}

/** Midnight: bill the day's visits, let unhappy families go, take new enquiries, plan tomorrow. */
export function homecareDayEnd(state: GameState, closingDay: number, newDayStart: number): GameState {
  let s = state;
  const hc = s.homecare;
  // 1. One invoice per client for the visits completed today; families pay within a few days.
  for (const c of hc.clients) {
    const n = hc.doneToday[c.id] ?? 0;
    if (!n) continue;
    const line: InvoiceLine = { stream: 'homecare', memo: `invoice.line.visit_${c.plan}`, qty: n, unitSatang: VISIT_PRICE[c.plan], amountSatang: n * VISIT_PRICE[c.plan] };
    s = issue(s, c, 'homecare', monthOfDay(closingDay), [line]);
  }
  // 2. Families below the churn line cancel.
  for (const c of s.homecare.clients.filter((x) => x.satisfaction < CHURN_SATISFACTION)) s = log(dischargeClient(s, c.id)!, 'warn', 'log.client_cancelled', { name: c.name.th, nameEn: c.name.en });
  const history = [...s.homecare.history, { day: closingDay, ...s.homecare.today }].slice(-14);
  const visits = s.homecare.visits.filter((v) => v.status === 'pending' || v.status === 'in_progress' || v.dueAt >= newDayStart - MINUTES_PER_DAY);
  s = { ...s, homecare: { ...s.homecare, history, visits, doneToday: {}, today: { done: 0, missed: 0 } } };
  // 3. Enquiries arrive once a home-care office is open (Chapter 4 onward).
  if (s.chapter.id >= 4 && hasHomecareOffice(s)) {
    let add: number;
    [s, add] = randInt(s, 1, 2);
    for (let i = 0; i < add && s.homecare.leads.length < MAX_LEADS; i++) s = makeLead(s);
  }
  // 4. Tomorrow's visits.
  for (const c of s.homecare.clients) s = addVisit(s, c, newDayStart);
  return s;
}

/** For the map and staff table: is this employee out on a home visit? */
export function isOnVisit(e: Employee): boolean {
  return e.taskId !== null && e.taskId.startsWith('visit-');
}

export { dayOf };
