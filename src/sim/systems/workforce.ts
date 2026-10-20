import { CERT_PREMIUM_PERCENT, COURSES, MAX_OFFERS, OFFER_CERT, OFFER_DAYS, OFFER_ROLES, PARTNERS, PLACEMENT_DAYS, PLACEMENT_MINUTES, PLACEMENT_RATE, PLACEMENT_START } from '../../data/workforce';
import { monthOfDay } from '../../data/finance';
import { allRoomStatuses } from '../../domain/rules/rooms';
import { isOnShift } from '../../domain/rules/shifts';
import type { CourseId, Employee, GameState, InvoiceLine, ReasonCode, StaffRole, TrainingSession, WorkforceContract, WorkforceOffer, WorkforceState } from '../../domain/types';
import { MINUTES_PER_DAY } from '../constants';
import { allocId, clamp, log, post, r2, randInt } from '../helpers';
import { issue } from './billing';
import { EXHAUSTED_ENERGY } from './staffing';
import { dayOf } from './time';

/**
 * Workforce (Chapter 5). A training room certifies staff: class time is taken during the trainee's
 * shift, so the home is a pair of hands short while they learn. Partner organisations ask for one
 * staff member for a number of working days; a placed employee leaves the home's roster and works at
 * the partner 07:00–15:00 on each contract day, billed per day worked. All values are fictional.
 */

export function emptyWorkforce(): WorkforceState {
  return { training: [], offers: [], contracts: [], past: [] };
}

const TRAIN_TAG = 'train-';
const PLACE_TAG = 'place-';

/** Seats in class right now: one per training manikin in operational training rooms. */
export function trainingSeats(state: GameState): number {
  const statuses = allRoomStatuses(state.site);
  return state.site.rooms.filter((r) => r.type === 'training_room' && statuses.get(r.id)?.operational).reduce((a, r) => a + (r.equipment.training_manikin ?? 0), 0);
}

export function hasTrainingRoom(state: GameState): boolean {
  return trainingSeats(state) > 0;
}

export function isCertified(e: Employee): boolean {
  return (e.certs?.length ?? 0) > 0;
}

export function certifiedCount(state: GameState): number {
  return state.employees.filter(isCertified).length;
}

/** Contracts completed in full since `fromDay`. */
export function contractsCompleted(state: GameState, fromDay = 1): number {
  return state.workforce.past.filter((p) => p.outcome === 'completed' && p.day >= fromDay).length;
}

export function isTraining(state: GameState, employeeId: string): boolean {
  return state.workforce.training.some((t) => t.employeeId === employeeId);
}

/** For the map and staff table: placed with a partner, or in class. */
export function isPlacedAway(e: Employee): boolean {
  return !!e.taskId?.startsWith(PLACE_TAG);
}
export function isInClass(e: Employee): boolean {
  return !!e.taskId?.startsWith(TRAIN_TAG);
}

/** Why this employee cannot take this course now, or null. */
export function trainingBlocker(state: GameState, employeeId: string, course: CourseId): ReasonCode | null {
  const e = state.employees.find((x) => x.id === employeeId);
  const def = COURSES[course];
  if (!e || !def) return 'not_found';
  if (!hasTrainingRoom(state)) return 'no_training_room';
  if (!def.roles.includes(e.role)) return 'course_not_allowed';
  if (e.certs?.includes(course) || (def.skill && e.skills.includes(def.skill))) return 'already_certified';
  if (e.placement) return 'employee_placed';
  if (isTraining(state, e.id)) return 'employee_busy';
  if (state.workforce.training.length >= trainingSeats(state)) return 'no_seat';
  if (state.organization.cashSatang < def.costSatang) return 'insufficient_funds';
  return null;
}

export function startTraining(state: GameState, employeeId: string, course: CourseId): { state: GameState; id: string } | { reason: ReasonCode } {
  const blocker = trainingBlocker(state, employeeId, course);
  if (blocker) return { reason: blocker };
  const e = state.employees.find((x) => x.id === employeeId)!;
  const def = COURSES[course];
  let [s, id] = allocId(state, 'train');
  const session: TrainingSession = { id, employeeId, course, remaining: def.minutes };
  s = { ...s, workforce: { ...s.workforce, training: [...s.workforce.training, session] } };
  s = post(s, -def.costSatang, 'training', 'ledger.training', { ref: id, memoParams: { course } });
  return { state: log(s, 'info', 'log.training_started', { name: e.name.th, nameEn: e.name.en, course }), id };
}

/** Why this employee cannot be placed on this offer, or null. */
export function placementBlocker(state: GameState, offerId: string, employeeId: string): ReasonCode | null {
  const o = state.workforce.offers.find((x) => x.id === offerId);
  const e = state.employees.find((x) => x.id === employeeId);
  if (!o || !e) return 'not_found';
  if (e.role !== o.role) return 'role_mismatch';
  if (o.cert && !e.certs?.includes(o.cert)) return 'needs_cert';
  if (e.placement) return 'employee_placed';
  if (isTraining(state, e.id)) return 'employee_busy';
  return null;
}

/** Hand any work in progress back to the queue so someone else picks it up. */
function releaseWork(state: GameState, employeeId: string): GameState {
  const tasks = state.tasks.map((t) => (t.assigneeId === employeeId && t.status === 'in_progress' ? { ...t, status: 'pending' as const, assigneeId: null, finishAt: null } : t));
  const visits = state.homecare.visits.map((v) => (v.assigneeId === employeeId && v.status === 'in_progress' ? { ...v, status: 'pending' as const, assigneeId: null, finishAt: null } : v));
  const htasks = state.hospital.tasks.map((t) => (t.assigneeId === employeeId && t.status === 'in_progress' ? { ...t, status: 'pending' as const, assigneeId: null, finishAt: null } : t));
  return { ...state, tasks, homecare: { ...state.homecare, visits }, hospital: { ...state.hospital, tasks: htasks } };
}

export function acceptOffer(state: GameState, offerId: string, employeeId: string): { state: GameState; id: string } | { reason: ReasonCode } {
  const blocker = placementBlocker(state, offerId, employeeId);
  if (blocker) return { reason: blocker };
  const o = state.workforce.offers.find((x) => x.id === offerId)!;
  const e = state.employees.find((x) => x.id === employeeId)!;
  const today = dayOf(state.minute);
  const mod = state.minute % MINUTES_PER_DAY;
  const { expiresDay: _expires, ...terms } = o;
  const contract: WorkforceContract = { ...terms, employeeId, startDay: mod < PLACEMENT_START ? today : today + 1, done: 0, missed: 0, doneToday: 0 };
  // The placed employee leaves the home's roster for the length of the contract.
  let s = releaseWork(state, e.id);
  s = {
    ...s,
    shifts: s.shifts.filter((x) => x.employeeId !== e.id),
    employees: s.employees.map((x) => (x.id === e.id ? { ...x, placement: o.id, taskId: null, busyUntil: s.minute } : x)),
    workforce: { ...s.workforce, offers: s.workforce.offers.filter((x) => x.id !== o.id), contracts: [...s.workforce.contracts, contract] },
  };
  return { state: log(s, 'good', 'log.placement_started', { name: e.name.th, nameEn: e.name.en, org: o.org.th, orgEn: o.org.en }), id: o.id };
}

function reputation(state: GameState, delta: number): GameState {
  const rep = Math.max(0, Math.min(100, r2(state.organization.reputation + delta)));
  return { ...state, organization: { ...state.organization, reputation: rep } };
}

/** Close a contract: completed in full, or ended early (by the player, or because the employee left). */
function closeContract(state: GameState, c: WorkforceContract, outcome: 'completed' | 'ended'): GameState {
  let s: GameState = {
    ...state,
    employees: state.employees.map((e) => (e.id === c.employeeId ? { ...e, placement: undefined, ...(isPlacedAway(e) ? { taskId: null, busyUntil: state.minute } : {}) } : e)),
    workforce: {
      ...state.workforce,
      contracts: state.workforce.contracts.filter((x) => x.id !== c.id),
      past: [...state.workforce.past, { id: c.id, org: c.org, outcome, done: c.done, missed: c.missed, day: dayOf(state.minute - 1) }].slice(-20),
    },
  };
  // Partners talk: a clean contract helps the name, an early end hurts it.
  s = reputation(s, outcome === 'completed' ? (c.missed === 0 ? 1 : 0) : -2);
  return log(s, outcome === 'completed' ? 'good' : 'warn', `log.placement_${outcome}`, { org: c.org.th, orgEn: c.org.en });
}

export function endContract(state: GameState, contractId: string): GameState | null {
  const c = state.workforce.contracts.find((x) => x.id === contractId);
  return c ? closeContract(state, c, 'ended') : null;
}

/** Each tick, before care: classes progress, placed staff leave for and return from the partner. */
export function workforceTick(state: GameState): GameState {
  const wf = state.workforce;
  if (!wf.training.length && !wf.contracts.length) return state;
  const now = state.minute;
  const mod = now % MINUTES_PER_DAY;
  const today = dayOf(now);
  const employees = new Map(state.employees.map((e) => [e.id, e]));
  let s = state;
  let changed = false;

  // Placements.
  const contracts: WorkforceContract[] = [];
  const gone: WorkforceContract[] = [];
  for (const c0 of wf.contracts) {
    const c = { ...c0 };
    const e = employees.get(c.employeeId);
    if (!e) {
      gone.push(c);
      continue;
    }
    const tag = PLACE_TAG + c.id;
    if (e.taskId === tag && e.busyUntil <= now) {
      employees.set(e.id, { ...e, taskId: null });
      c.done++;
      c.doneToday++;
      changed = true;
    } else if (mod === PLACEMENT_START && c.startDay <= today && c.done + c.missed < c.days) {
      if (!e.taskId && e.energy >= EXHAUSTED_ENERGY) employees.set(e.id, { ...e, taskId: tag, busyUntil: now + PLACEMENT_MINUTES });
      else c.missed++;
      changed = true;
    }
    contracts.push(c);
  }

  // Classes: a trainee attends during their shift, or 08:00–16:00 if they have no shifts.
  const training: TrainingSession[] = [];
  const passed: TrainingSession[] = [];
  for (const t0 of wf.training) {
    const e = employees.get(t0.employeeId);
    if (!e) {
      changed = true;
      continue;
    }
    const tag = TRAIN_TAG + t0.id;
    const rostered = s.shifts.some((x) => x.employeeId === e.id);
    const inHours = rostered ? isOnShift(s, e.id, now) : mod >= 8 * 60 && mod < 16 * 60;
    const free = !e.taskId || e.taskId === tag;
    if (inHours && free && e.energy >= EXHAUSTED_ENERGY) {
      const t = { ...t0, remaining: t0.remaining - 10 };
      changed = true;
      if (t.remaining <= 0) {
        passed.push(t);
        employees.set(e.id, { ...e, taskId: null, busyUntil: now });
      } else {
        training.push(t);
        employees.set(e.id, { ...e, taskId: tag, busyUntil: now + 10 });
      }
    } else {
      if (e.taskId === tag) {
        employees.set(e.id, { ...e, taskId: null });
        changed = true;
      }
      training.push(t0);
    }
  }
  for (const t of passed) {
    const e = employees.get(t.employeeId)!;
    const def = COURSES[t.course];
    employees.set(e.id, {
      ...e,
      certs: [...(e.certs ?? []), t.course],
      skills: def.skill && !e.skills.includes(def.skill) ? [...e.skills, def.skill] : e.skills,
      morale: r2(clamp(e.morale + 5)),
    });
  }

  if (!changed && !gone.length) return state;
  s = { ...s, employees: s.employees.map((e) => employees.get(e.id)!), workforce: { ...wf, contracts, training } };
  for (const t of passed) {
    const e = employees.get(t.employeeId)!;
    s = log(s, 'good', 'log.training_passed', { name: e.name.th, nameEn: e.name.en, course: t.course });
  }
  for (const c of gone) s = closeContract({ ...s, workforce: { ...s.workforce, contracts: [...s.workforce.contracts, c] } }, c, 'ended');
  return s;
}

function makeOffer(state: GameState): GameState {
  let s = state;
  let p: number, roll: number, di: number, certRoll: number;
  [s, p] = randInt(s, 0, PARTNERS.length - 1);
  [s, roll] = randInt(s, 1, 100);
  let role: StaffRole = 'caregiver';
  let acc = 0;
  for (const [r, w] of OFFER_ROLES) {
    acc += w;
    if (roll <= acc) {
      role = r;
      break;
    }
  }
  [s, di] = randInt(s, 0, PLACEMENT_DAYS.length - 1);
  [s, certRoll] = randInt(s, 1, 100);
  const certDef = OFFER_CERT[role];
  const cert = certDef && certRoll <= certDef.chance ? certDef.cert : null;
  const base = PLACEMENT_RATE[role];
  const ratePerDay = cert ? Math.round((base * (100 + CERT_PREMIUM_PERCENT)) / 100 / 100) * 100 : base;
  let id: string;
  [s, id] = allocId(s, 'offer');
  const offer: WorkforceOffer = { id, org: PARTNERS[p].name, orgKind: PARTNERS[p].kind, role, cert, days: PLACEMENT_DAYS[di], ratePerDay, expiresDay: dayOf(s.minute) + OFFER_DAYS };
  return { ...s, workforce: { ...s.workforce, offers: [...s.workforce.offers, offer] } };
}

/** Midnight: bill the day's placements, close finished contracts, retire stale offers, take new requests. */
export function workforceDayEnd(state: GameState, closingDay: number): GameState {
  let s = state;
  for (const c of s.workforce.contracts) {
    if (!c.doneToday) continue;
    const line: InvoiceLine = { stream: 'workforce', memo: `invoice.line.placement_${c.role}`, qty: c.doneToday, unitSatang: c.ratePerDay, amountSatang: c.doneToday * c.ratePerDay };
    s = issue(s, { id: c.id, name: c.org }, 'b2b', monthOfDay(closingDay), [line]);
  }
  s = { ...s, workforce: { ...s.workforce, contracts: s.workforce.contracts.map((c) => (c.doneToday ? { ...c, doneToday: 0 } : c)) } };
  for (const c of s.workforce.contracts.filter((x) => x.done + x.missed >= x.days)) s = closeContract(s, c, 'completed');
  const newDay = closingDay + 1;
  s = { ...s, workforce: { ...s.workforce, offers: s.workforce.offers.filter((o) => o.expiresDay >= newDay) } };
  // Requests arrive once a training centre shows the home trains its people (Chapter 5 onward).
  if (s.chapter.id >= 5 && hasTrainingRoom(s)) {
    let add: number;
    [s, add] = randInt(s, 1, 2);
    for (let i = 0; i < add && s.workforce.offers.length < MAX_OFFERS; i++) s = makeOffer(s);
  }
  return s;
}
