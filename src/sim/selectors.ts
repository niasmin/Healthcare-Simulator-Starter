import { STARTER_SCENARIO } from '../data/scenarios';
import { allRoomStatuses, type RoomStatus } from '../domain/rules/rooms';
import type { GameState, LedgerCategory, RoomType, Satang } from '../domain/types';
import { dailyPayroll, dailyUpkeep } from './systems/finance';
import { carePlanSchedule, TASK_KINDS } from '../data/patients';
import { ROLE_ORDER, SHIFT_SLOTS, SLOT_ORDER } from '../data/staff';
import { inWindow, isOnShift } from '../domain/rules/shifts';
import type { Employee, ShiftSlot, Skill, StaffRole } from '../domain/types';
import { wellbeing } from './systems/needs';

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
  const operationalByType: Record<RoomType, number> = { ward: 0, nursing_station: 0, therapy: 0, staff_room: 0 };
  for (const room of state.site.rooms) {
    const st = statuses.get(room.id)!;
    bedsInstalled += st.installedBeds;
    bedsOperational += st.capacity;
    if (st.operational) {
      roomsOperational++;
      operationalByType[room.type]++;
    }
  }
  const spentByCategory: Record<LedgerCategory, Satang> = { capital: 0, construction: 0, equipment: 0, refund: 0, upkeep: 0, payroll: 0 };
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

export interface Objective {
  id: string;
  key: string;
  params?: Record<string, number>;
  done: boolean;
  progress?: { have: number; need: number };
}

/** First-milestone build goals, derived purely from state (no stored flags). */
export function buildObjectives(state: GameState, summary: SiteSummary = summarize(state)): Objective[] {
  const target = STARTER_SCENARIO.targetBeds;
  const connected = state.site.rooms.some((r) => summary.statuses.get(r.id)?.door);
  return [
    { id: 'corridor', key: 'goal.corridor', done: summary.corridorTiles >= 6, progress: { have: Math.min(summary.corridorTiles, 6), need: 6 } },
    { id: 'connected', key: 'goal.connected', done: connected },
    {
      id: 'beds',
      key: 'goal.beds',
      params: { n: target },
      done: summary.bedsOperational >= target,
      progress: { have: Math.min(summary.bedsOperational, target), need: target },
    },
    { id: 'station', key: 'goal.station', done: summary.operationalByType.nursing_station > 0 },
    { id: 'staff_room', key: 'goal.staff_room', done: summary.operationalByType.staff_room > 0 },
    { id: 'therapy', key: 'goal.therapy', done: summary.operationalByType.therapy > 0 },
    { id: 'cash', key: 'goal.cash', done: state.organization.cashSatang > 0 && summary.roomsOperational >= 3 },
    { id: 'hire_rn', key: 'goal.hire_rn', done: state.employees.some((e) => e.role === 'rn') },
    { id: 'admit', key: 'goal.admit', done: state.residents.length > 0 },
    { id: 'care_plan', key: 'goal.care_plan', done: state.residents.length > 0 && state.residents.every((r) => r.carePlan) },
    { id: 'roster', key: 'goal.roster', done: state.residents.length > 0 && rosterView(state).slots.every((s) => s.ready && s.staffCount > 0) },
  ];
}

// ---------------------------------------------------------------------------
// Phase 2 selectors (pure; the UI renders these, the sim never stores them)
// ---------------------------------------------------------------------------

/** Which role is the natural owner of each skill (for staffing recommendations). */
const SKILL_OWNER: Record<Skill, StaffRole> = {
  assessment: 'rn',
  vital_signs: 'pn',
  med_round: 'pn',
  personal_care: 'caregiver',
  feeding: 'caregiver',
  mobility: 'pt',
  activity: 'ot',
};

/** Productive minutes per 8-hour shift used for recommendations (80%). */
const PRODUCTIVE_MINUTES = 384;

export interface SlotDemand {
  minutes: number;
  bySkill: Partial<Record<Skill, number>>;
}

/** Care minutes each shift needs per day, from the residents' care plans. */
export function slotDemand(state: GameState): Record<ShiftSlot, SlotDemand> {
  const out = {} as Record<ShiftSlot, SlotDemand>;
  for (const slot of SLOT_ORDER) out[slot] = { minutes: 0, bySkill: {} };
  for (const r of state.residents) {
    if (!r.carePlan) continue;
    for (const [kind, mod] of carePlanSchedule(r.group, r.careLevel)) {
      const def = TASK_KINDS[kind];
      const slot = SLOT_ORDER.find((sl) => inWindow(mod, SHIFT_SLOTS[sl].start, SHIFT_SLOTS[sl].end))!;
      out[slot].minutes += def.duration;
      out[slot].bySkill[def.skill] = (out[slot].bySkill[def.skill] ?? 0) + def.duration;
    }
  }
  return out;
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
    let needCount = 0;
    for (const role of ROLE_ORDER) {
      let need = 0;
      if (role === 'rn') need = hasResidents && slot !== 'night' ? 1 : 0;
      else {
        let minutes = 0;
        for (const [skill, m] of Object.entries(demand[slot].bySkill) as [Skill, number][]) if (SKILL_OWNER[skill] === role) minutes += m;
        need = Math.ceil(minutes / PRODUCTIVE_MINUTES);
      }
      needCount += need;
      cells.push({ role, slot, staff: staff.filter((e) => e.role === role), need });
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
  | { kind: 'busy'; taskKind: import('../domain/types').TaskKind; residentId: string };

export function staffActivity(state: GameState, e: Employee): StaffActivity {
  if (e.taskId) {
    const t = state.tasks.find((x) => x.id === e.taskId);
    if (t) return { kind: 'busy', taskKind: t.kind, residentId: t.residentId };
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
  for (const e of state.employees) {
    const act = staffActivity(state, e);
    if (act.kind === 'off') continue;
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
