import { BED_ROOMS, DOOR_FEE_PERCENT, MOVE_FEE_PERCENT, WORKS_BASE_MINUTES, WORKS_MINUTES_PER_TILE, roomConstructionCost } from '../../data/rooms';
import { rectArea } from '../../domain/grid';
import { pctOf } from '../../domain/money';
import { residentsInRoom } from '../../domain/rules/beds';
import { FACINGS } from '../../domain/rules/navigation';
import { validateRoomPlacement, type PlacementCheck } from '../../domain/rules/placement';
import type { Cell, Facing, GameState, ReasonCode, Rect, Room } from '../../domain/types';
import { log, post } from '../helpers';

/**
 * Moving and turning buildings, as building works. A building keeps its id, equipment and name;
 * a move or a turn of the footprint costs a share of its construction cost and closes it while
 * the builders work (longer for bigger buildings). Residents cannot stay in a building being
 * moved, so a ward or villa must be empty first. Moving only the door is a small job: a smaller
 * fee, done at once, and the building stays open. All costs and times are fictional.
 */
export function moveFee(room: Room): number {
  return pctOf(roomConstructionCost(room.type, room.rect), MOVE_FEE_PERCENT);
}

export function doorFee(room: Room): number {
  return pctOf(roomConstructionCost(room.type, room.rect), DOOR_FEE_PERCENT);
}

/** How long a move or turn keeps the building closed, in minutes (a multiple of the 10-minute tick). */
export function worksMinutes(room: Room): number {
  return Math.ceil((WORKS_BASE_MINUTES + WORKS_MINUTES_PER_TILE * rectArea(room.rect)) / 10) * 10;
}

const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** Check a new footprint for a building, as if the building were not where it is now. */
export function moveCheck(state: GameState, roomId: string, rect: Rect): PlacementCheck {
  const room = state.site.rooms.find((r) => r.id === roomId);
  if (!room) return { ok: false, reason: 'not_found', costSatang: 0 };
  const turned = rect.w === room.rect.h && rect.h === room.rect.w;
  if (!(rect.w === room.rect.w && rect.h === room.rect.h) && !turned) return { ok: false, reason: 'invalid_choice', costSatang: 0 };
  const fee = moveFee(room);
  if (room.worksUntil !== undefined) return { ok: false, reason: 'works_active', costSatang: fee };
  if (BED_ROOMS.includes(room.type) && residentsInRoom(state, room.id).length > 0) return { ok: false, reason: 'room_occupied', costSatang: fee };
  // Lift the building off the lot (and lend it the fee's worth of cash) to reuse the build check.
  const lifted: GameState = {
    ...state,
    organization: { ...state.organization, cashSatang: Number.MAX_SAFE_INTEGER },
    site: { ...state.site, rooms: state.site.rooms.filter((r) => r.id !== roomId) },
  };
  const check = validateRoomPlacement(lifted, room.type, rect);
  if (!check.ok) return { ...check, costSatang: fee };
  if (sameRect(rect, room.rect)) return { ok: false, reason: 'nothing_to_build', costSatang: fee };
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

/** Put the building on its new footprint and start the works (check moveCheck first). */
export function startWorks(state: GameState, roomId: string, rect: Rect, facing: Facing | undefined, fee: number): GameState {
  const room = state.site.rooms.find((r) => r.id === roomId)!;
  const until = state.minute + worksMinutes(room);
  const moved: Room = { ...room, rect: { ...rect }, ...(facing ? { facing } : {}), worksUntil: until };
  let s: GameState = { ...state, site: { ...state.site, rooms: state.site.rooms.map((r) => (r.id === roomId ? moved : r)) } };
  s = post(s, -fee, 'construction', 'ledger.move_room', { ref: roomId, memoParams: { room: room.type } });
  return log(s, 'info', 'log.works_started', { room: room.type, hours: Math.round((until - state.minute) / 60) });
}

export function doorBlocker(state: GameState, room: Room): ReasonCode | null {
  if (room.worksUntil !== undefined) return 'works_active';
  if (state.organization.cashSatang < doorFee(room)) return 'insufficient_funds';
  return null;
}

/** Move the door to another side: a small job, paid and done at once. */
export function setDoor(state: GameState, roomId: string, facing: Facing): GameState {
  const room = state.site.rooms.find((r) => r.id === roomId)!;
  const fee = doorFee(room);
  let s: GameState = { ...state, site: { ...state.site, rooms: state.site.rooms.map((r) => (r.id === roomId ? { ...r, facing } : r)) } };
  if (fee > 0) s = post(s, -fee, 'construction', 'ledger.move_door', { ref: roomId, memoParams: { room: room.type } });
  return log(s, 'info', 'log.room_turned', { room: room.type });
}

/** Every tick: buildings whose works are done open again. */
export function worksTick(state: GameState): GameState {
  if (!state.site.rooms.some((r) => r.worksUntil !== undefined && r.worksUntil <= state.minute)) return state;
  let s = state;
  const done = s.site.rooms.filter((r) => r.worksUntil !== undefined && r.worksUntil <= s.minute);
  const rooms = s.site.rooms.map((r) => {
    if (r.worksUntil === undefined || r.worksUntil > s.minute) return r;
    const { worksUntil: _done, ...rest } = r;
    return rest;
  });
  s = { ...s, site: { ...s.site, rooms } };
  for (const r of done) s = log(s, 'good', 'log.works_done', { room: r.type });
  return s;
}

export const isFacing = (f: unknown): f is Facing => FACINGS.includes(f as Facing);
