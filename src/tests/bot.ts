import { applyCommand, step, type Command } from '../sim/engine';
import { freeBeds } from '../domain/rules/beds';
import { choiceBlocker } from '../sim/systems/events';
import { EVENT_DEFS } from '../data/events';
import { dailyRunningCost, nextBillingDay, rosterView } from '../sim/selectors';
import { dayOf } from '../sim/systems/time';
import { SLOT_ORDER } from '../data/staff';
import type { GameState, Rect, ShiftSlot, Skill, StaffRole } from '../domain/types';
import { EQUIPMENT, TILES_PER_BED, roomConstructionCost } from '../data/rooms';
import { chapterDef } from '../data/chapters';
import { monthlyFee } from '../data/finance';
import { thb } from '../domain/money';
import { buildHome } from './helpers';

/**
 * A scripted "sensible player" used by the 30-day playthrough test and balancing.
 * It only uses public commands and the same information the UI shows:
 * builds the starter home, follows the roster's staffing advice using the real applicant pool,
 * admits from the real waiting list, writes care plans and answers every event.
 */

const SKILL_ROLE: Record<Skill, StaffRole> = {
  assessment: 'rn',
  vital_signs: 'pn',
  med_round: 'pn',
  personal_care: 'caregiver',
  feeding: 'caregiver',
  mobility: 'pt',
  activity: 'ot',
  tube_feeding: 'pn',
  airway_care: 'rn',
};

/** Preferred answer per event, falling back to the next choice when blocked. */
const EVENT_PREFS: Record<string, string[]> = {
  resident_change: ['assess', 'refer', 'monitor'],
  staff_resign: ['bonus', 'raise', 'accept'],
  referral: ['accept_beds', 'decline'],
  family_visit: ['standard', 'special', 'postpone'],
};

export interface BotOptions {
  /** Stop admitting once this many residents live in the home. */
  maxResidents?: number;
  /** Start the next chapter after a win and play it (Chapter 2 expansion). */
  campaign?: boolean;
  /** Build as soon as the ward itself is affordable, ignoring the cash runway (a reckless player). */
  eager?: boolean;
  /** Extra cash kept on top of the running costs until billing day (default ฿50,000). */
  reserve?: number;
}

/** Chapter 2 expansion: two more wards on the existing corridor, the first one secured. */
export const EXPANSION: Array<{ rect: Rect; sensor: boolean }> = [
  { rect: { x: 13, y: 4, w: 5, h: 6 }, sensor: true },
  { rect: { x: 5, y: 11, w: 4, h: 6 }, sensor: false },
];

function wardCost(rect: Rect, sensor: boolean): number {
  const beds = Math.floor((rect.w * rect.h) / TILES_PER_BED);
  const fittings = sensor ? EQUIPMENT.door_sensor.costSatang + EQUIPMENT.feeding_pump.costSatang + EQUIPMENT.suction_unit.costSatang : 0;
  return roomConstructionCost('ward', rect) + beds * EQUIPMENT.care_bed.costSatang + EQUIPMENT.call_system.costSatang + fittings;
}

/** Build the next planned ward when cash allows, fully equipped. */
function expand(s: GameState, reserve: number, eager: boolean): GameState {
  const plan = EXPANSION.find((p) => !s.site.rooms.some((r) => r.rect.x === p.rect.x && r.rect.y === p.rect.y));
  if (!plan) return s;
  // Keep enough to pay the bigger home's running costs until the next billing day, plus a cushion.
  const beds = Math.floor((plan.rect.w * plan.rect.h) / TILES_PER_BED);
  const grown = (dailyRunningCost(s) * (s.residents.length + beds)) / Math.max(1, s.residents.length);
  const untilBilling = nextBillingDay(s) - dayOf(s.minute);
  // New residents pay a pro-rated invoice for the rest of the month soon after admission.
  const avgFee = s.residents.reduce((a, r) => a + monthlyFee(r.careLevel, s.priceLevel, r.group), 0) / Math.max(1, s.residents.length);
  const admissions = (beds * avgFee * untilBilling) / 30;
  const need = eager ? wardCost(plan.rect, plan.sensor) : wardCost(plan.rect, plan.sensor) + grown * untilBilling - admissions + reserve;
  if (s.organization.cashSatang < need) return s;
  const out = applyCommand(s, { type: 'placeRoom', roomType: 'ward', rect: plan.rect });
  if (!out.result.ok || !out.result.id) return s;
  let next = out.state;
  const roomId = out.result.id;
  for (let i = 0; i < Math.floor((plan.rect.w * plan.rect.h) / TILES_PER_BED); i++) next = tryCmd(next, { type: 'installEquipment', roomId, equipment: 'care_bed' });
  next = tryCmd(next, { type: 'installEquipment', roomId, equipment: 'call_system' });
  // The first new ward becomes the specialised one: secured, with a feeding pump and suction.
  if (plan.sensor) for (const k of ['door_sensor', 'feeding_pump', 'suction_unit'] as const) next = tryCmd(next, { type: 'installEquipment', roomId, equipment: k });
  return next;
}

function tryCmd(s: GameState, cmd: Command): GameState {
  const out = applyCommand(s, cmd);
  return out.result.ok ? out.state : s;
}

function hireRole(s: GameState, role: StaffRole): [GameState, string | null] {
  const c = s.applicants.find((a) => a.role === role);
  if (!c) return [s, null];
  const out = applyCommand(s, { type: 'hireStaff', candidateId: c.id });
  return out.result.ok && out.result.id ? [out.state, out.result.id] : [s, null];
}

/** Put someone of `role` on `slot`: an unrostered employee first, else hire one. */
function cover(s: GameState, role: StaffRole, slot: ShiftSlot): GameState {
  const rostered = new Set(s.shifts.map((x) => x.employeeId));
  let emp = s.employees.find((e) => e.role === role && !rostered.has(e.id))?.id ?? null;
  if (!emp) [s, emp] = hireRole(s, role);
  return emp ? tryCmd(s, { type: 'assignShift', employeeId: emp, slot }) : s;
}

export function botTurn(state: GameState, opts: BotOptions = {}): GameState {
  let s = state;
  const max = opts.maxResidents ?? Infinity;
  if (opts.campaign && s.chapter.result?.outcome === 'won') s = tryCmd(s, { type: 'startChapter' });
  if (s.chapter.id >= 2) {
    s = expand(s, opts.reserve ?? thb(50_000), opts.eager ?? false);
    const def = chapterDef(s.chapter.id);
    if (def.targetRn && s.employees.filter((e) => e.role === 'rn').length < def.targetRn) s = cover(s, 'rn', 'night');
  }
  if (s.events.active) {
    for (const id of EVENT_PREFS[s.events.active.defId]) {
      if (!EVENT_DEFS[s.events.active.defId].choices.some((c) => c.id === id) || choiceBlocker(s, id)) continue;
      const out = applyCommand(s, { type: 'resolveEvent', choiceId: id });
      if (out.result.ok) {
        s = out.state;
        break;
      }
    }
  }
  // An RN first: nobody can write care plans without one.
  if (!s.employees.some((e) => e.role === 'rn')) s = cover(s, 'rn', 'morning');
  // Admit, referrals first, while beds are free.
  if (s.employees.some((e) => e.role === 'rn')) {
    const queue = [...s.waitlist].sort((a, b) => (a.referralDeadline ?? 1e9) - (b.referralDeadline ?? 1e9));
    for (const c of queue) {
      if (s.residents.length >= max || !freeBeds(s).length) break;
      s = tryCmd(s, { type: 'admitResident', candidateId: c.id });
    }
  }
  for (const r of s.residents) if (!r.carePlan) s = tryCmd(s, { type: 'createCarePlan', residentId: r.id });
  // Follow the roster's advice until every shift is ready and every cell has its headcount.
  for (let guard = 0; guard < 12; guard++) {
    const view = rosterView(s);
    let changed = false;
    for (const slot of SLOT_ORDER) {
      const sum = view.slots.find((x) => x.slot === slot)!;
      const wants: StaffRole[] = [];
      if (sum.missingRn) wants.push('rn');
      for (const k of sum.missingSkills) wants.push(SKILL_ROLE[k]);
      for (const cell of view.cells) if (cell.slot === slot && cell.staff.length < cell.need) wants.push(cell.role);
      for (const role of wants) {
        const next = cover(s, role, slot);
        if (next !== s) {
          s = next;
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
    if (!changed) break;
  }
  return s;
}

export interface PlayResult {
  state: GameState;
  /** Cash at the close of each day. */
  cashByDay: number[];
  minCash: number;
}

/** Build the starter home and play `days` days, taking a turn at 07:00 and 15:00 each day. */
export function playthrough(start: GameState, days = 30, opts: BotOptions = {}): PlayResult {
  let s = buildHome(start);
  s = botTurn(s, opts);
  const endMinute = s.minute - (s.minute % 1440) + days * 1440;
  let minCash = s.organization.cashSatang;
  while (s.minute < endMinute) {
    s = step(s);
    minCash = Math.min(minCash, s.organization.cashSatang);
    const mod = s.minute % 1440;
    if (s.events.active || mod === 7 * 60 || mod === 15 * 60) s = botTurn(s, opts);
  }
  return { state: s, cashByDay: s.history.map((h) => h.cash), minCash };
}
