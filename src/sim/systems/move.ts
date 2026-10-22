import { MOVE_FEE_PERCENT, roomConstructionCost } from '../../data/rooms';
import { pctOf } from '../../domain/money';
import { FACINGS } from '../../domain/rules/navigation';
import { validateRoomPlacement, type PlacementCheck } from '../../domain/rules/placement';
import type { Cell, Facing, GameState, Rect, Room } from '../../domain/types';
import { log, post } from '../helpers';

/**
 * Moving and turning buildings. A building keeps its id, equipment, residents (beds are keyed by
 * the room id) and name; only its footprint and the side its door faces change. Moving or
 * turning the footprint costs a fee (a share of the building's construction cost, fictional);
 * turning a square building only moves its door, which is free.
 */
export function moveFee(room: Room): number {
  return pctOf(roomConstructionCost(room.type, room.rect), MOVE_FEE_PERCENT);
}

const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** Check a new footprint for a building, as if the building were not where it is now. */
export function moveCheck(state: GameState, roomId: string, rect: Rect): PlacementCheck {
  const room = state.site.rooms.find((r) => r.id === roomId);
  if (!room) return { ok: false, reason: 'not_found', costSatang: 0 };
  const turned = rect.w === room.rect.h && rect.h === room.rect.w;
  if (!(rect.w === room.rect.w && rect.h === room.rect.h) && !turned) return { ok: false, reason: 'invalid_choice', costSatang: 0 };
  const fee = sameRect(rect, room.rect) ? 0 : moveFee(room);
  // Lift the building off the lot (and lend it the fee's worth of cash) to reuse the build check.
  const lifted: GameState = {
    ...state,
    organization: { ...state.organization, cashSatang: Number.MAX_SAFE_INTEGER },
    site: { ...state.site, rooms: state.site.rooms.filter((r) => r.id !== roomId) },
  };
  const check = validateRoomPlacement(lifted, room.type, rect);
  if (!check.ok) return { ...check, costSatang: fee };
  if (state.organization.cashSatang < fee) return { ok: false, reason: 'insufficient_funds', costSatang: fee };
  return { ok: true, costSatang: fee, cells: check.cells };
}

/** Footprint at `origin` (its top-left tile), turned a quarter if `rotated`. */
export function movedRect(room: Room, origin: Cell, rotated = false): Rect {
  return { x: origin.x, y: origin.y, w: rotated ? room.rect.h : room.rect.w, h: rotated ? room.rect.w : room.rect.h };
}

/** The side the door ends up on after `turns` quarter turns (1 = clockwise on the map, -1 = back). */
export function turnFacing(facing: Facing | undefined, turns: number): Facing {
  // Clockwise on the grid: bottom -> left -> top -> right.
  const ring: Facing[] = ['s', 'w', 'n', 'e'];
  const i = ring.indexOf(facing ?? 's');
  return ring[(((i + turns) % 4) + 4) % 4];
}

/**
 * A quarter turn in place: the footprint turns about its centre (so turning four times comes back
 * to the start) and the door moves round with it.
 */
export function turnedPlacement(room: Room, turns: 1 | -1): { rect: Rect; facing: Facing } {
  const { x, y, w, h } = room.rect;
  const d = Math.trunc((w - h) / 2);
  return { rect: { x: x + d, y: y - d, w: h, h: w }, facing: turnFacing(room.facing, turns) };
}

export function placeMovedRoom(state: GameState, roomId: string, rect: Rect, facing: Facing | undefined, fee: number): GameState {
  const room = state.site.rooms.find((r) => r.id === roomId)!;
  const moved: Room = { ...room, rect: { ...rect }, ...(facing ? { facing } : {}) };
  let s: GameState = { ...state, site: { ...state.site, rooms: state.site.rooms.map((r) => (r.id === roomId ? moved : r)) } };
  if (fee > 0) s = post(s, -fee, 'construction', 'ledger.move_room', { ref: roomId, memoParams: { room: room.type } });
  return log(s, 'info', sameRect(rect, room.rect) ? 'log.room_turned' : 'log.room_moved', { room: room.type });
}

export const isFacing = (f: unknown): f is Facing => FACINGS.includes(f as Facing);
