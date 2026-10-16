/** Pure isometric projection helpers (no Pixi imports, unit-testable). */
export const TILE_W = 64;
export const TILE_H = 32;

/** Top corner of the tile diamond for grid cell (x, y) in world space. */
export function cellToWorld(x: number, y: number): { x: number; y: number } {
  return { x: (x - y) * (TILE_W / 2), y: (x + y) * (TILE_H / 2) };
}

/** Centre of the tile diamond. */
export function cellCenter(x: number, y: number): { x: number; y: number } {
  const p = cellToWorld(x, y);
  return { x: p.x, y: p.y + TILE_H / 2 };
}

/** Inverse projection: world point -> grid cell (floored). */
export function worldToCell(wx: number, wy: number): { x: number; y: number } {
  const a = wx / (TILE_W / 2);
  const b = wy / (TILE_H / 2);
  return { x: Math.floor((a + b) / 2), y: Math.floor((b - a) / 2) };
}

/** Diamond polygon (top, right, bottom, left) for a cell, offset upward by z pixels. */
export function cellDiamond(x: number, y: number, z = 0): number[] {
  const p = cellToWorld(x, y);
  return [p.x, p.y - z, p.x + TILE_W / 2, p.y + TILE_H / 2 - z, p.x, p.y + TILE_H - z, p.x - TILE_W / 2, p.y + TILE_H / 2 - z];
}
