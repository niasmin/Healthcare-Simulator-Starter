import { cellIndex, inBounds, NEIGHBOURS } from '../grid';
import type { Cell, Facing, Room, Site } from '../types';

/** Door sides in the default order: the two facing the camera first. */
export const FACINGS: Facing[] = ['s', 'e', 'n', 'w'];

/** True for a tile on the lot's edge, where a path meets the street outside. */
export function onLotEdge(site: Site, x: number, y: number): boolean {
  return x === 0 || y === 0 || x === site.width - 1 || y === site.height - 1;
}

/**
 * Breadth-first search over corridor tiles starting at the site entrance and at every corridor
 * tile on the edge of the lot (a path that reaches the fence opens onto the street there).
 * Returns a row-major mask: 1 = corridor reachable from outside.
 */
export function reachableCorridor(site: Site): Uint8Array {
  const { width, height, corridor, entrance } = site;
  const seen = new Uint8Array(width * height);
  const queue: number[] = [];
  const seed = (x: number, y: number) => {
    const i = cellIndex(x, y, width);
    if (corridor[i] && !seen[i]) (seen[i] = 1), queue.push(i);
  };
  seed(entrance.x, entrance.y);
  for (let x = 0; x < width; x++) seed(x, 0), seed(x, height - 1);
  for (let y = 0; y < height; y++) seed(0, y), seed(width - 1, y);
  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head];
    const x = idx % width;
    const y = (idx - x) / width;
    for (const d of NEIGHBOURS) {
      const nx = x + d.x;
      const ny = y + d.y;
      if (!inBounds(nx, ny, width, height)) continue;
      const n = cellIndex(nx, ny, width);
      if (!seen[n] && corridor[n]) {
        seen[n] = 1;
        queue.push(n);
      }
    }
  }
  return seen;
}

export interface Door {
  /** Cell inside the room next to the door. */
  inside: Cell;
  /** Reachable corridor cell in front of the door. */
  outside: Cell;
}

/**
 * Doors are placed automatically: the first perimeter cell (in a fixed,
 * deterministic order) that touches a corridor reachable from the entrance.
 * Order: front faces first (bottom edge y+h, then right edge x+w), then back faces,
 * so doors prefer the side facing the camera.
 */
export function findDoor(room: Room, site: Site, reachable: Uint8Array = reachableCorridor(site)): Door | null {
  const { x, y, w, h } = room.rect;
  const sides: Record<Facing, Array<[Cell, Cell]>> = { s: [], e: [], n: [], w: [] };
  for (let i = 0; i < w; i++) sides.s.push([{ x: x + i, y: y + h - 1 }, { x: x + i, y: y + h }]);
  for (let j = 0; j < h; j++) sides.e.push([{ x: x + w - 1, y: y + j }, { x: x + w, y: y + j }]);
  for (let i = 0; i < w; i++) sides.n.push([{ x: x + i, y }, { x: x + i, y: y - 1 }]);
  for (let j = 0; j < h; j++) sides.w.push([{ x, y: y + j }, { x: x - 1, y: y + j }]);
  const candidates = FACINGS.flatMap((f) => sides[f]);
  for (const [inside, outside] of candidates) {
    if (!inBounds(outside.x, outside.y, site.width, site.height)) continue;
    if (reachable[cellIndex(outside.x, outside.y, site.width)]) return { inside, outside };
  }
  return null;
}

/**
 * Steps from `from` to every corridor tile reachable from it, walking only on corridor tiles
 * (row-major; -1 = cannot get there). `from` must be a corridor tile.
 */
export function corridorSteps(site: Site, from: Cell): Int32Array {
  const { width, height, corridor } = site;
  const dist = new Int32Array(width * height).fill(-1);
  if (!inBounds(from.x, from.y, width, height)) return dist;
  const start = cellIndex(from.x, from.y, width);
  if (!corridor[start]) return dist;
  const queue: number[] = [start];
  dist[start] = 0;
  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head];
    const x = idx % width;
    const y = (idx - x) / width;
    for (const d of NEIGHBOURS) {
      const nx = x + d.x;
      const ny = y + d.y;
      if (!inBounds(nx, ny, width, height)) continue;
      const n = cellIndex(nx, ny, width);
      if (dist[n] < 0 && corridor[n]) {
        dist[n] = dist[idx] + 1;
        queue.push(n);
      }
    }
  }
  return dist;
}

/** The corridor tiles walked from `from` to `to` (both included), or null when there is no way. */
export function corridorPath(site: Site, from: Cell, to: Cell): Cell[] | null {
  const dist = corridorSteps(site, to);
  const w = site.width;
  if (!inBounds(from.x, from.y, w, site.height) || dist[cellIndex(from.x, from.y, w)] < 0) return null;
  // Walk downhill from `from` towards `to`, in a fixed neighbour order (deterministic).
  const path: Cell[] = [{ ...from }];
  let cur = from;
  while (cur.x !== to.x || cur.y !== to.y) {
    const here = dist[cellIndex(cur.x, cur.y, w)];
    const next = NEIGHBOURS.map((d) => ({ x: cur.x + d.x, y: cur.y + d.y })).find(
      (c) => inBounds(c.x, c.y, w, site.height) && dist[cellIndex(c.x, c.y, w)] === here - 1,
    );
    if (!next) return null;
    path.push(next);
    cur = next;
  }
  return path;
}
