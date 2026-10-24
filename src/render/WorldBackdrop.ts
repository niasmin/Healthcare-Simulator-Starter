import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { Site } from '../domain/types';
import { cellCenter, cellDiamond, cellToWorld } from './iso';

/**
 * The town around the lot: lawns, roads, neighbouring houses, shophouses, trees and a pond, plus
 * the plot for sale next door (Chapter 3). Purely decorative and deterministic (a hash of the cell
 * position, never the game RNG), so it never touches the simulation or saves.
 */

/** Cells of town drawn around the lot on every side. */
export const WORLD_MARGIN = 24;
/** Ground level of the town relative to the raised lot slab. */
export const DROP = 14;

const FONT = '"IBM Plex Sans Thai", "Noto Sans Thai", "Leelawadee UI", Tahoma, sans-serif';

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function shade(color: number, f: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * f));
  const b = Math.min(255, Math.round((color & 255) * f));
  return (r << 16) | (g << 8) | b;
}

const ROOFS = [0xc0634a, 0x9c5a3c, 0x5f7f8f, 0xb98a4a, 0x7d6aa0, 0x4f8a70];
const WALLS = [0xf3ead8, 0xe9dfc9, 0xf6efe2, 0xdfe6e2, 0xf1e1cf];

export interface WorldOptions {
  /** Plot for sale east of the lot, when it can still be bought. */
  sale: { fromX: number; toX: number; label: string } | null;
  textures: Map<string, Texture>;
}

/** Iso box with walls and a pitched roof, sitting on cell (x, y) with footprint w × h. */
function drawHouse(g: Graphics, x: number, y: number, w: number, h: number, height: number, wall: number, roof: number, shop: boolean): void {
  const lift = (p: { x: number; y: number }, z: number) => ({ x: p.x, y: p.y + DROP - z });
  const T = cellToWorld(x, y);
  const R = cellToWorld(x + w, y);
  const B = cellToWorld(x + w, y + h);
  const L = cellToWorld(x, y + h);
  const [r0, b0, l0] = [lift(R, 0), lift(B, 0), lift(L, 0)];
  const [t1, r1, b1, l1] = [lift(T, height), lift(R, height), lift(B, height), lift(L, height)];
  // shadow
  g.poly([l0.x - 6, l0.y + 2, b0.x, b0.y + 5, r0.x + 6, r0.y + 2, b0.x, b0.y - 2]).fill({ color: 0x000000, alpha: 0.08 });
  // left and right walls
  g.poly([l0.x, l0.y, b0.x, b0.y, b1.x, b1.y, l1.x, l1.y]).fill(shade(wall, 0.92));
  g.poly([b0.x, b0.y, r0.x, r0.y, r1.x, r1.y, b1.x, b1.y]).fill(shade(wall, 0.78));
  // windows (or a shop front) on both walls
  for (let i = 0; i < 2; i++) {
    const f = 0.25 + i * 0.4;
    const wl = { x: l0.x + (b0.x - l0.x) * f, y: l0.y + (b0.y - l0.y) * f };
    const wr = { x: b0.x + (r0.x - b0.x) * f, y: b0.y + (r0.y - b0.y) * f };
    const top = shop ? height * 0.42 : height * 0.75;
    const bottom = shop ? 2 : height * 0.4;
    g.poly([wl.x, wl.y - bottom, wl.x + 9, wl.y + 4.5 - bottom, wl.x + 9, wl.y + 4.5 - top, wl.x, wl.y - top]).fill({ color: shop ? 0x7fb7c9 : 0x9cc3cf, alpha: 0.85 });
    g.poly([wr.x, wr.y - bottom, wr.x + 9, wr.y - 4.5 - bottom, wr.x + 9, wr.y - 4.5 - top, wr.x, wr.y - top]).fill({ color: shop ? 0x6aa3b6 : 0x86afbc, alpha: 0.85 });
  }
  if (shop) {
    // awning along the front-left wall
    g.poly([l0.x, l0.y - height * 0.46, b0.x, b0.y - height * 0.46, b0.x, b0.y - height * 0.46 + 5, l0.x, l0.y - height * 0.46 + 5]).fill(roof);
    g.poly([t1.x, t1.y, r1.x, r1.y, b1.x, b1.y, l1.x, l1.y]).fill(shade(wall, 1.04)).stroke({ width: 1, color: shade(wall, 0.7), alpha: 0.5 });
    return;
  }
  // pitched roof: ridge along the long axis
  const ridge = 12 + Math.min(w, h) * 4;
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - ridge });
  const k1 = mid(t1, l1);
  const k2 = mid(r1, b1);
  g.poly([l1.x, l1.y, b1.x, b1.y, k2.x, k2.y, k1.x, k1.y]).fill(roof);
  g.poly([b1.x, b1.y, r1.x, r1.y, k2.x, k2.y]).fill(shade(roof, 0.8));
  g.poly([t1.x, t1.y, l1.x, l1.y, k1.x, k1.y]).fill(shade(roof, 0.9));
  g.poly([t1.x, t1.y, r1.x, r1.y, k2.x, k2.y, k1.x, k1.y]).fill(shade(roof, 1.08));
}

function tree(container: Container, textures: Map<string, Texture>, x: number, y: number, kind: string, width: number): void {
  const t = textures.get(kind);
  const c = cellCenter(x, y);
  if (!t) {
    const g = new Graphics().circle(c.x, c.y + DROP - 14, 11).fill(0x5f8f4a);
    container.addChild(g);
    return;
  }
  const sp = new Sprite(t);
  sp.anchor.set(0.5, 0.92);
  sp.scale.set(width / t.width);
  sp.position.set(c.x, c.y + DROP + 4);
  container.addChild(sp);
}

/** The town's road grid (cells): a ring road round the block, the front street and a second street south. */
export function townRoads(site: Site, saleToX: number | null) {
  const eastEdge = saleToX ?? site.width;
  return {
    eastEdge,
    minX: -WORLD_MARGIN,
    maxX: eastEdge + WORLD_MARGIN,
    minY: -WORLD_MARGIN,
    maxY: site.height + WORLD_MARGIN,
    west: -3,
    north: -3,
    east: eastEdge + 2,
    front: site.height,
    front2: site.height + 9,
  };
}

/** Draw the whole town into `container` (cleared first). */
export function drawWorld(container: Container, site: Site, opts: WorldOptions): void {
  for (const c of container.removeChildren()) c.destroy({ children: true });
  const roads = townRoads(site, opts.sale ? opts.sale.toX : null);
  const { minX, maxX, minY, maxY, eastEdge } = roads;
  const isRoad = (x: number, y: number) => x === roads.west || y === roads.north || x === roads.east || y === roads.front || y === roads.front2;
  const inLot = (x: number, y: number) => x >= 0 && y >= 0 && x < site.width && y < site.height;
  const inSale = (x: number, y: number) => !!opts.sale && x >= opts.sale.fromX && x < opts.sale.toX && y >= 0 && y < site.height;
  const pond = { x: -10, y: 4, w: 5, h: 4 };
  const inPond = (x: number, y: number) => x >= pond.x && x < pond.x + pond.w && y >= pond.y && y < pond.y + pond.h;

  const ground = new Graphics();
  container.addChild(ground);
  for (let y = minY; y < maxY; y++)
    for (let x = minX; x < maxX; x++) {
      if (inLot(x, y)) continue;
      const d = cellDiamond(x, y).map((v, i) => (i % 2 ? v + DROP : v));
      let color: number;
      if (isRoad(x, y)) color = 0x6f7378;
      else if (inPond(x, y)) color = (x + y) % 2 ? 0x6fa9c4 : 0x74aec8;
      else if (inSale(x, y)) color = (x + y) % 2 ? 0xbfcf98 : 0xb9ca92;
      else {
        const n = hash(x, y);
        color = n < 0.33 ? 0x93ac70 : n < 0.66 ? 0x8ea86b : 0x98b075;
      }
      ground.poly(d).fill(color);
      // sidewalk edge along roads
      if (!isRoad(x, y) && (isRoad(x + 1, y) || isRoad(x, y + 1) || isRoad(x - 1, y) || isRoad(x, y - 1)) && !inSale(x, y) && !inPond(x, y)) ground.poly(d).fill({ color: 0xd9d2bf, alpha: 0.55 });
    }
  // lane markings on the ring road and the front street
  for (let x = minX; x < maxX; x += 2) {
    for (const ry of [roads.north, roads.front, roads.front2]) {
      const c = cellCenter(x, ry);
      ground.poly([c.x - 8, c.y + DROP - 2, c.x + 8, c.y + DROP + 2, c.x + 6, c.y + DROP + 3, c.x - 10, c.y + DROP - 1]).fill({ color: 0xe8e3c9, alpha: 0.8 });
    }
  }
  for (let y = minY; y < maxY; y += 2)
    for (const rx of [roads.west, roads.east]) {
      const c = cellCenter(rx, y);
      ground.poly([c.x + 8, c.y + DROP - 2, c.x - 8, c.y + DROP + 2, c.x - 6, c.y + DROP + 3, c.x + 10, c.y + DROP - 1]).fill({ color: 0xe8e3c9, alpha: 0.8 });
    }

  // Plot for sale: dashed outline and a sign.
  if (opts.sale) {
    const s = opts.sale;
    const pts = [cellToWorld(s.fromX, 0), cellToWorld(s.toX, 0), cellToWorld(s.toX, site.height), cellToWorld(s.fromX, site.height)];
    const outline = new Graphics();
    for (let i = 0; i < 4; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % 4];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      for (let t = 0; t < len; t += 14) {
        const f0 = t / len;
        const f1 = Math.min(1, (t + 7) / len);
        outline.moveTo(a.x + (b.x - a.x) * f0, a.y + (b.y - a.y) * f0 + DROP).lineTo(a.x + (b.x - a.x) * f1, a.y + (b.y - a.y) * f1 + DROP);
      }
    }
    outline.stroke({ width: 2, color: 0xffffff, alpha: 0.85 });
    container.addChild(outline);
    const mid = cellCenter((s.fromX + s.toX) / 2, site.height / 2);
    const post = new Graphics().rect(mid.x - 2, mid.y + DROP - 34, 4, 34).fill(0x6b5135).roundRect(mid.x - 58, mid.y + DROP - 58, 116, 26, 6).fill(0xfbf8f2).stroke({ width: 2, color: 0xc0634a });
    container.addChild(post);
    const label = new Text({ text: s.label, style: { fontFamily: FONT, fontSize: 12, fontWeight: '700', fill: 0xc0634a } });
    label.anchor.set(0.5);
    label.position.set(mid.x, mid.y + DROP - 45);
    container.addChild(label);
  }

  // Neighbourhood: houses and shophouses on 3-cell plots, trees in between, drawn back to front.
  const things: Array<{ key: number; draw: () => void }> = [];
  const free = (x: number, y: number, w: number, h: number) => {
    for (let yy = y - 1; yy <= y + h; yy++) for (let xx = x - 1; xx <= x + w; xx++) if (inLot(xx, yy) || inSale(xx, yy) || isRoad(xx, yy) || inPond(xx, yy)) return false;
    return true;
  };
  const house = (bx: number, by: number, height: number, wall: number, roof: number, shop: boolean) => () => {
    const g = new Graphics();
    drawHouse(g, bx, by, 2, 2, height, wall, roof, shop);
    container.addChild(g);
  };
  for (let by = minY + 1; by < maxY - 2; by += 3)
    for (let bx = minX + 1; bx < maxX - 2; bx += 3) {
      const n = hash(bx, by);
      // In front of the lot (south / east) keep things low so they never hide the home.
      const front = by > site.height + 1 || bx > eastEdge + 1;
      if (!front && n < 0.62 && free(bx, by, 2, 2)) {
        const shop = n < 0.18;
        const height = shop ? 30 + Math.floor(hash(bx + 7, by) * 3) * 10 : 22 + Math.floor(hash(bx, by + 3) * 2) * 6;
        const wall = WALLS[Math.floor(hash(bx + 1, by) * WALLS.length)];
        const roof = ROOFS[Math.floor(hash(bx, by + 1) * ROOFS.length)];
        things.push({ key: bx + by + 4, draw: house(bx, by, height, wall, roof, shop) });
      } else if (n < 0.9 && free(bx, by, 1, 1)) {
        const kinds = ['dc_tree', 'dc_tree2', 'dc_sakura', 'dc_tree'];
        const kind = kinds[Math.floor(hash(bx + 3, by + 5) * kinds.length)];
        const width = front ? 44 : 60;
        things.push({ key: bx + by + 1, draw: () => tree(container, opts.textures, bx + 0.5, by + 0.5, kind, width) });
      }
    }
  // Undergrowth: shrubs along the outside of the fence and here and there on town lawns, grass
  // tufts on most free tiles, so the town reads green and lived-in rather than a bare grid. It is
  // all low, so one shape under the houses and trees (drawn back to front) keeps it cheap.
  const under = new Graphics();
  for (let y = minY; y < maxY; y++)
    for (let x = minX; x < maxX; x++) {
      if (inLot(x, y) || inSale(x, y) || isRoad(x, y) || inPond(x, y)) continue;
      const nearLot = x >= -2 && x <= eastEdge + 1 && y >= -2 && y <= site.height + 1;
      const n = hash(x + 911, y + 433);
      if ((nearLot && n < 0.55) || (n < 0.05 && free(x, y, 0, 0))) shrub(under, x, y, n);
      else if (n < 0.5) tufts(under, x, y, n);
    }
  container.addChild(under);
  // A few trees around the pond.
  for (const [x, y] of [[pond.x - 1, pond.y + 1], [pond.x + pond.w, pond.y], [pond.x + 2, pond.y + pond.h]] as const)
    things.push({ key: x + y + 1, draw: () => tree(container, opts.textures, x + 0.5, y + 0.5, 'dc_tree2', 56) });
  things.sort((p, q) => p.key - q.key);
  for (const t of things) t.draw();
}

/** A low shrub: a few overlapping leafy blobs, sometimes with flowers. */
function shrub(g: Graphics, x: number, y: number, n: number): void {
  const c = cellCenter(x + (hash(x, y + 9) - 0.5) * 0.5, y + (hash(x + 9, y) - 0.5) * 0.5);
  const cy = c.y + DROP;
  const size = 0.8 + n * 0.8;
  g.ellipse(c.x, cy + 2, 13 * size, 5 * size).fill({ color: 0x000000, alpha: 0.12 });
  const greens = [0x4f8a45, 0x5f9e4e, 0x6fb05a];
  for (let k = 0; k < 4; k++) g.circle(c.x + (k - 1.5) * 5 * size, cy - 4 * size - (k % 2) * 3, (6 + (k % 3)) * size).fill(greens[(k + Math.floor(n * 10)) % 3]);
  if (hash(x + 3, y + 7) < 0.35) for (let k = 0; k < 3; k++) g.circle(c.x + (k - 1) * 5 * size, cy - 9 * size, 1.6).fill(hash(x, k) < 0.5 ? 0xffe36e : 0xf3a0bf);
}

/** Grass tufts on a town lawn tile. */
function tufts(g: Graphics, x: number, y: number, n: number): void {
  for (let k = 0; k < 2; k++) {
    const c = cellCenter(x + (hash(x + k, y) - 0.5) * 0.7, y + (hash(x, y + k) - 0.5) * 0.7);
    const cy = c.y + DROP;
    const green = n < 0.3 ? 0x6f9b4f : 0x7fae5a;
    for (const a of [-0.5, 0, 0.45]) g.moveTo(c.x, cy).lineTo(c.x + a * 6, cy - 5).stroke({ width: 1.2, color: green, alpha: 0.85 });
  }
}

/** World extents (cells) for camera limits. */
export function worldBounds(site: Site, saleToX: number | null): { minX: number; maxX: number; minY: number; maxY: number } {
  const east = saleToX ?? site.width;
  return { minX: -WORLD_MARGIN, maxX: east + WORLD_MARGIN, minY: -WORLD_MARGIN, maxY: site.height + WORLD_MARGIN };
}
