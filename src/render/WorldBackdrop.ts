import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { Site } from '../domain/types';
import { cellCenter, cellDiamond, cellToWorld } from './iso';
import { dispose } from './dispose';

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
  /** Ground anchors of the Blender-rendered sprites (sprites.ts RENDERED_ANCHORS). */
  anchors: Record<string, [number, number] | [number, number, number]>;
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

/**
 * The town's road grid (cells). Every road is two lanes (two cells) wide, with a pavement on both
 * sides: a ring road round the block, the front street past the gate (a pavement runs between it
 * and the fence) and a second street south. Each value is the first cell of the road.
 */
export function townRoads(site: Site, saleToX: number | null) {
  const eastEdge = saleToX ?? site.width;
  return {
    eastEdge,
    minX: -WORLD_MARGIN,
    maxX: eastEdge + WORLD_MARGIN,
    minY: -WORLD_MARGIN,
    maxY: site.height + WORLD_MARGIN,
    west: -4,
    north: -4,
    east: eastEdge + 2,
    front: site.height + 1,
    front2: site.height + 10,
    /** Lanes per road. */
    lanes: 2,
  };
}

export type TownBuilding = 'tw_house_a1' | 'tw_house_a2' | 'tw_house_a3' | 'tw_house_b1' | 'tw_house_b2' | 'tw_shop_1' | 'tw_shop_2' | 'tw_store' | 'tw_cafe' | 'tw_temple';
const HOUSES: TownBuilding[] = ['tw_house_a1', 'tw_house_a2', 'tw_house_a3', 'tw_house_b1', 'tw_house_b2'];
const SHOPS: TownBuilding[] = ['tw_shop_1', 'tw_shop_2', 'tw_store', 'tw_cafe'];

export interface TownLayout {
  roads: ReturnType<typeof townRoads>;
  isRoad: (x: number, y: number) => boolean;
  /** 2 × 2 plots, top-left cell. `shop` marks the ones on a high street (shops, cafe, store). */
  buildings: Array<{ x: number; y: number; kind: TownBuilding; mirror: boolean; shop: boolean }>;
  trees: Array<{ x: number; y: number; kind: string; front: boolean }>;
  /** Street furniture on the pavements (one cell each). */
  props: Array<{ x: number; y: number; kind: 'st3_pole' | 'st3_lamp' | 'st3_busstop' | 'st3_spirit' | 'st3_cart' | 'car3_moto_s'; mirror: boolean }>;
  /** Zebra crossings: the road, which way it runs and the cell along it. */
  crossings: Array<{ axis: 'x' | 'y'; row: number; at: number }>;
}

/**
 * Where everything in the town goes: buildings, trees, street furniture and crossings. Pure and
 * repeatable (a hash of the cell, never the game's random numbers), shared by the backdrop and
 * the night lights.
 */
export function townLayout(site: Site, saleToX: number | null): TownLayout {
  const roads = townRoads(site, saleToX);
  const { minX, maxX, minY, maxY, eastEdge } = roads;
  const on = (v: number, r: number) => v === r || v === r + 1;
  const isRoad = (x: number, y: number) => on(x, roads.west) || on(y, roads.north) || on(x, roads.east) || on(y, roads.front) || on(y, roads.front2);
  const inLot = (x: number, y: number) => x >= 0 && y >= 0 && x < site.width && y < site.height;
  const inSale = (x: number, y: number) => saleToX !== null && x >= site.width && x < saleToX && y >= 0 && y < site.height;
  const inPond = (x: number, y: number) => x >= POND.x && x < POND.x + POND.w && y >= POND.y && y < POND.y + POND.h;
  const taken = new Set<string>();
  const free = (x: number, y: number, w: number, h: number, pad = 1) => {
    for (let yy = y - pad; yy < y + h + pad; yy++)
      for (let xx = x - pad; xx < x + w + pad; xx++) if (inLot(xx, yy) || inSale(xx, yy) || isRoad(xx, yy) || inPond(xx, yy) || taken.has(`${xx},${yy}`)) return false;
    return true;
  };
  const take = (x: number, y: number, w: number, h: number) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) taken.add(`${xx},${yy}`);
  };
  const out: TownLayout = { roads, isRoad, buildings: [], trees: [], props: [], crossings: [] };

  // A small temple on the block west of the pond, where it is seen from the home.
  let temple = false;
  for (let by = minY + 1; by < maxY - 2; by += 3)
    for (let bx = minX + 1; bx < maxX - 2; bx += 3) {
      const n = hash(bx, by);
      // In front of the lot (south / east) keep things low so they never hide the home.
      const front = by > site.height + 1 || bx > eastEdge + 1;
      const nearRoad = isRoad(bx, by - 2) || isRoad(bx, by + 3) || isRoad(bx - 2, by) || isRoad(bx + 3, by);
      if (!front && n < 0.62 && free(bx, by, 2, 2)) {
        let kind: TownBuilding;
        const shop = n < 0.2 || (nearRoad && n < 0.3);
        if (!temple && bx < -8 && by > -10 && by < site.height) (kind = 'tw_temple'), (temple = true);
        else kind = shop ? SHOPS[Math.floor(hash(bx + 7, by) * SHOPS.length)] : HOUSES[Math.floor(hash(bx + 1, by) * HOUSES.length)];
        take(bx, by, 2, 2);
        out.buildings.push({ x: bx, y: by, kind, mirror: hash(bx, by + 11) < 0.5, shop });
        // Most homes keep a spirit house at the front corner of the plot.
        if (!shop && kind !== 'tw_temple' && hash(bx + 5, by + 5) < 0.45 && free(bx + 2, by + 1, 1, 1, 0)) {
          take(bx + 2, by + 1, 1, 1);
          out.props.push({ x: bx + 2, y: by + 1, kind: 'st3_spirit', mirror: false });
        }
      } else if (n < 0.9 && free(bx, by, 1, 1)) {
        const kinds = ['dc_tree', 'dc_tree2', 'dc_sakura', 'dc_tree'];
        take(bx, by, 1, 1);
        out.trees.push({ x: bx, y: by, kind: kinds[Math.floor(hash(bx + 3, by + 5) * kinds.length)], front });
      }
    }
  for (const [x, y] of [[POND.x - 1, POND.y + 1], [POND.x + POND.w, POND.y], [POND.x + 2, POND.y + POND.h]] as const) out.trees.push({ x, y, kind: 'dc_tree2', front: false });

  // Pavement furniture. A pavement cell is beside a road and on neither the road nor the lot.
  const pavement = (x: number, y: number) => !isRoad(x, y) && !inLot(x, y) && !inSale(x, y) && !inPond(x, y) && !taken.has(`${x},${y}`) && x >= minX && y >= minY && x < maxX && y < maxY;
  const put = (x: number, y: number, kind: TownLayout['props'][number]['kind'], mirror = false) => {
    if (!pavement(x, y)) return;
    taken.add(`${x},${y}`);
    out.props.push({ x, y, kind, mirror });
  };
  // Street lamps along the pavement between the gate and the front street, and the ring road's inner side.
  for (let x = -2; x < eastEdge + 2; x += 5) put(x, roads.front - 1, 'st3_lamp');
  for (let y = 1; y < site.height; y += 6) put(roads.west + 2, y, 'st3_lamp', true);
  // Power poles with their cables along the far pavement of the front street and both sides of the second street.
  for (let x = minX + 1; x < maxX - 1; x += 4) put(x, roads.front + 2, 'st3_pole');
  for (let x = minX + 3; x < maxX - 1; x += 4) put(x, roads.front2 - 1, 'st3_pole');
  for (let x = minX + 1; x < maxX - 1; x += 4) put(x, roads.north - 1, 'st3_pole');
  // A bus stop by the gate, a food cart and parked motorbikes outside the shops.
  put(site.entrance.x + 3, roads.front - 1, 'st3_busstop');
  for (const b of out.buildings) {
    if (!b.shop) continue;
    const h = hash(b.x + 13, b.y + 17);
    const spots: Array<[number, number]> = [[b.x, b.y + 2], [b.x + 1, b.y + 2], [b.x + 2, b.y], [b.x + 2, b.y + 1]];
    const [sx, sy] = spots[Math.floor(h * spots.length)];
    if (h < 0.5) put(sx, sy, 'st3_cart');
    else put(sx, sy, 'car3_moto_s', h < 0.75);
  }
  // Zebra crossings: in front of the gate, and on each road next to the ring road's corners.
  out.crossings.push({ axis: 'x', row: roads.front, at: site.entrance.x });
  for (const row of [roads.front, roads.front2, roads.north]) for (const at of [roads.west + 2, roads.east - 1]) out.crossings.push({ axis: 'x', row, at });
  for (const row of [roads.west, roads.east]) for (const at of [roads.north + 2, roads.front - 1, roads.front + 2, roads.front2 - 1]) out.crossings.push({ axis: 'y', row, at });
  return out;
}

const POND = { x: -11, y: 4, w: 5, h: 4 };

/** Where the town's windows and street lamps glow at night (world px). */
export function townLights(site: Site, saleToX: number | null): Array<{ x: number; y: number; r: number; color: number; k: number }> {
  const t = townLayout(site, saleToX);
  const out: Array<{ x: number; y: number; r: number; color: number; k: number }> = [];
  for (const p of t.props)
    if (p.kind === 'st3_lamp') {
      const c = cellCenter(p.x, p.y);
      out.push({ x: c.x, y: c.y + DROP, r: 58, color: 0xffd58a, k: 0.6 });
    }
  for (const b of t.buildings) {
    const c = cellToWorld(b.x + 1, b.y + 1);
    out.push({ x: c.x, y: c.y + DROP + 18, r: b.shop ? 60 : 40, color: b.shop ? 0xffe2a8 : 0xffb350, k: b.shop ? 0.55 : 0.4 });
  }
  return out;
}

/** Draw the whole town into `container` (cleared first). */
export function drawWorld(container: Container, site: Site, opts: WorldOptions): void {
  for (const c of container.removeChildren()) dispose(c);
  const t = townLayout(site, opts.sale ? opts.sale.toX : null);
  const { roads, isRoad } = t;
  const { minX, maxX, minY, maxY } = roads;
  const inLot = (x: number, y: number) => x >= 0 && y >= 0 && x < site.width && y < site.height;
  const inSale = (x: number, y: number) => !!opts.sale && x >= opts.sale.fromX && x < opts.sale.toX && y >= 0 && y < site.height;
  const inPond = (x: number, y: number) => x >= POND.x && x < POND.x + POND.w && y >= POND.y && y < POND.y + POND.h;
  const at = (gx: number, gy: number) => {
    const p = cellToWorld(gx, gy);
    return [p.x, p.y + DROP];
  };
  const quad = (g: Graphics, x0: number, y0: number, x1: number, y1: number) => g.poly([...at(x0, y0), ...at(x1, y0), ...at(x1, y1), ...at(x0, y1)]);

  const ground = new Graphics();
  container.addChild(ground);
  for (let y = minY; y < maxY; y++)
    for (let x = minX; x < maxX; x++) {
      if (inLot(x, y)) continue;
      const d = cellDiamond(x, y).map((v, i) => (i % 2 ? v + DROP : v));
      const n = hash(x, y);
      let color: number;
      const road = isRoad(x, y);
      const walk = !road && (isRoad(x + 1, y) || isRoad(x, y + 1) || isRoad(x - 1, y) || isRoad(x, y - 1) || isRoad(x + 1, y + 1) || isRoad(x - 1, y - 1) || isRoad(x + 1, y - 1) || isRoad(x - 1, y + 1)) && !inSale(x, y) && !inPond(x, y);
      if (road) color = n < 0.5 ? 0x5b5f65 : 0x5f6369;
      else if (inPond(x, y)) color = (x + y) % 2 ? 0x6fa9c4 : 0x74aec8;
      else if (inSale(x, y)) color = (x + y) % 2 ? 0xbfcf98 : 0xb9ca92;
      else if (walk) color = (x + y) % 2 ? 0xd3cdbd : 0xcdc6b5;
      else color = n < 0.33 ? 0x93ac70 : n < 0.66 ? 0x8ea86b : 0x98b075;
      ground.poly(d).fill(color);
      if (walk) {
        // Paving slabs: four to a cell.
        ground.moveTo(...(at(x + 0.5, y) as [number, number])).lineTo(...(at(x + 0.5, y + 1) as [number, number]));
        ground.moveTo(...(at(x, y + 0.5) as [number, number])).lineTo(...(at(x + 1, y + 0.5) as [number, number]));
        ground.stroke({ width: 1, color: 0xb9b2a1, alpha: 0.6 });
        // A raised kerb where the pavement meets the road.
        const kerb = (x0: number, y0: number, x1: number, y1: number) => quad(ground, x0, y0, x1, y1).fill(0xeeeae0);
        if (isRoad(x, y + 1)) kerb(x, y + 0.88, x + 1, y + 1);
        if (isRoad(x, y - 1)) kerb(x, y, x + 1, y + 0.12);
        if (isRoad(x + 1, y)) kerb(x + 0.88, y, x + 1, y + 1);
        if (isRoad(x - 1, y)) kerb(x, y, x + 0.12, y + 1);
      } else if (road && hash(x + 41, y + 17) < 0.05) {
        // the odd manhole cover
        const c = cellCenter(x, y);
        ground.ellipse(c.x + 6, c.y + DROP, 6, 3).fill(0x4a4e53).stroke({ width: 1, color: 0x6c7076 });
      }
    }

  // Road markings: a dashed centre line between the two lanes and a solid white line at each edge.
  // Not across junctions (where two roads cross) or the crossings.
  const junction = (x: number, y: number) => {
    const onX = y === roads.north || y === roads.north + 1 || y === roads.front || y === roads.front + 1 || y === roads.front2 || y === roads.front2 + 1;
    const onY = x === roads.west || x === roads.west + 1 || x === roads.east || x === roads.east + 1;
    return onX && onY;
  };
  const crossingAt = (axis: 'x' | 'y', row: number, v: number) => t.crossings.some((c) => c.axis === axis && c.row === row && c.at === v);
  const marks = new Graphics();
  for (const row of [roads.north, roads.front, roads.front2])
    for (let x = minX; x < maxX; x++) {
      if (junction(x, row) || crossingAt('x', row, x)) continue;
      quad(marks, x + 0.15, row + 0.97, x + 0.6, row + 1.03).fill({ color: 0xf2d46a, alpha: 0.9 });
      quad(marks, x, row + 0.06, x + 1, row + 0.1).fill({ color: 0xf4f1e8, alpha: 0.8 });
      quad(marks, x, row + 1.9, x + 1, row + 1.94).fill({ color: 0xf4f1e8, alpha: 0.8 });
    }
  for (const row of [roads.west, roads.east])
    for (let y = minY; y < maxY; y++) {
      if (junction(row, y) || crossingAt('y', row, y)) continue;
      quad(marks, row + 0.97, y + 0.15, row + 1.03, y + 0.6).fill({ color: 0xf2d46a, alpha: 0.9 });
      quad(marks, row + 0.06, y, row + 0.1, y + 1).fill({ color: 0xf4f1e8, alpha: 0.8 });
      quad(marks, row + 1.9, y, row + 1.94, y + 1).fill({ color: 0xf4f1e8, alpha: 0.8 });
    }
  // Zebra crossings: white bars along the road, side by side across it, and stop lines either side.
  for (const c of t.crossings)
    for (let k = 0; k < 7; k++) {
      const a = c.row + 0.12 + k * 0.26;
      if (c.axis === 'x') quad(marks, c.at + 0.1, a, c.at + 0.9, a + 0.14).fill({ color: 0xf8f6ef, alpha: 0.92 });
      else quad(marks, a, c.at + 0.1, a + 0.14, c.at + 0.9).fill({ color: 0xf8f6ef, alpha: 0.92 });
    }
  container.addChild(marks);

  // Plot for sale: dashed outline and a sign.
  if (opts.sale) {
    const s = opts.sale;
    const pts = [cellToWorld(s.fromX, 0), cellToWorld(s.toX, 0), cellToWorld(s.toX, site.height), cellToWorld(s.fromX, site.height)];
    const outline = new Graphics();
    for (let i = 0; i < 4; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % 4];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      for (let tt = 0; tt < len; tt += 14) {
        const f0 = tt / len;
        const f1 = Math.min(1, (tt + 7) / len);
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

  // Undergrowth: shrubs along the outside of the fence and here and there on town lawns, grass
  // tufts on most free tiles, so the town reads green and lived-in rather than a bare grid. It is
  // all low, so one shape under the houses and trees (drawn back to front) keeps it cheap.
  const busy = new Set<string>();
  for (const b of t.buildings) for (let yy = b.y; yy < b.y + 2; yy++) for (let xx = b.x; xx < b.x + 2; xx++) busy.add(`${xx},${yy}`);
  for (const p of t.props) busy.add(`${p.x},${p.y}`);
  const under = new Graphics();
  for (let y = minY; y < maxY; y++)
    for (let x = minX; x < maxX; x++) {
      if (inLot(x, y) || inSale(x, y) || isRoad(x, y) || inPond(x, y) || busy.has(`${x},${y}`)) continue;
      if (isRoad(x + 1, y) || isRoad(x, y + 1) || isRoad(x - 1, y) || isRoad(x, y - 1)) continue; // pavement
      const nearLot = x >= -2 && x <= roads.eastEdge + 1 && y >= -2 && y <= site.height + 1;
      const n = hash(x + 911, y + 433);
      if ((nearLot && n < 0.55) || n < 0.05) shrub(under, x, y, n);
      else if (n < 0.5) tufts(under, x, y, n);
    }
  container.addChild(under);

  // Buildings, trees and street furniture, back to front.
  const things: Array<{ key: number; draw: () => void }> = [];
  const sprite = (name: string, gx: number, gy: number, mirror: boolean): boolean => {
    const tex = opts.textures.get(name);
    const a = opts.anchors[name];
    if (!tex || !a) return false;
    const sp = new Sprite(tex);
    sp.anchor.set(a[0] / tex.width, a[1] / tex.height);
    const k = 1 / (a[2] ?? 1);
    sp.scale.set(mirror ? -k : k, k);
    const p = cellToWorld(gx, gy);
    sp.position.set(p.x, p.y + DROP);
    container.addChild(sp);
    return true;
  };
  for (const b of t.buildings)
    things.push({
      key: b.x + b.y + 4,
      draw: () => {
        if (sprite(b.kind, b.x + 1, b.y + 1, b.mirror)) return;
        const g = new Graphics();
        const height = b.shop ? 30 + Math.floor(hash(b.x + 7, b.y) * 3) * 10 : 22 + Math.floor(hash(b.x, b.y + 3) * 2) * 6;
        drawHouse(g, b.x, b.y, 2, 2, height, WALLS[Math.floor(hash(b.x + 1, b.y) * WALLS.length)], ROOFS[Math.floor(hash(b.x, b.y + 1) * ROOFS.length)], b.shop);
        container.addChild(g);
      },
    });
  for (const tr of t.trees) things.push({ key: tr.x + tr.y + 1, draw: () => tree(container, opts.textures, tr.x + 0.5, tr.y + 0.5, tr.kind, tr.front ? 44 : 60) });
  const poles: Array<{ x: number; y: number }> = [];
  for (const p of t.props) {
    if (p.kind === 'st3_pole') poles.push(p);
    things.push({ key: p.x + p.y + 1.5, draw: () => void sprite(p.kind, p.x + 0.5, p.y + 0.5, p.mirror) });
  }
  things.sort((p, q) => p.key - q.key);
  for (const th of things) th.draw();

  // Cables slung between neighbouring poles along a street (three sagging lines per span).
  if (opts.textures.has('st3_pole')) {
    const wires = new Graphics();
    const POLE_TOP = 64;
    const byRow = new Map<number, Array<{ x: number; y: number }>>();
    for (const p of poles) byRow.set(p.y, [...(byRow.get(p.y) ?? []), p]);
    for (const row of byRow.values()) {
      row.sort((a, b) => a.x - b.x);
      for (let i = 1; i < row.length; i++) {
        const a = row[i - 1];
        const b = row[i];
        if (b.x - a.x > 6) continue;
        for (const [off, lift] of [[-0.18, 0], [0.18, 0], [0, 8]] as const) {
          const p0 = cellToWorld(a.x + 0.5 + off, a.y + 0.5);
          const p1 = cellToWorld(b.x + 0.5 + off, b.y + 0.5);
          const y0 = p0.y + DROP - POLE_TOP + lift;
          const y1 = p1.y + DROP - POLE_TOP + lift;
          wires.moveTo(p0.x, y0).quadraticCurveTo((p0.x + p1.x) / 2, (y0 + y1) / 2 + 10, p1.x, y1);
        }
      }
    }
    wires.stroke({ width: 1, color: 0x2b2f35, alpha: 0.6 });
    container.addChild(wires);
  }
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
