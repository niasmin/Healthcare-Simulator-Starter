import { applyCommand, step, type Command } from '../sim/engine';
import { freeBeds } from '../domain/rules/beds';
import { choiceBlocker } from '../sim/systems/events';
import { EVENT_DEFS } from '../data/events';
import { dailyRunningCost, nextBillingDay, rosterView } from '../sim/selectors';
import { dayOf } from '../sim/systems/time';
import { SLOT_ORDER } from '../data/staff';
import type { CourseId, GameState, Rect, ShiftSlot, Skill, StaffRole } from '../domain/types';
import { EQUIPMENT, TILES_PER_BED, roomConstructionCost } from '../data/rooms';
import { chapterDef, EXPANDED_WIDTH, LAND_PRICE } from '../data/chapters';
import { DECOR, MAX_APPEAL, gardenAppeal } from '../data/decor';
import { monthlyFee } from '../data/finance';
import { thb } from '../domain/money';
import { buildHome } from './helpers';
import { prefabCost, prefabDef } from '../data/prefabs';
import { freeStrokeBeds } from '../sim/systems/hospital';
import { COURSES } from '../data/workforce';
import { certifiedCount, isCertified, placementBlocker, trainingBlocker, trainingSeats } from '../sim/systems/workforce';

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
  consult: 'doctor',
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

/** Chapter 3–4 layout on the new land: the row-10 corridor runs east; villas, the Home Care centre and a garden. */
export const NEW_LAND = {
  corridor: { x: 18, y: 10, w: 14, h: 1 } as Rect,
  villas: [20, 23, 26, 29].map((x) => ({ x, y: 7, w: 3, h: 3 }) as Rect).concat([20, 23].map((x) => ({ x, y: 11, w: 3, h: 3 }) as Rect)),
  office: { x: 26, y: 11, w: 4, h: 3 } as Rect,
  /** Garden cells, best spots first. */
  garden: Array.from({ length: 5 * 12 }, (_, i) => ({ x: 20 + (i % 12), y: 14 + Math.floor(i / 12) })),
};
const VILLA_COST = roomConstructionCost('villa', NEW_LAND.villas[0]) + EQUIPMENT.care_bed.costSatang + EQUIPMENT.call_system.costSatang + EQUIPMENT.rest_sofa.costSatang;

/** Cash a careful player keeps: running costs until the next billing day plus a cushion. */
function runwayNeed(s: GameState, cushion: number): number {
  return dailyRunningCost(s) * (nextBillingDay(s) - dayOf(s.minute)) + cushion;
}

/** Chapter 3: buy the land, lay the corridor, build villas one by one, then garden up. */
function tranquila(s: GameState, reserve: number): GameState {
  const def = chapterDef(s.chapter.id);
  if (s.site.width < EXPANDED_WIDTH) {
    if (s.organization.cashSatang < LAND_PRICE + runwayNeed(s, reserve)) return s;
    s = tryCmd(s, { type: 'expandLot' });
    s = tryCmd(s, { type: 'paintCorridor', rect: NEW_LAND.corridor });
  }
  // Garden first, a little at a time: premium families judge the grounds.
  for (const type of ['gazebo', 'fountain', 'umbrella'] as const) {
    while (gardenAppeal(s.site.decor) < MAX_APPEAL && s.organization.cashSatang > DECOR[type].costSatang + runwayNeed(s, reserve)) {
      const cell = NEW_LAND.garden.find((c) => !s.site.decor.some((d) => d.cell.x === c.x && d.cell.y === c.y));
      if (!cell) break;
      const next = tryCmd(s, { type: 'placeDecor', decor: type, cell });
      if (next === s) break;
      s = next;
    }
  }
  const built = s.site.rooms.filter((r) => r.type === 'villa').length;
  const plan = NEW_LAND.villas[built];
  if (plan && built < (def.targetPremium ?? 6) && s.organization.cashSatang >= VILLA_COST + runwayNeed(s, reserve)) {
    const out = applyCommand(s, { type: 'placeRoom', roomType: 'villa', rect: plan });
    if (out.result.ok && out.result.id) {
      s = out.state;
      for (const k of ['care_bed', 'call_system', 'rest_sofa'] as const) s = tryCmd(s, { type: 'installEquipment', roomId: out.result.id, equipment: k });
    }
  }
  return s;
}

/** Chapter 4: open the Home Care centre, add vans as clients grow, accept enquiries the vans can serve. */
function homeCare(s: GameState, reserve: number): GameState {
  const def = chapterDef(s.chapter.id);
  let office = s.site.rooms.find((r) => r.type === 'homecare_office');
  if (!office) {
    const cost = roomConstructionCost('homecare_office', NEW_LAND.office) + EQUIPMENT.nurse_desk.costSatang + EQUIPMENT.care_van.costSatang;
    if (s.organization.cashSatang < cost + runwayNeed(s, reserve)) return s;
    const out = applyCommand(s, { type: 'placeRoom', roomType: 'homecare_office', rect: NEW_LAND.office });
    if (!out.result.ok || !out.result.id) return s;
    s = tryCmd(tryCmd(out.state, { type: 'installEquipment', roomId: out.result.id, equipment: 'nurse_desk' }), { type: 'installEquipment', roomId: out.result.id, equipment: 'care_van' });
    office = s.site.rooms.find((r) => r.type === 'homecare_office')!;
  }
  const vans = office.equipment.care_van ?? 0;
  const target = (def.targetClients ?? 12) + 2;
  if (s.homecare.clients.length >= vans * VISITS_PER_VAN - 1 && s.organization.cashSatang > EQUIPMENT.care_van.costSatang + runwayNeed(s, reserve)) s = tryCmd(s, { type: 'installEquipment', roomId: office.id, equipment: 'care_van' });
  const capacity = (s.site.rooms.find((r) => r.id === office!.id)!.equipment.care_van ?? 0) * VISITS_PER_VAN;
  for (const lead of [...s.homecare.leads]) {
    if (s.homecare.clients.length >= Math.min(target, capacity)) break;
    s = tryCmd(s, { type: 'admitClient', leadId: lead.id });
  }
  return s;
}
/** Chapter 5: the training room sits beside the Home Care centre, on the row-10 corridor. */
export const TRAINING_ROOM = { x: 30, y: 11 };
/** Contracts the bot runs at once, and the most extra staff it keeps for placements. */
const MAX_CONTRACTS = 4;
const MAX_POOL = 7;

/** Staff kept off the roster for training and placements: certified, in class, or placed. */
function reserved(s: GameState, id: string): boolean {
  const e = s.employees.find((x) => x.id === id);
  return !!e && (!!e.placement || isCertified(e) || s.workforce.training.some((t) => t.employeeId === id));
}

/** Chapter 5: open a training room, certify a pool of extra staff, and place them with partners. */
function workforce(s: GameState, reserve: number): GameState {
  const def = chapterDef(s.chapter.id);
  if (!s.site.rooms.some((r) => r.type === 'training_room')) {
    const pf = prefabDef('training')!;
    if (s.organization.cashSatang < prefabCost(pf) + runwayNeed(s, reserve)) return s;
    s = tryCmd(s, { type: 'placePrefab', prefab: 'training', origin: TRAINING_ROOM });
  }
  const free = () => s.employees.filter((e) => !e.placement && !s.shifts.some((x) => x.employeeId === e.id) && !s.workforce.training.some((t) => t.employeeId === e.id));
  const pool = () => s.employees.filter((e) => !s.shifts.some((x) => x.employeeId === e.id)).length;
  const train = (role: StaffRole, course: CourseId): void => {
    if (s.organization.cashSatang < COURSES[course].costSatang + runwayNeed(s, reserve)) return;
    let trainee = free().find((e) => e.role === role && trainingBlocker(s, e.id, course) === null)?.id ?? null;
    if (!trainee && pool() < MAX_POOL && s.workforce.training.length < trainingSeats(s)) [s, trainee] = hireRole(s, role);
    if (trainee) s = tryCmd(s, { type: 'startTraining', employeeId: trainee, course });
  };
  for (const o of [...s.workforce.offers].sort((a, b) => a.expiresDay - b.expiresDay)) {
    if (s.workforce.contracts.length >= MAX_CONTRACTS) break;
    let who = free().find((e) => placementBlocker(s, o.id, e.id) === null)?.id ?? null;
    if (!who && !o.cert && pool() < MAX_POOL) [s, who] = hireRole(s, o.role);
    if (who) s = tryCmd(s, { type: 'acceptOffer', offerId: o.id, employeeId: who });
    else if (o.cert) train(o.role, o.cert);
  }
  // Work towards the certification target with the pool: caregivers first, then practical nurses.
  if (certifiedCount(s) + s.workforce.training.length < (def.targetCertified ?? 0) && s.workforce.training.length < trainingSeats(s)) {
    const caregivers = s.employees.filter((e) => e.role === 'caregiver' && isCertified(e)).length;
    if (caregivers < 4) train('caregiver', 'care_cert');
    else train('pn', 'airway_cert');
  }
  return s;
}

/** Chapter 6: the clinic opens onto the row-10 corridor; the stroke unit sits beside the spine. */
export const HOSPITAL = { clinic: { x: 14, y: 11 }, stroke: { x: 10, y: 13 } };

/** Chapter 6: build the clinic, then the stroke unit, and admit every referral a bed allows. */
function hospital(s: GameState, reserve: number): GameState {
  for (const [type, prefab, origin] of [['neuro_clinic', 'clinic', HOSPITAL.clinic], ['stroke_unit', 'stroke', HOSPITAL.stroke]] as const) {
    if (s.site.rooms.some((r) => r.type === type)) continue;
    if (s.organization.cashSatang < prefabCost(prefabDef(prefab)!) + runwayNeed(s, reserve)) return s;
    s = tryCmd(s, { type: 'placePrefab', prefab, origin });
  }
  for (const r of [...s.hospital.referrals]) {
    if (!freeStrokeBeds(s).length) break;
    s = tryCmd(s, { type: 'admitInpatient', referralId: r.id });
  }
  return s;
}

/** Visits one van can make in a morning (appointments 08:00–13:00, 100 minutes each). */
const VISITS_PER_VAN = 4;

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
  let emp = s.employees.find((e) => e.role === role && !rostered.has(e.id) && !reserved(s, e.id))?.id ?? null;
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
  if (s.chapter.id >= 3) s = tranquila(s, opts.reserve ?? thb(50_000));
  if (s.chapter.id >= 4) s = homeCare(s, opts.reserve ?? thb(50_000));
  if (s.chapter.id >= 5) s = workforce(s, opts.reserve ?? thb(50_000));
  if (s.chapter.id >= 6) s = hospital(s, opts.reserve ?? thb(50_000));
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
      if (s.residents.length >= max) break;
      if (!freeBeds(s, c.group, !!c.premium).length) continue;
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
