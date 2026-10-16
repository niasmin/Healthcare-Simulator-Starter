import { cellIndex, inBounds, NEIGHBOURS } from '../grid';
import type { Cell, Room, Site } from '../types';

/**
 * Breadth-first search over corridor tiles starting at the site entrance.
 * Returns a row-major mask: 1 = corridor reachable from the entrance.
 */
export function reachableCorridor(site: Site): Uint8Array {
  const { width, height, corridor, entrance } = site;
  const seen = new Uint8Array(width * height);
  const start = cellIndex(entrance.x, entrance.y, width);
  if (!corridor[start]) return seen;
  const queue: number[] = [start];
  seen[start] = 1;
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
  const candidates: Array<[Cell, Cell]> = [];
  for (let i = 0; i < w; i++) candidates.push([{ x: x + i, y: y + h - 1 }, { x: x + i, y: y + h }]);
  for (let j = 0; j < h; j++) candidates.push([{ x: x + w - 1, y: y + j }, { x: x + w, y: y + j }]);
  for (let i = 0; i < w; i++) candidates.push([{ x: x + i, y }, { x: x + i, y: y - 1 }]);
  for (let j = 0; j < h; j++) candidates.push([{ x, y: y + j }, { x: x - 1, y: y + j }]);
  for (const [inside, outside] of candidates) {
    if (!inBounds(outside.x, outside.y, site.width, site.height)) continue;
    if (reachable[cellIndex(outside.x, outside.y, site.width)]) return { inside, outside };
  }
  return null;
}
