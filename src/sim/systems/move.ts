import { BED_ROOMS, CORRIDOR_COST_PER_TILE, MOVE_FEE_PERCENT, WORKS_BASE_MINUTES, WORKS_MINUTES_PER_TILE, roomConstructionCost } from '../../data/rooms';
import { rectArea } from '../../domain/grid';
import { pctOf } from '../../domain/money';
import { residentsInRoom } from '../../domain/rules/beds';
import { roomStatus } from '../../domain/rules/rooms';
import { applyNeedDelta } from './needs';
import { reachableCorridor } from '../../domain/rules/navigation';
import { cellIndex, inBounds, NEIGHBOURS, rectContains } from '../../domain/grid';
import { validateRoomPlacement, type PlacementCheck } from '../../domain/rules/placement';
import type { Cell, GameState, Rect, Room } from '../../domain/types';
import { log, post } from '../helpers';

/**
 * Moving and turning buildings, as building works. A building keeps its id, equipment and name;
 * a move or a turn of the footprint costs a share of its construction cost and closes it while
 * the builders work (longer for bigger buildings). A ward or villa can move with its residents:
 * they keep their beds (bed ids follow the building's id), the move costs more, the upheaval
 * upsets them a little, and the new spot must have a door so staff can keep caring for them
 * while the works go on. Doors are placed automatically wherever the building touches a
 * corridor. All costs and times are fictional.
 */
export function moveFee(room: Room): number {
  return pctOf(roomConstructionCost(room.type, room.rect), MOVE_FEE_PERCENT);
}

/** Moving a building with people in it costs this much more (careful moving, extra hands). */
export const OCCUPIED_MOVE_EXTRA_PERCENT = 50;
/** One-off drop in each moved resident's satisfaction and happiness. */
export const MOVE_UPSET = 5;

/** Residents living in a building (wards and villas only). */
export function movingResidents(state: GameState, room: Room) {
  return BED_ROOMS.includes(room.type) ? residentsInRoom(state, room.id) : [];
}

/** What a move or turn of this building costs right now. */
export function moveCost(state: GameState, room: Room): number {
  const fee = moveFee(room);
  return movingResidents(state, room).length ? fee + pctOf(fee, OCCUPIED_MOVE_EXTRA_PERCENT) : fee;
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
  const fee = moveCost(state, room);
  if (room.worksUntil !== undefined) return { ok: false, reason: 'works_active', costSatang: fee };
  // Lift the building off the lot (and lend it the fee's worth of cash) to reuse the build check.
  const lifted: GameState = {
    ...state,
    organization: { ...state.organization, cashSatang: Number.MAX_SAFE_INTEGER },
    site: { ...state.site, rooms: state.site.rooms.filter((r) => r.id !== roomId) },
  };
  const check = validateRoomPlacement(lifted, room.type, rect);
  if (!check.ok) return { ...check, costSatang: fee };
  if (sameRect(rect, room.rect)) return { ok: false, reason: 'nothing_to_build', costSatang: fee };
  // People stay inside during the works, so staff must be able to reach the new spot.
  if (movingResidents(state, room).length) {
    const placed = { ...lifted.site, rooms: [...lifted.site.rooms, { ...room, rect, worksUntil: undefined }] };
    if (!roomStatus({ ...room, rect, worksUntil: undefined }, placed).door) return { ok: false, reason: 'occupied_needs_door', costSatang: fee };
  }
  if (state.organization.cashSatang < fee) return { ok: false, reason: 'insufficient_funds', costSatang: fee };
  return { ok: true, costSatang: fee, cells: check.cells };
}

/** Footprint at `origin` (its top-left tile), turned a quarter if `rotated`. */
export function movedRect(room: Room, origin: Cell, rotated = false): Rect {
  return { x: origin.x, y: origin.y, w: rotated ? room.rect.h : room.rect.w, h: rotated ? room.rect.w : room.rect.h };
}

/** A quarter turn in place: the footprint turns about its centre, so four turns come back to the start. */
export function turnedRect(room: Room): Rect {
  const { x, y, w, h } = room.rect;
  const d = Math.trunc((w - h) / 2);
  return { x: x + d, y: y - d, w: h, h: w };
}

/** Put the building on its new footprint and start the works (check moveCheck first). */
export function startWorks(state: GameState, roomId: string, rect: Rect, fee: number): GameState {
  const room = state.site.rooms.find((r) => r.id === roomId)!;
  const until = state.minute + worksMinutes(room);
  // Older saves may carry a chosen door side: doors are automatic again, so it goes.
  const { facing: _side, ...rest } = room as Room & { facing?: unknown };
  const moved: Room = { ...rest, rect: { ...rect }, worksUntil: until };
  const people = new Set(movingResidents(state, room).map((r) => r.id));
  let s: GameState = { ...state, site: { ...state.site, rooms: state.site.rooms.map((r) => (r.id === roomId ? moved : r)) } };
  s = post(s, -fee, 'construction', 'ledger.move_room', { ref: roomId, memoParams: { room: room.type } });
  s = log(s, 'info', 'log.works_started', { room: room.type, hours: Math.round((until - state.minute) / 60) });
  if (!people.size) return s;
  // The residents move with their building: same beds, a little upset by the upheaval.
  s = { ...s, residents: s.residents.map((r) => (people.has(r.id) ? { ...r, needs: applyNeedDelta(r.needs, { satisfaction: -MOVE_UPSET, happiness: -MOVE_UPSET }) } : r)) };
  return log(s, 'info', 'log.moved_with_residents', { room: room.type, n: people.size });
}

/**
 * The cheapest corridor to pave so a building gets a door: from any corridor already reached from
 * the entrance, over empty tiles (no room or decoration), to a tile next to the building. Returns
 * the new tiles to pave (empty when it already has a door), or null when there is no way.
 */
export function connectPath(state: GameState, roomId: string): Cell[] | null {
  const { site } = state;
  const room = site.rooms.find((r) => r.id === roomId);
  if (!room) return null;
  const { width, height } = site;
  const reach = reachableCorridor(site);
  const blocked = new Uint8Array(width * height);
  for (const r of site.rooms) for (let j = r.rect.y; j < r.rect.y + r.rect.h; j++) for (let i = r.rect.x; i < r.rect.x + r.rect.w; i++) if (inBounds(i, j, width, height)) blocked[cellIndex(i, j, width)] = 1;
  for (const d of site.decor ?? []) blocked[cellIndex(d.cell.x, d.cell.y, width)] = 1;
  const touches = (x: number, y: number) => NEIGHBOURS.some((d) => rectContains(room.rect, { x: x + d.x, y: y + d.y }));
  // Breadth-first from every reached corridor tile; already-reached tiles cost nothing.
  const prev = new Int32Array(width * height).fill(-2);
  const queue: number[] = [];
  for (let i = 0; i < reach.length; i++) if (reach[i]) (prev[i] = -1), queue.push(i);
  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head];
    const x = idx % width;
    const y = (idx - x) / width;
    if (touches(x, y)) {
      const out: Cell[] = [];
      for (let k = idx; k >= 0 && !reach[k]; k = prev[k]) out.push({ x: k % width, y: Math.floor(k / width) });
      return out.reverse();
    }
    for (const d of NEIGHBOURS) {
      const nx = x + d.x;
      const ny = y + d.y;
      if (!inBounds(nx, ny, width, height)) continue;
      const n = cellIndex(nx, ny, width);
      if (prev[n] !== -2 || blocked[n]) continue;
      prev[n] = idx;
      queue.push(n);
    }
  }
  return null;
}

export const connectCost = (tiles: Cell[]) => tiles.reduce((a, _c) => a + CORRIDOR_COST_PER_TILE, 0);

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
