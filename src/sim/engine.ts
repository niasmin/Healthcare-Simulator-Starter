import { CORRIDOR_COST_PER_TILE, EQUIPMENT, REFUND_PERCENT, ROOMS, equipmentSlot, roomConstructionCost } from '../data/rooms';
import { cellIndex, inBounds, rectContains } from '../domain/grid';
import { pctOf } from '../domain/money';
import { validateCorridor, validateDecor, validateRoomPlacement } from '../domain/rules/placement';
import { DECOR } from '../data/decor';
import { equipmentCount } from '../domain/rules/rooms';
import { SHIFT_SLOTS } from '../data/staff';
import { freeBeds, parseBedId, residentsInRoom } from '../domain/rules/beds';
import { roomStatus } from '../domain/rules/rooms';
import { validateShift } from '../domain/rules/shifts';
import type { Cell, CommandResult, DayStats, DecorType, EquipmentId, GameSpeed, GameState, PriceLevel, Rect, Resident, Room, RoomType, ShiftSlot } from '../domain/types';
import { dayInMonth, monthOfDay, PRICE_LEVELS } from '../data/finance';
import { billAdmission, billFinal, billMonth, chargeDailyResidentCosts, collectPayments, refundUnusedDays } from './systems/billing';
import { eventCheck, eventExpiryTick, expireReferrals, resolveEvent } from './systems/events';
import { MINUTES_PER_DAY } from './constants';
import { allocId, log, post, randInt } from './helpers';
import { careTick, generateAllTasksForDay, generateTasksForDay, pruneTasks } from './systems/care';
import { chargeDailyPayroll, chargeDailyUpkeep } from './systems/finance';
import { needsTick, wellbeing } from './systems/needs';
import { hireFromCandidate, refreshCandidates, removeEmployee, staffEnergyTick, staffMoraleDaily } from './systems/staffing';
import { advanceClock, dayOf, schedule } from './systems/time';
import { summarizeBeds } from './bedsSummary';
import { judgeChapter } from './systems/chapter';

/**
 * Commands are the ONLY way the UI changes game state.
 * applyCommand is pure: same state + command => same result.
 */
export type Command =
  | { type: 'setSpeed'; speed: GameSpeed }
  | { type: 'placeRoom'; roomType: RoomType; rect: Rect }
  | { type: 'paintCorridor'; rect: Rect }
  | { type: 'bulldoze'; cell: Cell }
  | { type: 'deleteRoom'; roomId: string }
  | { type: 'installEquipment'; roomId: string; equipment: EquipmentId }
  | { type: 'removeEquipment'; roomId: string; equipment: EquipmentId }
  | { type: 'hireStaff'; candidateId: string }
  | { type: 'dismissStaff'; employeeId: string }
  | { type: 'assignShift'; employeeId: string; slot: ShiftSlot }
  | { type: 'unassignShift'; employeeId: string; slot: ShiftSlot }
  | { type: 'admitResident'; candidateId: string }
  | { type: 'dischargeResident'; residentId: string }
  | { type: 'createCarePlan'; residentId: string }
  | { type: 'setPriceLevel'; level: PriceLevel }
  | { type: 'placeDecor'; decor: DecorType; cell: Cell }
  | { type: 'resolveEvent'; choiceId: string };

export interface CommandOutcome {
  state: GameState;
  result: CommandResult;
}

const SPEEDS: GameSpeed[] = [0, 1, 2, 4];

function fail(state: GameState, reason: Extract<CommandResult, { ok: false }>['reason'], params?: Record<string, string | number>): CommandOutcome {
  return { state, result: { ok: false, reason, ...(params ? { params } : {}) } };
}

function replaceRoom(state: GameState, room: Room): GameState {
  return { ...state, site: { ...state.site, rooms: state.site.rooms.map((r) => (r.id === room.id ? room : r)) } };
}

function deleteRoom(state: GameState, roomId: string): CommandOutcome {
  const room = state.site.rooms.find((r) => r.id === roomId);
  if (!room) return fail(state, 'not_found');
  if (residentsInRoom(state, roomId).length > 0) return fail(state, 'room_occupied');
  let equipmentValue = 0;
  for (const [id, n] of Object.entries(room.equipment) as [EquipmentId, number][]) equipmentValue += EQUIPMENT[id].costSatang * n;
  const refund = pctOf(roomConstructionCost(room.type, room.rect) + equipmentValue, REFUND_PERCENT);
  let s: GameState = { ...state, site: { ...state.site, rooms: state.site.rooms.filter((r) => r.id !== roomId) } };
  if (refund > 0) s = post(s, refund, 'refund', 'ledger.refund_room', { ref: roomId, memoParams: { room: room.type } });
  s = log(s, 'info', 'log.room_demolished', { room: room.type });
  return { state: s, result: { ok: true, id: roomId, costSatang: -refund } };
}

export function applyCommand(state: GameState, cmd: Command): CommandOutcome {
  switch (cmd.type) {
    case 'setSpeed': {
      if (!SPEEDS.includes(cmd.speed)) return fail(state, 'invalid_speed');
      return { state: { ...state, speed: cmd.speed }, result: { ok: true } };
    }

    case 'placeRoom': {
      const check = validateRoomPlacement(state, cmd.roomType, cmd.rect);
      if (!check.ok) return fail(state, check.reason, check.params);
      let [s, id] = allocId(state, 'room');
      const room: Room = { id, type: cmd.roomType, rect: { ...cmd.rect }, equipment: {}, builtAt: s.minute };
      s = { ...s, site: { ...s.site, rooms: [...s.site.rooms, room] } };
      s = post(s, -check.costSatang, 'construction', 'ledger.construction_room', { ref: id, memoParams: { room: cmd.roomType } });
      s = log(s, 'good', 'log.room_built', { room: cmd.roomType });
      return { state: s, result: { ok: true, id, costSatang: check.costSatang } };
    }

    case 'paintCorridor': {
      const check = validateCorridor(state, cmd.rect);
      if (!check.ok) return fail(state, check.reason, check.params);
      const corridor = [...state.site.corridor];
      for (const c of check.cells) corridor[cellIndex(c.x, c.y, state.site.width)] = 1;
      let s: GameState = { ...state, site: { ...state.site, corridor } };
      s = post(s, -check.costSatang, 'construction', 'ledger.construction_corridor', { memoParams: { tiles: check.cells.length } });
      return { state: s, result: { ok: true, costSatang: check.costSatang } };
    }

    case 'deleteRoom':
      return deleteRoom(state, cmd.roomId);

    case 'bulldoze': {
      const { cell } = cmd;
      const { site } = state;
      if (!inBounds(cell.x, cell.y, site.width, site.height)) return fail(state, 'out_of_bounds');
      const room = site.rooms.find((r) => rectContains(r.rect, cell));
      if (room) return deleteRoom(state, room.id);
      const decor = site.decor.find((d) => d.cell.x === cell.x && d.cell.y === cell.y);
      if (decor) {
        const refund = pctOf(DECOR[decor.type].costSatang, REFUND_PERCENT);
        let s: GameState = { ...state, site: { ...site, decor: site.decor.filter((d) => d.id !== decor.id) } };
        s = post(s, refund, 'refund', 'ledger.refund_decor', { ref: decor.id, memoParams: { decor: decor.type } });
        return { state: s, result: { ok: true, costSatang: -refund } };
      }
      if (cell.x === site.entrance.x && cell.y === site.entrance.y) return fail(state, 'cannot_remove_entrance');
      const idx = cellIndex(cell.x, cell.y, site.width);
      if (!site.corridor[idx]) return fail(state, 'not_found');
      const corridor = [...site.corridor];
      corridor[idx] = 0;
      const refund = pctOf(CORRIDOR_COST_PER_TILE, REFUND_PERCENT);
      let s: GameState = { ...state, site: { ...site, corridor } };
      s = post(s, refund, 'refund', 'ledger.refund_corridor');
      return { state: s, result: { ok: true, costSatang: -refund } };
    }

    case 'installEquipment': {
      const room = state.site.rooms.find((r) => r.id === cmd.roomId);
      if (!room) return fail(state, 'not_found');
      const slot = equipmentSlot(room.type, cmd.equipment);
      if (!slot) return fail(state, 'equipment_not_allowed');
      const have = equipmentCount(room, cmd.equipment);
      const max = slot.max(room.rect);
      if (have >= max) return fail(state, 'equipment_limit', { max });
      const cost = EQUIPMENT[cmd.equipment].costSatang;
      if (state.organization.cashSatang < cost) return fail(state, 'insufficient_funds');
      let s = replaceRoom(state, { ...room, equipment: { ...room.equipment, [cmd.equipment]: have + 1 } });
      s = post(s, -cost, 'equipment', 'ledger.equipment', { ref: room.id, memoParams: { equipment: cmd.equipment } });
      return { state: s, result: { ok: true, costSatang: cost } };
    }

    case 'removeEquipment': {
      const room = state.site.rooms.find((r) => r.id === cmd.roomId);
      if (!room) return fail(state, 'not_found');
      const have = equipmentCount(room, cmd.equipment);
      if (have <= 0) return fail(state, 'equipment_none');
      const equipment = { ...room.equipment, [cmd.equipment]: have - 1 };
      if (equipment[cmd.equipment] === 0) delete equipment[cmd.equipment];
      // Unique-bed invariant: never remove a bed someone sleeps in, never close an occupied ward.
      const occupants = residentsInRoom(state, room.id);
      if (occupants.length) {
        if (cmd.equipment === 'care_bed' && occupants.some((r) => parseBedId(r.bedId).index >= have - 1)) return fail(state, 'bed_occupied');
        const after = roomStatus({ ...room, equipment }, state.site);
        if (after.issues.some((i) => i.kind === 'missing_equipment')) return fail(state, 'room_occupied');
      }
      const refund = pctOf(EQUIPMENT[cmd.equipment].costSatang, REFUND_PERCENT);
      let s = replaceRoom(state, { ...room, equipment });
      s = post(s, refund, 'refund', 'ledger.refund_equipment', { ref: room.id, memoParams: { equipment: cmd.equipment } });
      return { state: s, result: { ok: true, costSatang: -refund } };
    }

    case 'hireStaff': {
      const c = state.applicants.find((a) => a.id === cmd.candidateId);
      if (!c) return fail(state, 'not_found');
      let [s, id] = allocId(state, 'emp');
      s = { ...s, applicants: s.applicants.filter((a) => a.id !== c.id), employees: [...s.employees, hireFromCandidate(c, id, s.minute)] };
      s = log(s, 'good', 'log.hired', { name: c.name.th, nameEn: c.name.en, role: c.role });
      return { state: s, result: { ok: true, id } };
    }

    case 'dismissStaff': {
      const e = state.employees.find((x) => x.id === cmd.employeeId);
      if (!e) return fail(state, 'not_found');
      // Shifts go, and any task in progress returns to the queue for someone else.
      let s = removeEmployee(state, e.id);
      s = log(s, 'info', 'log.dismissed', { name: e.name.th, nameEn: e.name.en, role: e.role });
      return { state: s, result: { ok: true } };
    }

    case 'assignShift': {
      const w = SHIFT_SLOTS[cmd.slot];
      const check = validateShift(state, cmd.employeeId, w);
      if (!check.ok) return fail(state, check.reason);
      let [s, id] = allocId(state, 'shift');
      s = { ...s, shifts: [...s.shifts, { id, employeeId: cmd.employeeId, siteId: s.site.id, slot: cmd.slot, start: w.start, end: w.end }] };
      return { state: s, result: { ok: true, id } };
    }

    case 'unassignShift': {
      const sh = state.shifts.find((x) => x.employeeId === cmd.employeeId && x.slot === cmd.slot);
      if (!sh) return fail(state, 'not_found');
      return { state: { ...state, shifts: state.shifts.filter((x) => x.id !== sh.id) }, result: { ok: true } };
    }

    case 'admitResident': {
      const c = state.waitlist.find((x) => x.id === cmd.candidateId);
      if (!c) return fail(state, 'not_found');
      const bed = freeBeds(state)[0];
      if (!bed) return fail(state, 'no_free_bed');
      let [s, id] = allocId(state, 'res');
      const resident: Resident = { id, name: c.name, age: c.age, group: c.group, careLevel: c.careLevel, needs: { ...c.needs }, bedId: bed, admittedAt: s.minute, carePlan: null };
      s = { ...s, waitlist: s.waitlist.filter((x) => x.id !== c.id), residents: [...s.residents, resident] };
      s = billAdmission(s, resident);
      s = log(s, 'good', 'log.admitted', { name: c.name.th, nameEn: c.name.en });
      return { state: s, result: { ok: true, id } };
    }

    case 'dischargeResident': {
      const r = state.residents.find((x) => x.id === cmd.residentId);
      if (!r) return fail(state, 'not_found');
      let s = removeResident(state, r);
      s = log(s, 'info', 'log.discharged', { name: r.name.th, nameEn: r.name.en });
      return { state: s, result: { ok: true } };
    }

    case 'createCarePlan': {
      const r = state.residents.find((x) => x.id === cmd.residentId);
      if (!r) return fail(state, 'not_found');
      if (r.carePlan) return fail(state, 'plan_exists');
      // Only an assessment-qualified employee (RN) can write a care plan.
      const author = state.employees.filter((e) => e.skills.includes('assessment')).sort((a, b) => (a.id < b.id ? -1 : 1))[0];
      if (!author) return fail(state, 'no_assessor');
      const updated: Resident = { ...r, carePlan: { createdAt: state.minute, authorId: author.id } };
      let s: GameState = { ...state, residents: state.residents.map((x) => (x.id === r.id ? updated : x)) };
      const dayStart = Math.floor(s.minute / MINUTES_PER_DAY) * MINUTES_PER_DAY;
      s = generateTasksForDay(s, updated, dayStart, s.minute);
      s = log(s, 'good', 'log.care_plan', { name: r.name.th, nameEn: r.name.en });
      return { state: s, result: { ok: true } };
    }

    case 'setPriceLevel': {
      if (!PRICE_LEVELS.includes(cmd.level)) return fail(state, 'invalid_choice');
      return { state: { ...state, priceLevel: cmd.level }, result: { ok: true } };
    }

    case 'resolveEvent':
      return resolveEvent(state, cmd.choiceId);

    case 'placeDecor': {
      if (!DECOR[cmd.decor]) return fail(state, 'invalid_choice');
      const check = validateDecor(state, cmd.decor, cmd.cell);
      if (!check.ok) return fail(state, check.reason, check.params);
      let [s, id] = allocId(state, 'decor');
      s = { ...s, site: { ...s.site, decor: [...s.site.decor, { id, type: cmd.decor, cell: { ...cmd.cell } }] } };
      s = post(s, -check.costSatang, 'construction', 'ledger.decor', { ref: id, memoParams: { decor: cmd.decor } });
      return { state: s, result: { ok: true, id, costSatang: check.costSatang } };
    }
  }
}

/** Move a resident out: free their bed and pending care, release busy staff, issue the final bill. */
function removeResident(state: GameState, r: Resident): GameState {
  const busy = new Set(state.tasks.filter((t) => t.residentId === r.id && t.status === 'in_progress').map((t) => t.assigneeId));
  const s: GameState = {
    ...state,
    residents: state.residents.filter((x) => x.id !== r.id),
    tasks: state.tasks.filter((t) => t.residentId !== r.id || t.status === 'done' || t.status === 'missed'),
    employees: state.employees.map((e) => (busy.has(e.id) ? { ...e, taskId: null, busyUntil: state.minute } : e)),
  };
  return refundUnusedDays(billFinal(s, r), r);
}

/** Each missed care task costs this much reputation at day end (capped per day). */
export const MISSED_TASK_REP = 0.08;
export const MAX_MISSED_REP_PENALTY = 3;
/** Below this satisfaction a family may move their relative out. */
export const WITHDRAW_SATISFACTION = 40;
/** Daily chance (percent) per point of satisfaction below the threshold. */
export const WITHDRAW_CHANCE_PER_POINT = 1.5;
export const withdrawChance = (satisfaction: number) => Math.min(60, Math.ceil((WITHDRAW_SATISFACTION - satisfaction) * WITHDRAW_CHANCE_PER_POINT));

/** Ordinary turnover: after this many days, a family may take their relative home (per-mille per day). */
export const NATURAL_LEAVE_AFTER_DAYS = 7;
export const NATURAL_LEAVE_PER_MILLE = 4;

/**
 * Residents leave at day end (one seeded roll each):
 * - families of very unhappy residents move them elsewhere (costs reputation);
 * - otherwise, after a settling-in week, a family occasionally takes their relative home.
 * Turnover means beds must be refilled, which is where reputation (enquiries) matters.
 */
function residentDepartures(state: GameState): GameState {
  let s = state;
  for (const r of state.residents) {
    const unhappy = r.needs.satisfaction < WITHDRAW_SATISFACTION;
    const settled = state.minute - r.admittedAt >= NATURAL_LEAVE_AFTER_DAYS * MINUTES_PER_DAY;
    if (!unhappy && !settled) continue;
    let roll: number;
    [s, roll] = randInt(s, 1, 1000);
    if (unhappy && roll <= withdrawChance(r.needs.satisfaction) * 10) {
      s = removeResident(s, r);
      s = { ...s, organization: { ...s.organization, reputation: Math.max(0, Math.round((s.organization.reputation - 2) * 10) / 10) } };
      s = log(s, 'warn', 'log.withdrawn', { name: r.name.th, nameEn: r.name.en });
    } else if (settled && roll > 1000 - NATURAL_LEAVE_PER_MILLE) {
      s = removeResident(s, r);
      s = log(s, 'info', 'log.went_home', { name: r.name.th, nameEn: r.name.en });
    }
  }
  return s;
}

function closeDay(state: GameState): GameState {
  const beds = summarizeBeds(state);
  const n = state.residents.length;
  const wb = n ? Math.round((state.residents.reduce((a, r) => a + wellbeing(r.needs), 0) / n) * 10) / 10 : -1;
  const sat = n ? Math.round((state.residents.reduce((a, r) => a + r.needs.satisfaction, 0) / n) * 10) / 10 : -1;
  const stat: DayStats = {
    day: dayOf(state.minute - 1),
    done: state.today.done,
    missed: state.today.missed,
    wellbeing: wb,
    residents: n,
    beds,
    cash: state.organization.cashSatang,
    satisfaction: sat,
  };
  const history = [...state.history, stat].slice(-60);
  // Reputation drifts with resident satisfaction, and missed care is noticed by families.
  let reputation = state.organization.reputation;
  if (n) {
    const sat = state.residents.reduce((a, r) => a + r.needs.satisfaction, 0) / n;
    const missedPenalty = Math.min(MAX_MISSED_REP_PENALTY, state.today.missed * MISSED_TASK_REP);
    reputation = Math.max(0, Math.min(100, Math.round((reputation + (sat - 60) / 15 - missedPenalty) * 10) / 10));
  }
  return { ...state, history, today: { done: 0, missed: 0 }, organization: { ...state.organization, reputation } };
}

/** Advance the simulation by exactly one 10-minute tick. Pure and deterministic. */
export function step(state: GameState): GameState {
  const advanced = advanceClock(state);
  let s = advanced.state;
  for (const ev of advanced.due) {
    switch (ev.kind) {
      case 'day_end': {
        const closingDay = dayOf(ev.at - 1);
        s = chargeDailyUpkeep(s);
        s = chargeDailyPayroll(s);
        s = chargeDailyResidentCosts(s);
        s = collectPayments(s, closingDay);
        s = expireReferrals(s, closingDay);
        s = closeDay(s);
        s = residentDepartures(s);
        s = judgeChapter(s, closingDay);
        // The new day starts: bill the month in advance on its first day.
        const newDay = closingDay + 1;
        if (dayInMonth(newDay) === 1) s = billMonth(s, monthOfDay(newDay));
        s = staffMoraleDaily(s);
        s = pruneTasks(s);
        s = generateAllTasksForDay(s, ev.at);
        s = refreshCandidates(s);
        s = schedule(s, ev.at + MINUTES_PER_DAY, 'day_end');
        break;
      }
      case 'event_check': {
        s = eventCheck(s);
        s = schedule(s, ev.at + MINUTES_PER_DAY, 'event_check');
        break;
      }
    }
  }
  s = eventExpiryTick(s);
  s = careTick(s);
  s = needsTick(s);
  s = staffEnergyTick(s);
  return s;
}

export function advance(state: GameState, ticks: number): GameState {
  let s = state;
  for (let i = 0; i < ticks; i++) s = step(s);
  return s;
}

/** Room types are re-exported for UI convenience. */
export { ROOMS };
