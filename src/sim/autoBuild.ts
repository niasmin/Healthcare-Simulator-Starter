import { prefabDef, prefabRect } from '../data/prefabs';
import { cellIndex, inBounds, rectInBounds, rectsOverlap } from '../domain/grid';
import { allRoomStatuses } from '../domain/rules/rooms';
import type { CommandResult, GameState, Rect } from '../domain/types';
import type { Command } from './engine';

/** Shared by the autopilot helpers: the engine's applyCommand, passed in to avoid an import cycle. */
export type Apply = (state: GameState, cmd: Command) => { state: GameState; result: CommandResult };

export function tryCmd(state: GameState, apply: Apply, cmd: Command): [GameState, boolean] {
  const out = apply(state, cmd);
  return out.result.ok ? [out.state, true] : [state, false];
}

/** Some corridor tile touches the rect's side, so a room there could open. */
export function touchesCorridor(state: GameState, r: Rect): boolean {
  const { site } = state;
  const at = (i: number, j: number) => inBounds(i, j, site.width, site.height) && site.corridor[cellIndex(i, j, site.width)] === 1;
  for (let i = r.x; i < r.x + r.w; i++) if (at(i, r.y - 1) || at(i, r.y + r.h)) return true;
  for (let j = r.y; j < r.y + r.h; j++) if (at(r.x - 1, j) || at(r.x + r.w, j)) return true;
  return false;
}

/**
 * The best spot for a ready-made room: the nearest to the entrance where it fits next to an
 * existing corridor and opens straight away. Returns the state with the room built, or null.
 */
export function buildSomewhere(state: GameState, apply: Apply, prefab: string): { state: GameState; id: string } | null {
  const def = prefabDef(prefab);
  if (!def) return null;
  const { site } = state;
  const spots: Array<{ x: number; y: number; rotated: boolean; d: number }> = [];
  for (let y = 0; y < site.height; y++)
    for (let x = 0; x < site.width; x++)
      for (const rotated of def.w === def.h ? [false] : [false, true]) {
        const r = prefabRect(def, { x, y }, rotated);
        if (!rectInBounds(r, site.width, site.height) || site.rooms.some((o) => rectsOverlap(o.rect, r))) continue;
        // Some corridor tile must touch the room's side, or it could never open.
        if (site.decor.some((d) => d.cell.x >= r.x && d.cell.x < r.x + r.w && d.cell.y >= r.y && d.cell.y < r.y + r.h) || !touchesCorridor(state, r)) continue;
        spots.push({ x, y, rotated, d: Math.abs(x + r.w / 2 - site.entrance.x) + Math.abs(y + r.h / 2 - site.entrance.y) });
      }
  spots.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x || Number(a.rotated) - Number(b.rotated));
  for (const p of spots) {
    const out = apply(state, { type: 'placePrefab', prefab, origin: { x: p.x, y: p.y }, rotated: p.rotated });
    if (!out.result.ok || !out.result.id) continue;
    if (allRoomStatuses(out.state.site).get(out.result.id)?.operational) return { state: out.state, id: out.result.id };
  }
  return null;
}

