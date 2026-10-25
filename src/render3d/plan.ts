import { ROOMS } from '../data/rooms';
import { cellIndex, rectArea } from '../domain/grid';
import { layoutRoom, type PlacedItem } from '../domain/rules/layout';
import type { Door } from '../domain/rules/navigation';
import { allRoomStatuses } from '../domain/rules/rooms';
import type { Cell, Facing, GameState, RoomType } from '../domain/types';
import type { PersonMarker } from '../render/IsoRenderer';

/**
 * What the 3D view shows, worked out from the game state without any WebGL: rooms with their
 * height, roof and door, the equipment where the layout rules put it, and where each person
 * stands. Pure, so it is tested like the rest of the rules. World units: one tile = 1, game x →
 * world x, game y → world z, up is y.
 */

export const STOREY = 1.2;
/** Height of the walls in the cut-away (interior) view. */
export const CUTAWAY = 0.45;
const PITCHED: ReadonlySet<RoomType> = new Set<RoomType>(['ward', 'villa', 'staff_room', 'dining_room']);

/** Rotation about the vertical axis that turns a model whose front faces +z (game south) to `f`. */
export function facingRotation(f: Facing): number {
  return { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 }[f];
}

export interface Room3D {
  id: string;
  type: RoomType;
  rect: { x: number; y: number; w: number; h: number };
  floors: number;
  height: number;
  pitched: boolean;
  door: Door | null;
  operational: boolean;
  works: boolean;
  items: PlacedItem[];
  beds: Cell[];
  bedFacing: Facing[];
  bedSide: Array<Cell | null>;
  free: Cell[];
}

export function roomsPlan(game: GameState): Room3D[] {
  const statuses = allRoomStatuses(game.site);
  return game.site.rooms.map((room) => {
    const st = statuses.get(room.id);
    const door = st?.door ?? null;
    const layout = layoutRoom(room, door);
    const floors = room.type === 'ward' && rectArea(room.rect) >= 20 ? 2 : 1;
    const freeKeys = new Set(layout.free.map((c) => `${c.x},${c.y}`));
    const bedItems = layout.items.filter((it) => it.id === 'care_bed');
    return {
      id: room.id,
      type: room.type,
      rect: room.rect,
      floors,
      height: STOREY * (floors === 2 ? 1.75 : 1),
      pitched: PITCHED.has(room.type),
      door,
      operational: !!st?.operational,
      works: room.worksUntil !== undefined,
      items: layout.items,
      beds: layout.beds,
      bedFacing: bedItems.map((b) => b.facing),
      bedSide: bedItems.map((b) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: b.cell.x + dx, y: b.cell.y + dy })).find((c) => freeKeys.has(`${c.x},${c.y}`)) ?? null),
      free: layout.free.filter((c) => !door || c.x !== door.inside.x || c.y !== door.inside.y),
    };
  });
}

export interface Person3D {
  key: string;
  kind: PersonMarker['kind'];
  color: number;
  /** Elderly (grey hair) — residents. */
  elder: boolean;
  chair: boolean;
  /** World position of the feet (or, lying, the middle of the body). */
  x: number;
  z: number;
  /** Lying in bed, head toward this facing's opposite (the headboard). */
  lying?: Facing;
  /** Inside a room (hidden in the exterior view). */
  inside: boolean;
}

/** Lawn spots for residents out for a stroll: beside garden decor first, then along the paths. */
function strollCells(game: GameState): Cell[] {
  const site = game.site;
  const taken = new Set<string>();
  for (const r of site.rooms) for (let y = r.rect.y; y < r.rect.y + r.rect.h; y++) for (let x = r.rect.x; x < r.rect.x + r.rect.w; x++) taken.add(`${x},${y}`);
  for (const d of site.decor ?? []) taken.add(`${d.cell.x},${d.cell.y}`);
  const lawn = (x: number, y: number) => x >= 0 && y >= 0 && x < site.width && y < site.height && !taken.has(`${x},${y}`) && !site.corridor[cellIndex(x, y, site.width)];
  const out: Cell[] = [];
  const seen = new Set<string>();
  const add = (c: Cell) => {
    const k = `${c.x},${c.y}`;
    if (!seen.has(k) && lawn(c.x, c.y)) seen.add(k), out.push(c);
  };
  for (const d of site.decor ?? []) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) add({ x: d.cell.x + dx, y: d.cell.y + dy });
  for (let y = 0; y < site.height && out.length < 40; y++)
    for (let x = 0; x < site.width && out.length < 40; x++) if (site.corridor[cellIndex(x, y, site.width)] && (x + y) % 3 === 0) for (const [dx, dy] of [[1, 0], [0, 1]]) add({ x: x + dx, y: y + dy });
  return out;
}

/** Where every person in the markers list stands (same rules as the 2D map). */
export function peoplePlan(game: GameState, rooms: Room3D[], markers: PersonMarker[]): Person3D[] {
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const strolls = strollCells(game);
  let strolling = 0;
  const out: Person3D[] = [];
  for (const p of markers) {
    const elder = p.kind === 'resident';
    const chair = p.sprite === 'ch_wheelchair';
    if (p.stroll && strolls.length) {
      const c = strolls[(strolling++ * 7) % strolls.length];
      const k = Math.floor(((strolling - 1) * 7) / strolls.length);
      out.push({ key: p.key, kind: p.kind, color: p.color, elder, chair, x: c.x + 0.3 + (k % 3) * 0.2, z: c.y + 0.5, inside: false });
      continue;
    }
    const rc = p.roomId ? byId.get(p.roomId) : undefined;
    if (!rc) continue;
    if (p.bed !== undefined && rc.beds[p.bed]) {
      const bed = rc.beds[p.bed];
      const side = rc.bedSide[p.bed];
      if (p.kind === 'resident') {
        out.push({ key: p.key, kind: p.kind, color: p.color, elder, chair, x: bed.x + 0.5, z: bed.y + 0.5, lying: rc.bedFacing[p.bed], inside: true });
        continue;
      }
      if (side) {
        const t = p.kind === 'visitor' ? 0.55 : 0.62;
        out.push({ key: p.key, kind: p.kind, color: p.color, elder, chair, x: bed.x + 0.5 + (side.x - bed.x) * t, z: bed.y + 0.5 + (side.y - bed.y) * t + (p.kind === 'visitor' ? 0.2 : 0), inside: true });
        continue;
      }
    }
    const cells = rc.free.length ? rc.free : rc.beds;
    if (!cells.length) continue;
    const n = p.spot ?? p.bed ?? 0;
    const c = cells[n % cells.length];
    const fan = Math.floor(n / cells.length);
    out.push({ key: p.key, kind: p.kind, color: p.color, elder, chair, x: c.x + 0.5 + (fan % 3) * 0.22 - 0.22, z: c.y + 0.5 + (fan % 2) * 0.18, inside: true });
  }
  return out;
}

/** Room colours from the catalogue: walls (cream tinted by the room's colour), accent and floor. */
export function roomColours(type: RoomType): { wall: number; accent: number; floor: number } {
  const def = ROOMS[type];
  return { wall: mix(0xf3e8d2, def.wallColor, 0.2), accent: def.wallColor, floor: def.floorColor };
}

export function mix(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 255;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return m(16) | m(8) | m(0);
}

/** How bright the day is (0 night … 1 noon) and the sun's direction for a minute of the day. */
export function daylight(minute: number): { day: number; elevation: number; azimuth: number } {
  const h = (((minute % 1440) + 1440) % 1440) / 60;
  const s = Math.sin(((h - 6) / 12) * Math.PI);
  return { day: Math.max(0, Math.min(1, s * 1.6)), elevation: Math.max(0.08, s) * (Math.PI / 2.6), azimuth: ((h - 6) / 12) * Math.PI };
}
