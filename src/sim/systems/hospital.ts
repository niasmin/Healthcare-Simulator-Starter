import {
  CONSULT_FEE,
  CONSULT_GRACE,
  CONSULT_MINUTES,
  CONSULT_SLOTS,
  DOCTOR_ROUND,
  DOCTOR_ROUND_GRACE,
  DOCTOR_ROUND_MINUTES,
  IPD_FEE_PER_DAY,
  IPD_SUPPLIES_PER_DAY,
  LOW_REP_LINE,
  LOW_REP_SLOTS,
  MAX_MISSED_ROUNDS,
  NURSE_ROUNDS,
  NURSE_ROUND_MINUTES,
  OPD_CLIENT,
  REFERRAL_PERCENT,
  REFERRAL_WAIT_DAYS,
  REHAB_TRANSFER_PERCENT,
  ROUND_GRACE,
  STAY_DAYS,
} from '../../data/hospital';
import { monthOfDay } from '../../data/finance';
import { RESIDENT_NAMES } from '../../data/patients';
import { bedId } from '../../domain/rules/beds';
import { allRoomStatuses } from '../../domain/rules/rooms';
import { isOnShift } from '../../domain/rules/shifts';
import type { Employee, GameState, HospitalState, HospitalTask, Inpatient, InvoiceLine, IpdReferral, PersonName } from '../../domain/types';
import { MINUTES_PER_DAY } from '../constants';
import { allocId, log, post, r2, randInt } from '../helpers';
import { issue } from './billing';
import { EXHAUSTED_ENERGY, makeResidentCandidate } from './staffing';
import { dayOf } from './time';

/**
 * Neuro hospital (Chapter 6). The clinic books consultations per examination desk every morning;
 * a doctor on shift sees each patient at a free desk. Some consultations end in a referral for a
 * short stay in the stroke unit, where nurses do a round every four hours and the doctor one each
 * morning. Consultations are billed daily, stays at discharge. All values are fictional.
 */

export function emptyHospital(): HospitalState {
  return { tasks: [], referrals: [], inpatients: [], today: { consults: 0, missed: 0 }, history: [], discharged: [] };
}

/** Examination desks in operational neuro clinics: consultations that can run at once. */
export function clinicDesks(state: GameState): number {
  const statuses = allRoomStatuses(state.site);
  return state.site.rooms.filter((r) => r.type === 'neuro_clinic' && statuses.get(r.id)?.operational).reduce((a, r) => a + (r.equipment.exam_desk ?? 0), 0);
}

/** Every bed in operational stroke units, in deterministic order. */
export function strokeBeds(state: GameState): string[] {
  const statuses = allRoomStatuses(state.site);
  const out: string[] = [];
  for (const r of state.site.rooms) if (r.type === 'stroke_unit' && statuses.get(r.id)?.operational) for (let i = 0; i < (r.equipment.care_bed ?? 0); i++) out.push(bedId(r.id, i));
  return out;
}

export function freeStrokeBeds(state: GameState): string[] {
  const taken = new Set(state.hospital.inpatients.map((p) => p.bedId));
  return strokeBeds(state).filter((b) => !taken.has(b));
}

export function hasDoctor(state: GameState): boolean {
  return state.employees.some((e) => e.role === 'doctor');
}

/** Share of consultations done over the last `days` closed days (null before any was due). */
export function consultRate(state: GameState, days = 7): number | null {
  const recent = state.hospital.history.slice(-days);
  const done = recent.reduce((a, d) => a + d.consults, 0);
  const missed = recent.reduce((a, d) => a + d.missed, 0);
  return done + missed ? done / (done + missed) : null;
}

/** Consultations completed on closed days from `fromDay`, plus today's. */
export function consultsSince(state: GameState, fromDay: number): number {
  return state.hospital.history.filter((h) => h.day >= fromDay).reduce((a, h) => a + h.consults, 0) + state.hospital.today.consults;
}

export function smoothDischarges(state: GameState, fromDay = 1): number {
  return state.hospital.discharged.filter((d) => d.outcome === 'recovered' && d.day >= fromDay).length;
}

/** Appointments booked per desk each day: the full list, or fewer while the reputation is low. */
export function slotsPerDesk(state: GameState): number[] {
  return state.organization.reputation >= LOW_REP_LINE ? CONSULT_SLOTS : CONSULT_SLOTS.slice(0, LOW_REP_SLOTS);
}

function addTask(state: GameState, t: Omit<HospitalTask, 'id' | 'status' | 'assigneeId' | 'finishAt'>): GameState {
  const [s, id] = allocId(state, 'htask');
  return { ...s, hospital: { ...s.hospital, tasks: [...s.hospital.tasks, { ...t, id, status: 'pending', assigneeId: null, finishAt: null }] } };
}

/** An inpatient's rounds for the day starting at `dayStart`, from `from` on. */
function planRounds(state: GameState, p: Inpatient, dayStart: number, from = dayStart): GameState {
  let s = state;
  for (const mod of NURSE_ROUNDS)
    if (dayStart + mod >= from) s = addTask(s, { kind: 'nurse_round', patientId: p.id, skill: 'vital_signs', dueAt: dayStart + mod, duration: NURSE_ROUND_MINUTES, grace: ROUND_GRACE });
  if (dayStart + DOCTOR_ROUND >= from) s = addTask(s, { kind: 'doctor_round', patientId: p.id, skill: 'consult', dueAt: dayStart + DOCTOR_ROUND, duration: DOCTOR_ROUND_MINUTES, grace: DOCTOR_ROUND_GRACE });
  return s;
}

/** Book the clinic for the day starting at `dayStart` (only with a doctor on the staff). */
function planClinic(state: GameState, dayStart: number): GameState {
  if (state.chapter.id < 6 || !hasDoctor(state)) return state;
  let s = state;
  const desks = clinicDesks(s);
  for (const mod of slotsPerDesk(s))
    for (let d = 0; d < desks; d++) {
      let pid: string;
      [s, pid] = allocId(s, 'opd');
      s = addTask(s, { kind: 'consult', patientId: pid, skill: 'consult', dueAt: dayStart + mod, duration: CONSULT_MINUTES, grace: CONSULT_GRACE });
    }
  return s;
}

function pickName(state: GameState): [GameState, PersonName] {
  const used = new Set([...state.residents, ...state.hospital.inpatients, ...state.hospital.referrals].map((p) => p.name.th));
  const free = RESIDENT_NAMES.filter((n) => !used.has(n.th));
  const pool = free.length ? free : RESIDENT_NAMES;
  const [s, i] = randInt(state, 0, pool.length - 1);
  return [s, pool[i]];
}

function makeReferral(state: GameState): GameState {
  let s = state;
  let name: PersonName, age: number, stay: number, id: string;
  [s, name] = pickName(s);
  [s, age] = randInt(s, 55, 88);
  [s, stay] = randInt(s, STAY_DAYS[0], STAY_DAYS[1]);
  [s, id] = allocId(s, 'ref');
  const r: IpdReferral = { id, name, age, stayDays: stay, expiresDay: dayOf(s.minute) + REFERRAL_WAIT_DAYS };
  return { ...s, hospital: { ...s.hospital, referrals: [...s.hospital.referrals, r] } };
}

export function admitInpatient(state: GameState, referralId: string): { state: GameState; id: string } | { reason: 'not_found' | 'no_stroke_bed' } {
  const r = state.hospital.referrals.find((x) => x.id === referralId);
  if (!r) return { reason: 'not_found' };
  const bed = freeStrokeBeds(state)[0];
  if (!bed) return { reason: 'no_stroke_bed' };
  let [s, id] = allocId(state, 'inp');
  const p: Inpatient = { id, name: r.name, age: r.age, bedId: bed, admittedDay: dayOf(s.minute), stayDays: r.stayDays, roundsDone: 0, roundsMissed: 0 };
  s = { ...s, hospital: { ...s.hospital, referrals: s.hospital.referrals.filter((x) => x.id !== r.id), inpatients: [...s.hospital.inpatients, p] } };
  const dayStart = Math.floor(s.minute / MINUTES_PER_DAY) * MINUTES_PER_DAY;
  s = planRounds(s, p, dayStart, s.minute);
  return { state: log(s, 'good', 'log.ipd_admitted', { name: p.name.th, nameEn: p.name.en }), id };
}

const PRIORITY: Record<HospitalTask['kind'], number> = { doctor_round: 0, nurse_round: 1, consult: 2 };

function staffOrder(a: Employee, b: Employee): number {
  return a.skills.length - b.skills.length || b.energy - a.energy || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Each tick, before in-house care: finish work, mark late work missed, hand out due work. */
export function hospitalTick(state: GameState): GameState {
  const h = state.hospital;
  if (!h.tasks.some((t) => t.status === 'pending' || t.status === 'in_progress')) return state;
  const now = state.minute;
  const tasks = h.tasks.map((t) => ({ ...t }));
  const patients = new Map(h.inpatients.map((p) => [p.id, { ...p }]));
  const employees = new Map(state.employees.map((e) => [e.id, e]));
  let { consults, missed } = h.today;
  let referrals = 0;
  let changed = false;

  for (const t of tasks) {
    if (t.status !== 'in_progress' || t.finishAt === null || t.finishAt > now) continue;
    t.status = 'done';
    changed = true;
    if (t.kind === 'consult') {
      consults++;
      referrals++;
    } else {
      const p = patients.get(t.patientId);
      if (p) p.roundsDone++;
    }
    const e = t.assigneeId ? employees.get(t.assigneeId) : undefined;
    if (e && e.taskId === t.id) employees.set(e.id, { ...e, taskId: null });
  }
  for (const t of tasks) {
    if (t.status !== 'pending' || now <= t.dueAt + t.grace) continue;
    t.status = 'missed';
    changed = true;
    if (t.kind === 'consult') missed++;
    else {
      const p = patients.get(t.patientId);
      if (p) p.roundsMissed++;
    }
  }
  let desks = clinicDesks(state) - tasks.filter((t) => t.kind === 'consult' && t.status === 'in_progress').length;
  const due = tasks.filter((t) => t.status === 'pending' && t.dueAt <= now).sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.dueAt - b.dueAt || (a.id < b.id ? -1 : 1));
  for (const t of due) {
    if (t.kind === 'consult' && desks <= 0) continue;
    const e = [...employees.values()]
      .filter((x) => !x.taskId && x.busyUntil <= now && x.energy >= EXHAUSTED_ENERGY && x.skills.includes(t.skill) && isOnShift(state, x.id, now))
      .sort(staffOrder)[0];
    if (!e) continue;
    t.status = 'in_progress';
    t.assigneeId = e.id;
    t.finishAt = now + t.duration;
    employees.set(e.id, { ...e, taskId: t.id, busyUntil: now + t.duration });
    if (t.kind === 'consult') desks--;
    changed = true;
  }
  if (!changed) return state;
  let s: GameState = {
    ...state,
    employees: state.employees.map((e) => employees.get(e.id)!),
    hospital: { ...h, tasks, inpatients: h.inpatients.map((p) => patients.get(p.id)!), today: { consults, missed } },
  };
  // Some consultations end in a referral to the stroke unit (only once it exists).
  if (strokeBeds(s).length)
    for (let i = 0; i < referrals; i++) {
      let roll: number;
      [s, roll] = randInt(s, 1, 100);
      if (roll <= REFERRAL_PERCENT) s = log(makeReferral(s), 'info', 'log.ipd_referral');
    }
  return s;
}

function reputation(state: GameState, delta: number): GameState {
  const rep = Math.max(0, Math.min(100, r2(state.organization.reputation + delta)));
  return { ...state, organization: { ...state.organization, reputation: rep } };
}

function discharge(state: GameState, p: Inpatient, closingDay: number): GameState {
  let s = state;
  const line: InvoiceLine = { stream: 'hospital', memo: 'invoice.line.ipd_stay', qty: p.stayDays, unitSatang: IPD_FEE_PER_DAY, amountSatang: p.stayDays * IPD_FEE_PER_DAY };
  s = issue(s, p, 'ipd', monthOfDay(closingDay), [line]);
  const outcome = p.roundsMissed > MAX_MISSED_ROUNDS ? 'complicated' : 'recovered';
  const busy = new Set(s.hospital.tasks.filter((t) => t.patientId === p.id && t.status === 'in_progress').map((t) => t.assigneeId));
  s = {
    ...s,
    employees: s.employees.map((e) => (busy.has(e.id) ? { ...e, taskId: null, busyUntil: s.minute } : e)),
    hospital: {
      ...s.hospital,
      inpatients: s.hospital.inpatients.filter((x) => x.id !== p.id),
      tasks: s.hospital.tasks.filter((t) => t.patientId !== p.id),
      discharged: [...s.hospital.discharged, { id: p.id, day: closingDay, outcome: outcome as 'recovered' | 'complicated' }].slice(-200),
    },
  };
  s = reputation(s, outcome === 'recovered' ? 0.5 : -1);
  s = log(s, outcome === 'recovered' ? 'good' : 'warn', `log.ipd_${outcome}`, { name: p.name.th, nameEn: p.name.en });
  // Neuro rehabilitation: after a smooth stay, some families ask for a place in the home's rehab ward.
  if (outcome === 'recovered') {
    let roll: number;
    [s, roll] = randInt(s, 1, 100);
    if (roll <= REHAB_TRANSFER_PERCENT) s = log(makeResidentCandidate(s, { group: 'stroke_rehab' }), 'info', 'log.ipd_transfer', { name: p.name.th, nameEn: p.name.en });
  }
  return s;
}

/** Midnight: bill the day's consultations, discharge finished stays, retire stale referrals, book tomorrow. */
export function hospitalDayEnd(state: GameState, closingDay: number, newDayStart: number): GameState {
  let s = state;
  const h = s.hospital;
  if (h.today.consults) {
    const line: InvoiceLine = { stream: 'hospital', memo: 'invoice.line.consult', qty: h.today.consults, unitSatang: CONSULT_FEE, amountSatang: h.today.consults * CONSULT_FEE };
    s = issue(s, OPD_CLIENT, 'opd', monthOfDay(closingDay), [line]);
  }
  if (h.inpatients.length) s = post(s, -IPD_SUPPLIES_PER_DAY * h.inpatients.length, 'supplies', 'ledger.ipd_supplies', { memoParams: { n: h.inpatients.length } });
  const active = h.tasks.some((t) => t.status === 'pending' || t.status === 'in_progress') || h.today.consults + h.today.missed > 0;
  const history = active || h.history.length ? [...s.hospital.history, { day: closingDay, ...s.hospital.today }].slice(-120) : s.hospital.history;
  s = { ...s, hospital: { ...s.hospital, history, today: { consults: 0, missed: 0 } } };
  for (const p of s.hospital.inpatients.filter((x) => closingDay - x.admittedDay + 1 >= x.stayDays)) s = discharge(s, p, closingDay);
  const newDay = closingDay + 1;
  const stale = s.hospital.referrals.filter((r) => r.expiresDay < newDay);
  if (stale.length) s = log(reputation({ ...s, hospital: { ...s.hospital, referrals: s.hospital.referrals.filter((r) => r.expiresDay >= newDay) } }, -0.5 * stale.length), 'warn', 'log.ipd_referral_lost', { n: stale.length });
  // Keep only work still open; the day's finished tasks are counted already.
  s = { ...s, hospital: { ...s.hospital, tasks: s.hospital.tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress') } };
  s = planClinic(s, newDayStart);
  for (const p of s.hospital.inpatients) s = planRounds(s, p, newDayStart);
  return s;
}

/** For the map: the hospital task an employee is on, if any. */
export function hospitalTaskOf(state: GameState, e: Employee): HospitalTask | undefined {
  return e.taskId ? state.hospital.tasks.find((t) => t.id === e.taskId) : undefined;
}
