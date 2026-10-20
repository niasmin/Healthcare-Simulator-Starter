import { chapterDef, EXPANDED_WIDTH, type ChapterDef } from '../data/chapters';
import { allRoomStatuses, type RoomStatus } from '../domain/rules/rooms';
import type { GameState, LedgerCategory, Room, RoomType, Satang } from '../domain/types';
import { dailyPayroll, dailyUpkeep, dailyWage } from './systems/finance';
import { supportActive } from './systems/support';
import { dailyResidentCosts } from './systems/billing';
import { VISIT_DURATION, VISIT_GRACE, VISIT_SKILL, hasHomecareOffice, visitRate } from './systems/homecare';
import { clinicDesks, consultRate, consultsSince, hasDoctor, hospitalTaskOf, slotsPerDesk, smoothDischarges, strokeBeds } from './systems/hospital';
import { CONSULT_GRACE, CONSULT_MINUTES, DOCTOR_ROUND, DOCTOR_ROUND_GRACE, DOCTOR_ROUND_MINUTES, NURSE_ROUNDS, NURSE_ROUND_MINUTES, ROUND_GRACE } from '../data/hospital';
import { networkStats } from './systems/network';
import { certifiedCount, contractsCompleted, hasTrainingRoom, isInClass, isPlacedAway } from './systems/workforce';
import { gardenAppeal } from '../data/decor';
import { carePlanSchedule, TASK_KINDS } from '../data/patients';
import { ROLE_ORDER, SHIFT_SLOTS, SKILL_OWNER, SLOT_ORDER, SUPPORT_ROLES } from '../data/staff';
import { inWindow, isOnShift, shiftMinutes } from '../domain/rules/shifts';
import { MINUTES_PER_DAY, START_MINUTE } from './constants';
import type { CareGroup, Employee, ShiftSlot, Skill, StaffRole } from '../domain/types';
import { wellbeing } from './systems/needs';
import { dayInMonth, monthOfDay } from '../data/finance';
import { dayOf } from './systems/time';
import type { Invoice, LedgerEntry, RevenueStream } from '../domain/types';

export interface SiteSummary {
  statuses: Map<string, RoomStatus>;
  roomsTotal: number;
  roomsOperational: number;
  bedsInstalled: number;
  bedsOperational: number;
  corridorTiles: number;
  dailyUpkeepSatang: Satang;
  spentByCategory: Record<LedgerCategory, Satang>;
  operationalByType: Record<RoomType, number>;
}

export function summarize(state: GameState): SiteSummary {
  const statuses = allRoomStatuses(state.site);
  let roomsOperational = 0;
  let bedsInstalled = 0;
  let bedsOperational = 0;
  const operationalByType: Record<RoomType, number> = { ward: 0, nursing_station: 0, therapy: 0, staff_room: 0, villa: 0, homecare_office: 0, training_room: 0, neuro_clinic: 0, stroke_unit: 0, pharmacy: 0, dining_room: 0, laundry_room: 0, reception: 0, storage_room: 0, bathroom: 0, accounting_office: 0 };
  for (const room of state.site.rooms) {
    const st = statuses.get(room.id)!;
    bedsInstalled += st.installedBeds;
    bedsOperational += st.capacity;
    if (st.operational) {
      roomsOperational++;
      operationalByType[room.type]++;
    }
  }
  const spentByCategory: Record<LedgerCategory, Satang> = { capital: 0, construction: 0, equipment: 0, refund: 0, upkeep: 0, payroll: 0, revenue: 0, fee_refund: 0, food: 0, supplies: 0, event: 0, training: 0, branch: 0 };
  for (const e of state.ledger) spentByCategory[e.category] += e.amountSatang;
  return {
    statuses,
    roomsTotal: state.site.rooms.length,
    roomsOperational,
    bedsInstalled,
    bedsOperational,
    corridorTiles: state.site.corridor.reduce((a, b) => a + b, 0),
    dailyUpkeepSatang: dailyUpkeep(state),
    spentByCategory,
    operationalByType,
  };
}

/** What the tutorial's "Show me" button opens. Plain data: the UI decides how to show it. */
export type GuideAction =
  | { kind: 'tool'; tool: 'corridor' | RoomType }
  | { kind: 'select'; roomType: RoomType }
  | { kind: 'tab'; tab: 'hire' | 'admit' | 'network' }
  | { kind: 'view'; view: 'residents' | 'roster' | 'finance' }
  | { kind: 'speed' }
  | { kind: 'land' }
  | { kind: 'decor' };

export interface Objective {
  id: string;
  /** i18n key of the goal. */
  key: string;
  /** i18n key of the tutorial's how-to hint. */
  hint: string;
  params?: Record<string, number>;
  done: boolean;
  progress?: { have: number; need: number };
  action: GuideAction;
}

const capped = (have: number, need: number) => ({ have: Math.min(have, need), need });

/** The last step of every chapter: finish it with the targets met. */
function chapterStep(state: GameState, def: ChapterDef): Objective {
  const elapsed = state.chapter.result ? def.days : dayOf(state.minute) - state.chapter.startDay;
  return {
    id: 'chapter',
    key: `goal.chapter${def.id}`,
    hint: `tut.chapter${def.id}`,
    params: { n: def.days, r: def.targetResidents, q: def.targetQuality },
    done: state.chapter.result?.outcome === 'won',
    progress: capped(elapsed, def.days),
    action: { kind: 'view', view: 'finance' },
  };
}

/**
 * Goals of the running chapter in tutorial order, derived purely from state (no stored flags), so
 * the tutorial always matches the game: the current step is the first one not done.
 */
export function buildObjectives(state: GameState, summary: SiteSummary = summarize(state)): Objective[] {
  // Sandbox games have no story steps.
  if (state.mode === 'sandbox') return [];
  const def = chapterDef(state.chapter.id);
  const hasResidents = state.residents.length > 0;
  const rosterReady = hasResidents && rosterView(state).slots.every((s) => s.ready && s.staffCount > 0);
  const step = (id: string, done: boolean, action: GuideAction, extra: Partial<Objective> = {}): Objective => ({ id, key: `goal.${id}`, hint: `tut.${id}`, done, action, ...extra });

  if (def.id === 2) {
    const secured = state.site.rooms.some((r) => r.type === 'ward' && (r.equipment.door_sensor ?? 0) > 0 && summary.statuses.get(r.id)?.operational);
    const rn = state.employees.filter((e) => e.role === 'rn').length;
    const has = (g: CareGroup) => state.residents.some((r) => r.group === g);
    return [
      step('beds2', summary.bedsOperational >= def.targetBeds, { kind: 'tool', tool: 'ward' }, { key: 'goal.beds', params: { n: def.targetBeds }, progress: capped(summary.bedsOperational, def.targetBeds) }),
      step('secure_ward', secured, { kind: 'select', roomType: 'ward' }),
      step('rn_team', rn >= (def.targetRn ?? 0), { kind: 'tab', tab: 'hire' }, { params: { n: def.targetRn ?? 0 }, progress: capped(rn, def.targetRn ?? 0) }),
      step('prog_dementia', has('dementia'), { kind: 'tab', tab: 'admit' }),
      step('prog_tube_feeding', has('tube_feeding'), { kind: 'tab', tab: 'admit' }),
      step('prog_airway', has('airway'), { kind: 'tab', tab: 'admit' }),
      step('roster2', rosterReady, { kind: 'view', view: 'roster' }, { key: 'goal.roster' }),
      step('fill2', state.residents.length >= def.targetResidents, { kind: 'tab', tab: 'admit' }, { key: 'goal.fill', params: { n: def.targetResidents }, progress: capped(state.residents.length, def.targetResidents) }),
      chapterStep(state, def),
    ];
  }

  if (def.id === 3) {
    const premium = state.residents.filter((r) => r.premium);
    const villas = state.site.rooms.filter((r) => r.type === 'villa' && summary.statuses.get(r.id)?.operational).length;
    const appeal = gardenAppeal(state.site.decor);
    const n = def.targetPremium ?? 0;
    return [
      step('land', state.site.width >= EXPANDED_WIDTH, { kind: 'land' }),
      step('villas', villas >= n, { kind: 'tool', tool: 'villa' }, { params: { n }, progress: capped(villas, n) }),
      step('garden', appeal >= (def.targetAppeal ?? 0), { kind: 'decor' }, { params: { n: def.targetAppeal ?? 0 }, progress: capped(appeal, def.targetAppeal ?? 0) }),
      step('premium', premium.length >= n, { kind: 'tab', tab: 'admit' }, { params: { n }, progress: capped(premium.length, n) }),
      step('fill3', state.residents.length >= def.targetResidents, { kind: 'tab', tab: 'admit' }, { key: 'goal.fill', params: { n: def.targetResidents }, progress: capped(state.residents.length, def.targetResidents) }),
      chapterStep(state, def),
    ];
  }

  if (def.id === 4) {
    const n = def.targetClients ?? 0;
    const rate = visitRate(state);
    return [
      step('hc_office', hasHomecareOffice(state), { kind: 'tool', tool: 'homecare_office' }),
      step('hc_first', state.homecare.clients.length > 0, { kind: 'tab', tab: 'admit' }),
      step('hc_roster', state.homecare.clients.length > 0 && rosterReady, { kind: 'view', view: 'roster' }, { key: 'goal.roster' }),
      step('hc_clients', state.homecare.clients.length >= n, { kind: 'tab', tab: 'admit' }, { params: { n }, progress: capped(state.homecare.clients.length, n) }),
      step('hc_rate', rate !== null && rate >= (def.targetVisitRate ?? 0) && state.homecare.history.length >= 7, { kind: 'view', view: 'roster' }, { params: { n: Math.round((def.targetVisitRate ?? 0) * 100) } }),
      chapterStep(state, def),
    ];
  }

  if (def.id === 7) {
    const bs = state.network.branches;
    const has = (k: string) => bs.some((b) => b.kind === k);
    const st = networkStats(state);
    const n = def.targetBranches ?? 0;
    const q = def.targetNetworkQuality ?? 0;
    const occ = Math.round((def.targetNetworkOccupancy ?? 0) * 100);
    return [
      step('br_nursing', has('nursing'), { kind: 'tab', tab: 'network' }),
      step('br_homecare', has('homecare'), { kind: 'tab', tab: 'network' }),
      step('br_clinic', has('clinic'), { kind: 'tab', tab: 'network' }),
      step('br_roster', bs.length > 0 && rosterReady, { kind: 'view', view: 'roster' }, { key: 'goal.roster' }),
      step('br_count', bs.length >= n, { kind: 'tab', tab: 'network' }, { params: { n }, progress: capped(bs.length, n) }),
      step('br_quality', (st.quality ?? 0) >= q, { kind: 'tab', tab: 'network' }, { params: { n: q }, progress: capped(st.quality ?? 0, q) }),
      step('br_occupancy', Math.round((st.occupancy ?? 0) * 100) >= occ, { kind: 'tab', tab: 'network' }, { params: { n: occ }, progress: capped(Math.round((st.occupancy ?? 0) * 100), occ) }),
      chapterStep(state, def),
    ];
  }

  if (def.id === 6) {
    const n = def.targetConsults ?? 0;
    const m = def.targetDischarges ?? 0;
    const consults = consultsSince(state, state.chapter.startDay);
    const smooth = smoothDischarges(state, state.chapter.startDay);
    const rate = consultRate(state);
    const strokeOpen = state.site.rooms.some((r) => r.type === 'stroke_unit' && summary.statuses.get(r.id)?.operational);
    return [
      step('doctor', hasDoctor(state), { kind: 'tab', tab: 'hire' }),
      step('clinic', clinicDesks(state) > 0, { kind: 'tool', tool: 'neuro_clinic' }),
      step('opd_first', consults > 0, { kind: 'view', view: 'roster' }),
      step('stroke_unit', strokeOpen, { kind: 'tool', tool: 'stroke_unit' }),
      step('ipd_first', state.hospital.inpatients.length > 0 || state.hospital.discharged.length > 0, { kind: 'tab', tab: 'admit' }),
      step('roster6', strokeOpen && rosterReady, { kind: 'view', view: 'roster' }, { key: 'goal.roster' }),
      step('opd_visits', consults >= n, { kind: 'view', view: 'roster' }, { params: { n }, progress: capped(consults, n) }),
      step('opd_rate', rate !== null && rate >= (def.targetConsultRate ?? 0) && state.hospital.history.length >= 7, { kind: 'view', view: 'roster' }, { params: { n: Math.round((def.targetConsultRate ?? 0) * 100) } }),
      step('discharges', smooth >= m, { kind: 'tab', tab: 'admit' }, { params: { n: m }, progress: capped(smooth, m) }),
      chapterStep(state, def),
    ];
  }

  if (def.id === 5) {
    const certified = certifiedCount(state);
    const done = contractsCompleted(state, state.chapter.startDay);
    const n = def.targetCertified ?? 0;
    const m = def.targetContracts ?? 0;
    const placed = state.workforce.contracts.length > 0 || done > 0;
    return [
      step('tr_room', hasTrainingRoom(state), { kind: 'tool', tool: 'training_room' }),
      step('tr_first', certified > 0, { kind: 'tab', tab: 'hire' }),
      step('wf_first', placed, { kind: 'tab', tab: 'hire' }),
      step('wf_roster', placed && rosterReady, { kind: 'view', view: 'roster' }, { key: 'goal.roster' }),
      step('certified', certified >= n, { kind: 'tab', tab: 'hire' }, { params: { n }, progress: capped(certified, n) }),
      step('contracts', done >= m, { kind: 'tab', tab: 'hire' }, { params: { n: m }, progress: capped(done, m) }),
      chapterStep(state, def),
    ];
  }

  const wardConnected = state.site.rooms.some((r) => r.type === 'ward' && summary.statuses.get(r.id)?.door);
  return [
    step('corridor', summary.corridorTiles >= 6, { kind: 'tool', tool: 'corridor' }, { progress: capped(summary.corridorTiles, 6) }),
    step('ward', wardConnected, { kind: 'tool', tool: 'ward' }),
    step('beds', summary.bedsOperational >= def.targetBeds, { kind: 'select', roomType: 'ward' }, { params: { n: def.targetBeds }, progress: capped(summary.bedsOperational, def.targetBeds) }),
    step('station', summary.operationalByType.nursing_station > 0, { kind: 'tool', tool: 'nursing_station' }),
    step('therapy', summary.operationalByType.therapy > 0, { kind: 'tool', tool: 'therapy' }),
    step('staff_room', summary.operationalByType.staff_room > 0, { kind: 'tool', tool: 'staff_room' }),
    step('hire_rn', state.employees.some((e) => e.role === 'rn'), { kind: 'tab', tab: 'hire' }),
    step('admit', hasResidents, { kind: 'tab', tab: 'admit' }),
    step('care_plan', hasResidents && state.residents.every((r) => r.carePlan), { kind: 'view', view: 'residents' }),
    step('roster', rosterReady, { kind: 'view', view: 'roster' }),
    step('run', state.minute > START_MINUTE, { kind: 'speed' }),
    step('fill', state.residents.length >= def.targetResidents, { kind: 'tab', tab: 'admit' }, { params: { n: def.targetResidents }, progress: capped(state.residents.length, def.targetResidents) }),
    step('first_revenue', state.ledger.some((e) => e.category === 'revenue'), { kind: 'view', view: 'finance' }),
    chapterStep(state, def),
  ];
}

// ---------------------------------------------------------------------------
// Phase 2 selectors (pure; the UI renders these, the sim never stores them)
// ---------------------------------------------------------------------------

export { SKILL_OWNER };

/** Share of staffed time that is productive, used for recommendations (80%). */
const PRODUCTIVE_SHARE = 1;

/** One planned care task, positioned in minutes since its shift started. */
export interface PlannedTask {
  at: number;
  duration: number;
  grace: number;
  skill: Skill;
}

export interface SlotDemand {
  minutes: number;
  bySkill: Partial<Record<Skill, number>>;
  tasks: PlannedTask[];
}

/** Care minutes each shift needs per day, from the residents' care plans. */
export function slotDemand(state: GameState): Record<ShiftSlot, SlotDemand> {
  const out = {} as Record<ShiftSlot, SlotDemand>;
  for (const slot of SLOT_ORDER) out[slot] = { minutes: 0, bySkill: {}, tasks: [] };
  for (const r of state.residents) {
    if (!r.carePlan) continue;
    for (const [kind, mod] of carePlanSchedule(r.group, r.careLevel)) {
      const def = TASK_KINDS[kind];
      const slot = SLOT_ORDER.find((sl) => inWindow(mod, SHIFT_SLOTS[sl].start, SHIFT_SLOTS[sl].end))!;
      out[slot].minutes += def.duration;
      out[slot].bySkill[def.skill] = (out[slot].bySkill[def.skill] ?? 0) + def.duration;
      out[slot].tasks.push({ at: (mod - SHIFT_SLOTS[slot].start + MINUTES_PER_DAY) % MINUTES_PER_DAY, duration: def.duration, grace: def.grace, skill: def.skill });
    }
  }
  // Home visits (Chapter 4) need people too, during the morning shift.
  for (const c of state.homecare.clients) {
    const mod = c.visitAt;
    const slot = SLOT_ORDER.find((sl) => inWindow(mod, SHIFT_SLOTS[sl].start, SHIFT_SLOTS[sl].end))!;
    const skill = VISIT_SKILL[c.plan];
    out[slot].minutes += VISIT_DURATION;
    out[slot].bySkill[skill] = (out[slot].bySkill[skill] ?? 0) + VISIT_DURATION;
    out[slot].tasks.push({ at: (mod - SHIFT_SLOTS[slot].start + MINUTES_PER_DAY) % MINUTES_PER_DAY, duration: VISIT_DURATION, grace: VISIT_GRACE, skill });
  }
  // The neuro hospital (Chapter 6): booked consultations, and rounds for every stroke-unit bed.
  const add = (mod: number, duration: number, grace: number, skill: Skill) => {
    const slot = SLOT_ORDER.find((sl) => inWindow(mod, SHIFT_SLOTS[sl].start, SHIFT_SLOTS[sl].end))!;
    out[slot].minutes += duration;
    out[slot].bySkill[skill] = (out[slot].bySkill[skill] ?? 0) + duration;
    out[slot].tasks.push({ at: (mod - SHIFT_SLOTS[slot].start + MINUTES_PER_DAY) % MINUTES_PER_DAY, duration, grace, skill });
  };
  if (state.chapter.id >= 6) for (const mod of slotsPerDesk(state)) for (let d = 0; d < clinicDesks(state); d++) add(mod, CONSULT_MINUTES, CONSULT_GRACE, 'consult');
  for (let b = 0; b < strokeBeds(state).length; b++) {
    for (const mod of NURSE_ROUNDS) add(mod, NURSE_ROUND_MINUTES, ROUND_GRACE, 'vital_signs');
    add(DOCTOR_ROUND, DOCTOR_ROUND_MINUTES, DOCTOR_ROUND_GRACE, 'consult');
  }
  return out;
}

/**
 * People needed so every rush fits: for each window of due times [a, b], the work due in it must be
 * done between a and the last start time allowed (b + grace, capped at the shift end).
 */
function peopleFor(tasks: PlannedTask[], shiftLength: number): number {
  if (!tasks.length) return 0;
  const times = [...new Set(tasks.map((t) => t.at))].sort((x, y) => x - y);
  let need = 0;
  for (let i = 0; i < times.length; i++) {
    let work = 0;
    let end = 0;
    for (let j = i; j < times.length; j++) {
      for (const t of tasks) {
        if (t.at !== times[j]) continue;
        work += t.duration;
        end = Math.max(end, Math.min(t.at + t.grace + t.duration, shiftLength));
      }
      const span = Math.max(10, end - times[i]);
      need = Math.max(need, Math.ceil(work / (span * PRODUCTIVE_SHARE) - 1e-9));
    }
  }
  // Deadline check: work that both falls due at or after `a` and must be finished by `d` has to fit
  // between them. (Without it, one long task with a late finish — a home visit — hides a short rush.)
  const deadline = (t: PlannedTask) => Math.min(t.at + t.grace + t.duration, shiftLength);
  const deadlines = [...new Set(tasks.map(deadline))].sort((x, y) => x - y);
  for (const a of times)
    for (const d of deadlines) {
      if (d <= a) continue;
      const work = tasks.reduce((w, t) => (t.at >= a && deadline(t) <= d ? w + t.duration : w), 0);
      if (work) need = Math.max(need, Math.ceil(work / ((d - a) * PRODUCTIVE_SHARE) - 1e-9));
    }
  return need;
}

/**
 * Recommended headcount per role for one shift. Broader roles cover narrower work with their spare
 * time, the way task assignment does: the supervising RN also does PN work (vital signs, medication
 * rounds), and RNs and PNs also do caregiver work (personal care, meals).
 */
export function roleNeeds(demand: SlotDemand, shiftLength: number, rnOnDuty: boolean): Record<StaffRole, number> {
  const of = (...roles: StaffRole[]) => demand.tasks.filter((t) => roles.includes(SKILL_OWNER[t.skill]));
  // One RN supervises each day shift; airway care can call for more, at night too.
  const rn = Math.max(rnOnDuty ? 1 : 0, peopleFor(of('rn'), shiftLength));
  const pn = Math.max(0, peopleFor(of('rn', 'pn'), shiftLength) - rn);
  // Caregiver work is planned for caregivers alone: in a rush, nurses' time goes to nurse-only work.
  const caregiver = peopleFor(of('caregiver'), shiftLength);
  return { doctor: peopleFor(of('doctor'), shiftLength), rn, pn, caregiver, pt: peopleFor(of('pt'), shiftLength), ot: peopleFor(of('ot'), shiftLength), pharmacist: 0, nutritionist: 0, cleaner: 0, receptionist: 0, security: 0, accountant: 0 };
}

export interface RosterCell {
  role: StaffRole;
  slot: ShiftSlot;
  staff: Employee[];
  need: number;
}

export interface SlotSummary {
  slot: ShiftSlot;
  staffCount: number;
  needCount: number;
  /** Planned care minutes / staffed minutes, 0..∞ (shown as %). */
  workload: number;
  /** Skills needed by this shift's tasks that no rostered employee has. */
  missingSkills: Skill[];
  /** Day shifts need an RN on duty to supervise. */
  missingRn: boolean;
  ready: boolean;
}

export function rosterView(state: GameState): { cells: RosterCell[]; slots: SlotSummary[] } {
  const demand = slotDemand(state);
  const hasResidents = state.residents.length > 0;
  const cells: RosterCell[] = [];
  const slots: SlotSummary[] = [];
  for (const slot of SLOT_ORDER) {
    const onSlot = new Set(state.shifts.filter((s) => s.slot === slot).map((s) => s.employeeId));
    const staff = state.employees.filter((e) => onSlot.has(e.id));
    const needs = roleNeeds(demand[slot], shiftMinutes(SHIFT_SLOTS[slot].start, SHIFT_SLOTS[slot].end), hasResidents && slot !== 'night');
    let needCount = 0;
    for (const role of ROLE_ORDER) {
      needCount += needs[role];
      cells.push({ role, slot, staff: staff.filter((e) => e.role === role), need: needs[role] });
    }
    const skillsOnDuty = new Set(staff.flatMap((e) => e.skills));
    const missingSkills = (Object.keys(demand[slot].bySkill) as Skill[]).filter((k) => !skillsOnDuty.has(k));
    const missingRn = hasResidents && slot !== 'night' && !staff.some((e) => e.role === 'rn');
    slots.push({
      slot,
      staffCount: staff.length,
      needCount,
      workload: staff.length ? demand[slot].minutes / (staff.length * 480) : demand[slot].minutes > 0 ? Infinity : 0,
      missingSkills,
      missingRn,
      ready: missingSkills.length === 0 && !missingRn,
    });
  }
  return { cells, slots };
}

export interface CareKpis {
  residents: number;
  bedsOperational: number;
  /** 0..1, or null with no beds. */
  occupancy: number | null;
  /** Average resident wellbeing 0..100, or null with no residents. */
  wellbeing: number | null;
  /** Today's completed / (completed + missed), or null before any task resolves. */
  completion: number | null;
  /** 0..100 composite, or null with no residents. */
  quality: number | null;
  payrollPerDaySatang: Satang;
}

export function careKpis(state: GameState, summary: SiteSummary = summarize(state)): CareKpis {
  const n = state.residents.length;
  const wb = n ? state.residents.reduce((a, r) => a + wellbeing(r.needs), 0) / n : null;
  // Completion over today plus yesterday so the KPI is stable right after midnight.
  const last = state.history[state.history.length - 1];
  const done = state.today.done + (last?.done ?? 0);
  const missed = state.today.missed + (last?.missed ?? 0);
  const completion = done + missed > 0 ? done / (done + missed) : null;
  const quality = wb === null ? null : Math.round(0.6 * wb + 0.4 * (completion ?? 1) * 100);
  return {
    residents: n,
    bedsOperational: summary.bedsOperational,
    occupancy: summary.bedsOperational ? n / summary.bedsOperational : null,
    wellbeing: wb,
    completion,
    quality,
    payrollPerDaySatang: dailyPayroll(state),
  };
}

export type StaffActivity =
  | { kind: 'off' }
  | { kind: 'idle' }
  | { kind: 'busy'; taskKind: import('../domain/types').TaskKind; residentId: string }
  | { kind: 'away'; clientId: string }
  | { kind: 'placed'; contractId: string }
  | { kind: 'training' }
  | { kind: 'branch'; branchId: string }
  | { kind: 'hospital'; task: import('../domain/types').HospitalTask['kind']; patientId: string };

export function staffActivity(state: GameState, e: Employee): StaffActivity {
  if (e.branch) return { kind: 'branch', branchId: e.branch };
  if (e.taskId) {
    const t = state.tasks.find((x) => x.id === e.taskId);
    if (t) return { kind: 'busy', taskKind: t.kind, residentId: t.residentId };
    const v = state.homecare.visits.find((x) => x.id === e.taskId);
    if (v) return { kind: 'away', clientId: v.clientId };
    if (isPlacedAway(e)) return { kind: 'placed', contractId: e.placement ?? '' };
    if (isInClass(e)) return { kind: 'training' };
    const h = hospitalTaskOf(state, e);
    if (h) return { kind: 'hospital', task: h.kind, patientId: h.patientId };
  }
  return isOnShift(state, e.id, state.minute) ? { kind: 'idle' } : { kind: 'off' };
}

/** People markers for the renderer (pure). Off-duty staff are not drawn. */
export function peopleMarkers(state: GameState): Array<{ key: string; kind: 'resident' | 'staff'; roomId: string | null; bed?: number; spot?: number; group?: string; role?: string }> {
  const out: Array<{ key: string; kind: 'resident' | 'staff'; roomId: string | null; bed?: number; spot?: number; group?: string; role?: string }> = [];
  const bedOf = new Map<string, { roomId: string; index: number }>();
  for (const r of state.residents) {
    const i = r.bedId.lastIndexOf('#');
    const loc = { roomId: r.bedId.slice(0, i), index: Number(r.bedId.slice(i + 1)) };
    bedOf.set(r.id, loc);
    out.push({ key: r.id, kind: 'resident', roomId: loc.roomId, bed: loc.index, group: r.group });
  }
  const station = state.site.rooms.find((r) => r.type === 'nursing_station') ?? state.site.rooms.find((r) => r.type === 'staff_room');
  let spot = 0;
  const classroom = state.site.rooms.find((r) => r.type === 'training_room');
  const clinic = state.site.rooms.find((r) => r.type === 'neuro_clinic');
  let desk = 0;
  // Stroke-unit inpatients lie in their beds like residents.
  const inpatientBed = new Map<string, { roomId: string; index: number }>();
  for (const p of state.hospital.inpatients) {
    const i = p.bedId.lastIndexOf('#');
    const loc = { roomId: p.bedId.slice(0, i), index: Number(p.bedId.slice(i + 1)) };
    inpatientBed.set(p.id, loc);
    out.push({ key: p.id, kind: 'resident', roomId: loc.roomId, bed: loc.index, group: 'stroke_rehab' });
  }
  let seat = 0;
  for (const e of state.employees) {
    const act = staffActivity(state, e);
    // Off duty, out on a home visit, or working at a partner: not in the building.
    if (act.kind === 'off' || act.kind === 'away' || act.kind === 'placed' || act.kind === 'branch') continue;
    if (act.kind === 'hospital') {
      const loc = act.task === 'consult' ? undefined : inpatientBed.get(act.patientId);
      if (loc) out.push({ key: e.id, kind: 'staff', roomId: loc.roomId, bed: loc.index, role: e.role });
      else out.push({ key: e.id, kind: 'staff', roomId: clinic?.id ?? station?.id ?? null, spot: desk++, role: e.role });
      continue;
    }
    if (act.kind === 'training' && classroom) {
      out.push({ key: e.id, kind: 'staff', roomId: classroom.id, spot: seat++, role: e.role });
      continue;
    }
    if (act.kind === 'busy') {
      const loc = bedOf.get(act.residentId);
      if (loc) {
        out.push({ key: e.id, kind: 'staff', roomId: loc.roomId, bed: loc.index, role: e.role });
        continue;
      }
    }
    out.push({ key: e.id, kind: 'staff', roomId: station?.id ?? null, spot: spot++, role: e.role });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Phase 3: finance view (pure)
// ---------------------------------------------------------------------------

export const OPEX_CATEGORIES: LedgerCategory[] = ['payroll', 'upkeep', 'food', 'supplies', 'event', 'training', 'branch'];
export const CAPEX_CATEGORIES: LedgerCategory[] = ['construction', 'equipment', 'refund'];

/** Entries posted exactly at midnight belong to the day that just closed. */
export function entryDay(e: LedgerEntry): number {
  return dayOf(e.at % 1440 === 0 && e.at > 0 ? e.at - 1 : e.at);
}

export interface PeriodTotals {
  revenue: Satang;
  opex: Satang;
  net: Satang;
  capex: Satang;
  /** Positive amounts spent per operating category. */
  byCategory: Partial<Record<LedgerCategory, Satang>>;
}

export function totalsOf(entries: LedgerEntry[]): PeriodTotals {
  const t: PeriodTotals = { revenue: 0, opex: 0, net: 0, capex: 0, byCategory: {} };
  for (const e of entries) {
    if (e.category === 'revenue' || e.category === 'fee_refund') t.revenue += e.amountSatang;
    else if (OPEX_CATEGORIES.includes(e.category)) {
      t.opex -= e.amountSatang;
      t.byCategory[e.category] = (t.byCategory[e.category] ?? 0) - e.amountSatang;
    } else if (CAPEX_CATEGORIES.includes(e.category)) t.capex -= e.amountSatang;
  }
  t.net = t.revenue - t.opex;
  return t;
}

export interface FinanceView {
  month: number;
  day: number;
  current: PeriodTotals;
  previous: PeriodTotals | null;
  /** Bars: one point per day (month view) or per month (all-time view). */
  series: Array<{ label: number; revenue: Satang; opex: Satang }>;
  mix: Array<{ stream: RevenueStream; amount: Satang }>;
  receivables: Satang;
  invoices: Invoice[];
}

export function financeView(state: GameState, period: 'month' | 'all'): FinanceView {
  const day = dayOf(state.minute);
  const month = monthOfDay(day);
  const entries = state.ledger.filter((e) => e.category !== 'capital');
  const inMonth = (m: number) => entries.filter((e) => monthOfDay(entryDay(e)) === m);
  const current = totalsOf(period === 'month' ? inMonth(month) : entries);
  // Month-to-date is compared with the same days of the previous month.
  const dim = dayInMonth(day);
  const previous = period === 'month' && month > 1 ? totalsOf(inMonth(month - 1).filter((e) => dayInMonth(entryDay(e)) <= dim)) : null;

  const series: FinanceView['series'] = [];
  if (period === 'month') {
    const first = (month - 1) * 30 + 1;
    for (let d = first; d <= day; d++) {
      const t = totalsOf(entries.filter((e) => entryDay(e) === d));
      series.push({ label: d - first + 1, revenue: t.revenue, opex: t.opex });
    }
  } else {
    for (let m = 1; m <= month; m++) {
      const t = totalsOf(inMonth(m));
      series.push({ label: m, revenue: t.revenue, opex: t.opex });
    }
  }

  const streams: RevenueStream[] = ['room_care', 'therapy', 'activity', 'special', 'homecare', 'workforce', 'hospital', 'network'];
  const mixMap: Record<RevenueStream, Satang> = { room_care: 0, therapy: 0, activity: 0, special: 0, homecare: 0, workforce: 0, hospital: 0, network: 0 };
  for (const inv of state.invoices) {
    if (inv.status !== 'paid' || inv.paidAt === null) continue;
    const paidDay = dayOf(inv.paidAt % 1440 === 0 ? inv.paidAt - 1 : inv.paidAt);
    if (period === 'month' && monthOfDay(paidDay) !== month) continue;
    for (const l of inv.lines) mixMap[l.stream] += l.amountSatang;
  }
  // Refunded room & care for residents who left reduces that stream.
  for (const e of state.ledger)
    if (e.category === 'fee_refund' && (period !== 'month' || monthOfDay(entryDay(e)) === month)) mixMap.room_care += e.amountSatang;
  return {
    month,
    day,
    current,
    previous,
    series,
    mix: streams.map((stream) => ({ stream, amount: mixMap[stream] })),
    receivables: state.invoices.filter((i) => i.status === 'issued').reduce((a, i) => a + i.totalSatang, 0),
    invoices: [...state.invoices].reverse().slice(0, 8),
  };
}

/** Running costs charged every midnight at today's size: payroll, upkeep, food and supplies. */
export function dailyRunningCost(state: GameState): Satang {
  const { food, supplies } = dailyResidentCosts(state);
  return dailyPayroll(state) + dailyUpkeep(state) + food + supplies;
}

/** Day number of the next start-of-month billing run. */
export function nextBillingDay(state: GameState): number {
  return monthOfDay(dayOf(state.minute)) * 30 + 1;
}

export interface Runway {
  /** Whole days the cash covers at today's running costs (null with no costs). */
  days: number | null;
  /** Days until the next monthly invoices go out. */
  untilBilling: number;
  /** True when cash runs out before the next billing day. */
  short: boolean;
}

/** How long the cash lasts without new revenue; the danger zone is running dry before billing day. */
export function cashRunway(state: GameState): Runway {
  const cost = dailyRunningCost(state);
  const untilBilling = nextBillingDay(state) - dayOf(state.minute);
  const days = cost > 0 ? Math.max(0, Math.floor(state.organization.cashSatang / cost)) : null;
  return { days, untilBilling, short: days !== null && days < untilBilling };
}

/** Top-bar gauges. */
export function headline(state: GameState, summary: SiteSummary = summarize(state)) {
  const n = state.residents.length;
  const last = state.history[state.history.length - 1];
  const startCash = state.ledger.find((e) => e.category === 'capital')?.amountSatang ?? 0;
  return {
    residents: n,
    beds: summary.bedsOperational,
    satisfaction: n ? state.residents.reduce((a, r) => a + r.needs.satisfaction, 0) / n : null,
    cashDelta: state.organization.cashSatang - (last ? last.cash : startCash),
  };
}

/**
 * A building's number among its own kind (1-based, oldest first), for default names such as
 * "Ward 2". Kinds the home usually has once get no number unless there are several.
 */
export function roomNumber(site: GameState['site'], room: Room): number | null {
  const same = site.rooms.filter((r) => r.type === room.type).sort((a, b) => a.builtAt - b.builtAt || (a.id < b.id ? -1 : 1));
  const numbered = room.type === 'ward' || room.type === 'villa';
  if (!numbered && same.length < 2) return null;
  return same.findIndex((r) => r.id === room.id) + 1;
}

// ---------------------------------------------------------------------------
// Performance by profession
// ---------------------------------------------------------------------------

export interface RoleReport {
  role: StaffRole;
  people: number;
  done: number;
  missed: number;
  /** Share of this profession's tasks done, 0..100 (null with no tasks). */
  rate: number | null;
  minutes: number;
  /** Payroll over the period divided by tasks done (null with none done). */
  costPerTask: Satang | null;
  /** Support professions: whether their room and shift make them count today. */
  support: boolean | null;
  days: number;
}

/** Care work per profession over the closed days kept (up to 7), for every role on the staff or with work. */
export function rolePerformance(state: GameState): RoleReport[] {
  const days = state.perfDays ?? [];
  const out: RoleReport[] = [];
  for (const role of ROLE_ORDER) {
    const staff = state.employees.filter((e) => e.role === role);
    let done = 0, missed = 0, minutes = 0;
    for (const d of days) {
      const w = d[role];
      if (w) (done += w.done), (missed += w.missed), (minutes += w.minutes);
    }
    if (!staff.length && !done && !missed) continue;
    const payroll = staff.reduce((a, e) => a + dailyWage(e.wageMonthlySatang), 0) * days.length;
    out.push({
      role,
      people: staff.length,
      done,
      missed,
      rate: done + missed ? Math.round((done / (done + missed)) * 100) : null,
      minutes,
      costPerTask: done ? Math.round(payroll / done) : null,
      support: SUPPORT_ROLES.includes(role) ? supportActive(state, role) : null,
      days: days.length,
    });
  }
  return out;
}
