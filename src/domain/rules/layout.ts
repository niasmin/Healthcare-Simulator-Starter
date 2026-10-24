import { ROOMS } from '../../data/rooms';
import type { Cell, EquipmentId, Facing, Room } from '../types';
import type { Door } from './navigation';

/**
 * Interior layout: where each piece of installed equipment stands inside a room, and which way
 * it faces. Pure and deterministic (same room + door → same layout), so the map, the inspector
 * and tests all agree.
 *
 * Rules (game abstractions of common room-planning practice, not a building code):
 * - the door tile and the tile just inside it stay clear;
 * - beds stand with the headboard against a wall, long walls first, so the middle stays an aisle;
 * - every bed, desk and cabinet keeps at least one clear tile beside it that can be reached from
 *   the door (for a carer, a wheelchair or a trolley), and the clear floor stays in one piece;
 * - desks sit near the door, facing it; cabinets, shelves and washers go against walls, back walls
 *   first; mats, bars and tables go in the middle of the room;
 * - bedside kit (call bell, monitor, pump, suction) hangs at the head of a bed and takes no floor.
 */

export type LayoutKind = 'bed' | 'desk' | 'wall' | 'centre' | 'bedside' | 'door';

export const LAYOUT_KIND: Record<EquipmentId, LayoutKind> = {
  care_bed: 'bed',
  call_system: 'bedside',
  feeding_pump: 'bedside',
  suction_unit: 'bedside',
  vital_monitor: 'bedside',
  sensory_kit: 'bedside',
  door_sensor: 'door',
  nurse_desk: 'desk',
  reception_desk: 'desk',
  exam_desk: 'desk',
  office_desk: 'desk',
  med_cart: 'wall',
  lockers: 'wall',
  rest_sofa: 'wall',
  whiteboard: 'wall',
  waiting_chairs: 'wall',
  medicine_shelf: 'wall',
  washer: 'wall',
  storage_rack: 'wall',
  bath_set: 'wall',
  exercise_mat: 'centre',
  parallel_bars: 'centre',
  rehab_frame: 'bedside',
  training_manikin: 'centre',
  dining_table: 'centre',
  care_van: 'centre',
};

export interface PlacedItem {
  id: EquipmentId;
  cell: Cell;
  /** The way the front of the item points (a bed: from the headboard towards the foot). */
  facing: Facing;
  /** Bedside kit and door sensors take no floor: they are drawn on this cell's wall. */
  mounted?: boolean;
}

export type LayoutIssue = 'crowded' | 'no_access';

export interface RoomLayout {
  items: PlacedItem[];
  /** Bed cells in bed order (bed index k is at beds[k]). */
  beds: Cell[];
  /** Clear floor (where people stand), in row order; never empty while the room has a free tile. */
  free: Cell[];
  /** Problems with the layout; empty when everything has room and access. */
  issues: LayoutIssue[];
}

const AWAY: Record<Facing, Facing> = { n: 's', s: 'n', e: 'w', w: 'e' };
const STEP: Record<Facing, Cell> = { n: { x: 0, y: -1 }, s: { x: 0, y: 1 }, e: { x: 1, y: 0 }, w: { x: -1, y: 0 } };

/** Walls a cell touches, long walls first. */
function wallsOf(room: Room, c: Cell): Facing[] {
  const { x, y, w, h } = room.rect;
  const out: Facing[] = [];
  const longX = h >= w; // the west and east walls are the long ones
  const side: Facing[] = longX ? ['w', 'e', 'n', 's'] : ['n', 's', 'w', 'e'];
  for (const f of side) {
    if ((f === 'n' && c.y === y) || (f === 's' && c.y === y + h - 1) || (f === 'w' && c.x === x) || (f === 'e' && c.x === x + w - 1)) out.push(f);
  }
  return out;
}

function isLongWall(room: Room, f: Facing): boolean {
  const longX = room.rect.h >= room.rect.w;
  return longX ? f === 'w' || f === 'e' : f === 'n' || f === 's';
}

/** The wall a door sits in, or the front (s) wall when the room has no door yet. */
function defaultDoor(room: Room): Door {
  const { x, y, w, h } = room.rect;
  const inside = { x: x + Math.floor((w - 1) / 2), y: y + h - 1 };
  return { inside, outside: { x: inside.x, y: inside.y + 1 } };
}

function facingToward(from: Cell, to: Cell): Facing {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'e' : 'w';
  return dy >= 0 ? 's' : 'n';
}

export function layoutRoom(room: Room, door: Door | null): RoomLayout {
  const { x, y, w, h } = room.rect;
  const d = door ?? defaultDoor(room);
  const key = (c: Cell) => (c.y - y) * w + (c.x - x);
  const inRoom = (c: Cell) => c.x >= x && c.y >= y && c.x < x + w && c.y < y + h;
  const all: Cell[] = [];
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) all.push({ x: i, y: j });

  // Keep the doorway and the step inside it clear.
  const keep = new Set<number>([key(d.inside)]);
  const inward = { x: d.inside.x + (d.inside.x - d.outside.x), y: d.inside.y + (d.inside.y - d.outside.y) };
  const depth = d.inside.x === d.outside.x ? h : w;
  if (inRoom(inward) && depth > 2) keep.add(key(inward));

  const taken = new Int8Array(w * h); // 1 = occupied by an item
  const needsAccess: number[] = [];

  /** All clear tiles form one area that includes the door tile, and every item that needs access has a clear neighbour. */
  const sound = (): boolean => {
    const seen = new Uint8Array(w * h);
    const start = key(d.inside);
    if (taken[start]) return false;
    const queue = [start];
    seen[start] = 1;
    for (let head = 0; head < queue.length; head++) {
      const k = queue[head];
      const cx = x + (k % w);
      const cy = y + Math.floor(k / w);
      for (const s of Object.values(STEP)) {
        const n = { x: cx + s.x, y: cy + s.y };
        if (!inRoom(n)) continue;
        const nk = key(n);
        if (!seen[nk] && !taken[nk]) (seen[nk] = 1), queue.push(nk);
      }
    }
    for (let k = 0; k < w * h; k++) if (!taken[k] && !seen[k]) return false;
    for (const k of needsAccess) {
      const cx = x + (k % w);
      const cy = y + Math.floor(k / w);
      const ok = Object.values(STEP).some((s) => {
        const n = { x: cx + s.x, y: cy + s.y };
        return inRoom(n) && seen[key(n)] === 1;
      });
      if (!ok) return false;
    }
    return true;
  };

  const items: PlacedItem[] = [];
  const issues = new Set<LayoutIssue>();

  /** Put an item on the first candidate that keeps the room sound; fall back to any clear tile. */
  const put = (id: EquipmentId, candidates: Array<{ cell: Cell; facing: Facing }>, access: boolean): boolean => {
    for (const c of candidates) {
      const k = key(c.cell);
      if (taken[k] || keep.has(k)) continue;
      taken[k] = 1;
      if (access) needsAccess.push(k);
      if (sound()) {
        items.push({ id, cell: c.cell, facing: c.facing });
        return true;
      }
      taken[k] = 0;
      if (access) needsAccess.pop();
    }
    // No tile keeps every rule: squeeze it onto any clear tile and flag the room.
    const spare = all.find((c) => !taken[key(c)] && !keep.has(key(c))) ?? all.find((c) => !taken[key(c)]);
    if (!spare) {
      issues.add('crowded');
      return false;
    }
    taken[key(spare)] = 1;
    items.push({ id, cell: spare, facing: AWAY[wallsOf(room, spare)[0] ?? 'n'] });
    issues.add('no_access');
    return true;
  };

  const counts: Array<[EquipmentId, number]> = [];
  for (const slot of ROOMS[room.type].equipment) {
    const n = room.equipment[slot.id] ?? 0;
    if (n > 0) counts.push([slot.id, n]);
  }
  const byKind = (kind: LayoutKind) => counts.filter(([id]) => LAYOUT_KIND[id] === kind);
  const hasBeds = byKind('bed').length > 0;
  const distDoor = (c: Cell) => Math.abs(c.x - d.inside.x) + Math.abs(c.y - d.inside.y);
  const perimeter = all.filter((c) => wallsOf(room, c).length > 0);
  const interior = all.filter((c) => wallsOf(room, c).length === 0);

  // 1. Desks: as near the door as possible, facing it.
  for (const [id, n] of byKind('desk')) {
    const cand = [...perimeter, ...interior]
      .sort((a, b) => distDoor(a) - distDoor(b) || key(a) - key(b))
      .map((cell) => ({ cell, facing: facingToward(cell, d.inside) }));
    for (let i = 0; i < n; i++) put(id, cand, true);
  }

  // 2. Beds: headboard to a wall, long walls first, walking away from the door along each wall.
  const bedCand: Array<{ cell: Cell; facing: Facing; rank: number }> = [];
  for (const cell of perimeter) {
    const walls = wallsOf(room, cell);
    const wall = walls[0];
    bedCand.push({ cell, facing: AWAY[wall], rank: (isLongWall(room, wall) ? 0 : 1000) - distDoor(cell) });
  }
  bedCand.sort((a, b) => a.rank - b.rank || key(a.cell) - key(b.cell));
  // Island beds in a big ward: head to head down the middle.
  const islands = interior.map((cell) => ({ cell, facing: (room.rect.h >= room.rect.w ? 's' : 'e') as Facing }));
  for (const [id, n] of byKind('bed')) for (let i = 0; i < n; i++) put(id, [...bedCand, ...islands], true);

  // 3. Wall pieces: back walls (north, west) first so they never hide the room, then the rest.
  const wallRank = (f: Facing) => ({ n: 0, w: 1, e: 2, s: 3 })[f];
  const wallCand = perimeter
    .flatMap((cell) => wallsOf(room, cell).map((f) => ({ cell, facing: AWAY[f], rank: wallRank(f) * 100 - distDoor(cell) })))
    .sort((a, b) => a.rank - b.rank || key(a.cell) - key(b.cell));
  const bedside = hasBeds ? [] : byKind('bedside');
  for (const [id, n] of [...byKind('wall'), ...bedside]) for (let i = 0; i < n; i++) put(id, wallCand, true);

  // 4. Middle of the room: nearest the centre, spread out (no two side by side when avoidable).
  const cx = x + (w - 1) / 2;
  const cy = y + (h - 1) / 2;
  const centreCand = (interior.length ? [...interior, ...perimeter] : perimeter).slice().sort((a, b) => Math.abs(a.x - cx) + Math.abs(a.y - cy) - (Math.abs(b.x - cx) + Math.abs(b.y - cy)) || key(a) - key(b));
  for (const [id, n] of byKind('centre')) {
    for (let i = 0; i < n; i++) {
      const lonely = centreCand.filter((c) => !items.some((it) => LAYOUT_KIND[it.id] === 'centre' && Math.abs(it.cell.x - c.x) + Math.abs(it.cell.y - c.y) === 1));
      const facing: Facing = room.rect.h >= room.rect.w ? 's' : 'e';
      put(id, [...lonely, ...centreCand].map((cell) => ({ cell, facing })), false);
    }
  }

  // 5. Mounted kit: at the head of beds in turn; a door sensor on the door tile.
  const beds = items.filter((it) => it.id === 'care_bed');
  if (hasBeds) {
    let k = 0;
    for (const [id, n] of byKind('bedside'))
      for (let i = 0; i < n; i++) {
        const bed = beds[k++ % Math.max(1, beds.length)];
        if (bed) items.push({ id, cell: bed.cell, facing: bed.facing, mounted: true });
      }
  }
  for (const [id] of byKind('door')) items.push({ id, cell: d.inside, facing: AWAY[facingToward(d.inside, d.outside)], mounted: true });

  const occupied = new Set(items.filter((it) => !it.mounted).map((it) => key(it.cell)));
  return {
    items,
    beds: beds.map((b) => b.cell),
    free: all.filter((c) => !occupied.has(key(c))),
    issues: [...issues],
  };
}
