import { CORRIDOR_COST_PER_TILE, EQUIPMENT, REFUND_PERCENT, ROOMS, equipmentSlot, roomConstructionCost } from '../data/rooms';
import { cellIndex, inBounds, rectContains } from '../domain/grid';
import { pctOf } from '../domain/money';
import { validateCorridor, validateRoomPlacement } from '../domain/rules/placement';
import { equipmentCount } from '../domain/rules/rooms';
import type { Cell, CommandResult, EquipmentId, GameSpeed, GameState, Rect, Room, RoomType } from '../domain/types';
import { MINUTES_PER_DAY } from './constants';
import { allocId, log, post } from './helpers';
import { chargeDailyUpkeep } from './systems/finance';
import { advanceClock, schedule } from './systems/time';

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
  | { type: 'removeEquipment'; roomId: string; equipment: EquipmentId };

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
      const refund = pctOf(EQUIPMENT[cmd.equipment].costSatang, REFUND_PERCENT);
      let s = replaceRoom(state, { ...room, equipment });
      s = post(s, refund, 'refund', 'ledger.refund_equipment', { ref: room.id, memoParams: { equipment: cmd.equipment } });
      return { state: s, result: { ok: true, costSatang: -refund } };
    }
  }
}

/** Advance the simulation by exactly one 10-minute tick. Pure and deterministic. */
export function step(state: GameState): GameState {
  const advanced = advanceClock(state);
  let s = advanced.state;
  for (const ev of advanced.due) {
    switch (ev.kind) {
      case 'day_end': {
        s = chargeDailyUpkeep(s);
        s = schedule(s, ev.at + MINUTES_PER_DAY, 'day_end');
        break;
      }
    }
  }
  return s;
}

export function advance(state: GameState, ticks: number): GameState {
  let s = state;
  for (let i = 0; i < ticks; i++) s = step(s);
  return s;
}

/** Room types are re-exported for UI convenience. */
export { ROOMS };
