import {
  BONUS_CERTIFIED,
  BONUS_MORALE,
  BONUS_REPUTATION,
  BONUS_TRAINING_ROOM,
  BRANCHES,
  CLINIC_REFERRAL_PERCENT,
  CLOSE_REFUND_PERCENT,
  DISTRICTS,
  GROW_QUALITY,
  GROW_REPUTATION,
  GROW_SHARE,
  MAX_BRANCHES,
  MORALE_LINE,
  QUALITY_BASE,
  QUALITY_NO_MANAGER,
  QUALITY_PULL,
  REPUTATION_LINE,
  SHRINK_QUALITY,
  SHRINK_SHARE,
  START_QUALITY,
  SUPPORT_COOLDOWN_DAYS,
  SUPPORT_COST,
  SUPPORT_QUALITY,
} from '../../data/network';
import { monthOfDay } from '../../data/finance';
import { pctOf } from '../../domain/money';
import type { Branch, BranchKind, GameState, InvoiceLine, NetworkState, ReasonCode } from '../../domain/types';
import { allocId, clamp, log, post, r2, randInt } from '../helpers';
import { issue } from './billing';
import { makeReferralFromBranch } from './hospital';
import { hasTrainingRoom, isCertified } from './workforce';
import { dayOf } from './time';

/**
 * Network (Chapter 7). Headquarters opens branch sites at portfolio level: each has a capacity, fills
 * up while its quality and the network's reputation are good, and earns per unit in use per day.
 * Every branch needs a manager moved from headquarters' staff (off the roster for good). Quality
 * drifts toward a target set by the manager (certified, in good spirits) and headquarters' support
 * (a training room, a strong name); a paid support visit lifts it at once. Clinic branches refer
 * patients to headquarters' stroke unit. All values are fictional.
 */

export function emptyNetwork(): NetworkState {
  return { branches: [], history: [] };
}

export function branchCapacity(b: Branch): number {
  return BRANCHES[b.kind].capacity;
}

/** Profit of one branch at its current occupancy, per day. */
export function branchDailyNet(b: Branch): number {
  const d = BRANCHES[b.kind];
  return b.occupancy * d.ratePerUnit - d.fixedPerDay - b.occupancy * d.costPerUnit;
}

/** Network-wide quality (average over branches) and occupancy (units in use / capacity). */
export function networkStats(state: GameState): { quality: number | null; occupancy: number | null; capacity: number; used: number } {
  const bs = state.network.branches;
  if (!bs.length) return { quality: null, occupancy: null, capacity: 0, used: 0 };
  const capacity = bs.reduce((a, b) => a + branchCapacity(b), 0);
  const used = bs.reduce((a, b) => a + b.occupancy, 0);
  return { quality: Math.round(bs.reduce((a, b) => a + b.quality, 0) / bs.length), occupancy: used / capacity, capacity, used };
}

/** Quality the branch drifts toward today. */
export function qualityTarget(state: GameState, b: Branch): number {
  const m = b.managerId ? state.employees.find((e) => e.id === b.managerId) : undefined;
  if (!m) return QUALITY_NO_MANAGER;
  let t = QUALITY_BASE;
  if (isCertified(m)) t += BONUS_CERTIFIED;
  if (m.morale >= MORALE_LINE) t += BONUS_MORALE;
  if (hasTrainingRoom(state)) t += BONUS_TRAINING_ROOM;
  if (state.organization.reputation >= REPUTATION_LINE) t += BONUS_REPUTATION;
  return t;
}

/** Why this employee cannot open (or take over) a branch of this kind, or null. */
export function managerBlocker(state: GameState, kind: BranchKind, employeeId: string): ReasonCode | null {
  const e = state.employees.find((x) => x.id === employeeId);
  if (!e) return 'not_found';
  if (!BRANCHES[kind].managers.includes(e.role)) return 'manager_role';
  if (e.branch) return 'employee_branch';
  if (e.placement) return 'employee_placed';
  if (state.workforce.training.some((t) => t.employeeId === e.id)) return 'employee_busy';
  return null;
}

export function openBlocker(state: GameState, kind: BranchKind, managerId: string): ReasonCode | null {
  if (state.chapter.id < 7) return 'chapter_locked';
  if (state.network.branches.length >= MAX_BRANCHES) return 'branch_limit';
  const m = managerBlocker(state, kind, managerId);
  if (m) return m;
  if (state.organization.cashSatang < BRANCHES[kind].capexSatang) return 'insufficient_funds';
  return null;
}

/** The manager leaves headquarters: no shifts, any work in progress handed back. */
function moveManager(state: GameState, employeeId: string, branchId: string): GameState {
  const back = <T extends { assigneeId: string | null; status: string; finishAt: number | null }>(t: T): T =>
    t.assigneeId === employeeId && t.status === 'in_progress' ? { ...t, status: 'pending', assigneeId: null, finishAt: null } : t;
  return {
    ...state,
    tasks: state.tasks.map(back),
    homecare: { ...state.homecare, visits: state.homecare.visits.map(back) },
    hospital: { ...state.hospital, tasks: state.hospital.tasks.map(back) },
    shifts: state.shifts.filter((x) => x.employeeId !== employeeId),
    employees: state.employees.map((e) => (e.id === employeeId ? { ...e, branch: branchId, taskId: null, busyUntil: state.minute } : e)),
  };
}

export function openBranch(state: GameState, kind: BranchKind, managerId: string): { state: GameState; id: string } | { reason: ReasonCode } {
  const blocker = openBlocker(state, kind, managerId);
  if (blocker) return { reason: blocker };
  let [s, id] = allocId(state, 'branch');
  const used = new Set(s.network.branches.map((b) => b.name.th));
  const name = DISTRICTS.find((d) => !used.has(d.th)) ?? DISTRICTS[s.network.branches.length % DISTRICTS.length];
  const today = dayOf(s.minute);
  const branch: Branch = { id, kind, name, openedDay: today, managerId, occupancy: 0, quality: START_QUALITY, supportReadyDay: today };
  s = { ...s, network: { ...s.network, branches: [...s.network.branches, branch] } };
  s = moveManager(s, managerId, id);
  s = post(s, -BRANCHES[kind].capexSatang, 'construction', 'ledger.branch_open', { ref: id, memoParams: { name: name.th, nameEn: name.en } });
  return { state: log(s, 'good', 'log.branch_opened', { name: name.th, nameEn: name.en }), id };
}

/** Give a branch a new manager (after the last one left). */
export function assignManager(state: GameState, branchId: string, managerId: string): GameState | ReasonCode {
  const b = state.network.branches.find((x) => x.id === branchId);
  if (!b) return 'not_found';
  const blocker = managerBlocker(state, b.kind, managerId);
  if (blocker) return blocker;
  let s = moveManager(state, managerId, b.id);
  s = { ...s, network: { ...s.network, branches: s.network.branches.map((x) => (x.id === b.id ? { ...x, managerId } : x)) } };
  return log(s, 'info', 'log.branch_manager', { name: b.name.th, nameEn: b.name.en });
}

export function supportBranch(state: GameState, branchId: string): GameState | ReasonCode {
  const b = state.network.branches.find((x) => x.id === branchId);
  if (!b) return 'not_found';
  const today = dayOf(state.minute);
  if (today < b.supportReadyDay) return 'support_cooldown';
  if (state.organization.cashSatang < SUPPORT_COST) return 'insufficient_funds';
  let s: GameState = {
    ...state,
    network: { ...state.network, branches: state.network.branches.map((x) => (x.id === b.id ? { ...x, quality: r2(clamp(x.quality + SUPPORT_QUALITY)), supportReadyDay: today + SUPPORT_COOLDOWN_DAYS } : x)) },
  };
  s = post(s, -SUPPORT_COST, 'branch', 'ledger.branch_support', { ref: b.id, memoParams: { name: b.name.th, nameEn: b.name.en } });
  return log(s, 'info', 'log.branch_support', { name: b.name.th, nameEn: b.name.en });
}

export function closeBranch(state: GameState, branchId: string): GameState | null {
  const b = state.network.branches.find((x) => x.id === branchId);
  if (!b) return null;
  let s: GameState = {
    ...state,
    employees: state.employees.map((e) => (e.branch === b.id ? { ...e, branch: undefined } : e)),
    network: { ...state.network, branches: state.network.branches.filter((x) => x.id !== b.id) },
  };
  const refund = pctOf(BRANCHES[b.kind].capexSatang, CLOSE_REFUND_PERCENT);
  s = post(s, refund, 'refund', 'ledger.branch_close', { ref: b.id, memoParams: { name: b.name.th, nameEn: b.name.en } });
  return log(s, 'warn', 'log.branch_closed', { name: b.name.th, nameEn: b.name.en });
}

/** Midnight: each branch bills its day, pays its running costs, moves its quality and occupancy; clinics refer. */
export function networkDayEnd(state: GameState, closingDay: number): GameState {
  if (!state.network.branches.length) return state;
  let s = state;
  let net = 0;
  for (const b0 of state.network.branches) {
    const d = BRANCHES[b0.kind];
    // A manager who left headquarters' staff leaves the branch leaderless.
    const b: Branch = b0.managerId && !s.employees.some((e) => e.id === b0.managerId) ? { ...b0, managerId: null } : { ...b0 };
    if (b.occupancy > 0) {
      const line: InvoiceLine = { stream: 'network', memo: `invoice.line.branch_${b.kind}`, qty: b.occupancy, unitSatang: d.ratePerUnit, amountSatang: b.occupancy * d.ratePerUnit };
      s = issue(s, { id: b.id, name: b.name }, 'branch', monthOfDay(closingDay), [line]);
    }
    const cost = d.fixedPerDay + b.occupancy * d.costPerUnit;
    s = post(s, -cost, 'branch', 'ledger.branch_costs', { ref: b.id, memoParams: { name: b.name.th, nameEn: b.name.en } });
    net += b.occupancy * d.ratePerUnit - cost;
    // Clinics refer patients to headquarters' stroke unit (at most one a day).
    if (b.kind === 'clinic' && b.occupancy > 0 && s.site.rooms.some((r) => r.type === 'stroke_unit')) {
      let roll: number;
      [s, roll] = randInt(s, 1, 100);
      if (roll <= Math.round((CLINIC_REFERRAL_PERCENT * b.occupancy) / d.capacity)) s = log(makeReferralFromBranch(s), 'info', 'log.branch_referral', { name: b.name.th, nameEn: b.name.en });
    }
    const target = qualityTarget(s, b);
    b.quality = r2(clamp(b.quality + (target - b.quality) * QUALITY_PULL));
    const cap = d.capacity;
    if (b.quality >= GROW_QUALITY && s.organization.reputation >= GROW_REPUTATION) b.occupancy = Math.min(cap, b.occupancy + Math.ceil(cap * GROW_SHARE));
    else if (b.quality < SHRINK_QUALITY) b.occupancy = Math.max(0, b.occupancy - Math.ceil(cap * SHRINK_SHARE));
    s = { ...s, network: { ...s.network, branches: s.network.branches.map((x) => (x.id === b.id ? b : x)) } };
  }
  const st = networkStats(s);
  const history = [...s.network.history, { day: closingDay, quality: st.quality ?? 0, occupancy: st.used, capacity: st.capacity, net }].slice(-120);
  return { ...s, network: { ...s.network, history } };
}
