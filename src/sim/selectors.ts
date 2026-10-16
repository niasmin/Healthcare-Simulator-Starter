import { STARTER_SCENARIO } from '../data/scenarios';
import { allRoomStatuses, type RoomStatus } from '../domain/rules/rooms';
import type { GameState, LedgerCategory, RoomType, Satang } from '../domain/types';
import { dailyPayroll, dailyUpkeep } from './systems/finance';
import { carePlanSchedule, TASK_KINDS } from '../data/patients';
import { ROLE_ORDER, SHIFT_SLOTS, SLOT_ORDER } from '../data/staff';
import { inWindow, isOnShift } from '../domain/rules/shifts';
import type { Employee, ShiftSlot, Skill, StaffRole } from '../domain/types';
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
  const spentByCategory: Record<LedgerCategory, Satang> = { capital: 0, construction: 0, equipment: 0, refund: 0, upkeep: 0, payroll: 0, revenue: 0, food: 0, supplies: 0, event: 0 };
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
    { id: 'first_revenue', key: 'goal.first_revenue', done: state.ledger.some((e) => e.category === 'revenue') },
    {
      id: 'positive_month',
      key: 'goal.positive_month',
      done: monthOfDay(dayOf(state.minute)) > 1 && totalsOf(state.ledger.filter((e) => monthOfDay(entryDay(e)) === 1)).net > 0,
    },
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

// ---------------------------------------------------------------------------
// Phase 3: finance view (pure)
// ---------------------------------------------------------------------------

export const OPEX_CATEGORIES: LedgerCategory[] = ['payroll', 'upkeep', 'food', 'supplies', 'event'];
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
    if (e.category === 'revenue') t.revenue += e.amountSatang;
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

  const streams: RevenueStream[] = ['room_care', 'therapy', 'activity', 'special'];
  const mixMap: Record<RevenueStream, Satang> = { room_care: 0, therapy: 0, activity: 0, special: 0 };
  for (const inv of state.invoices) {
    if (inv.status !== 'paid' || inv.paidAt === null) continue;
    const paidDay = dayOf(inv.paidAt % 1440 === 0 ? inv.paidAt - 1 : inv.paidAt);
    if (period === 'month' && monthOfDay(paidDay) !== month) continue;
    for (const l of inv.lines) mixMap[l.stream] += l.amountSatang;
  }
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
