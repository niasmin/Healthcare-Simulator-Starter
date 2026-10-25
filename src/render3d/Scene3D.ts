import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EquipmentId, GameState } from '../domain/types';
import type { PersonMarker } from '../render/IsoRenderer';
import { townLayout, type TownLayout } from '../render/WorldBackdrop';
import { CUTAWAY, STOREY, daylight, facingRotation, mix, peoplePlan, roomColours, roomsPlan, type Person3D, type Room3D } from './plan';

/**
 * The 3D view: the player's home, built from the game state as real 3D (Three.js), to look round
 * at from any angle. Read-only like the 2D renderer: it never changes the game. Everything static
 * is merged into a few meshes per colour so phones keep up; people are separate and move.
 */

export interface View3DInput {
  game: GameState;
  markers: PersonMarker[];
  /** Roofs off and walls cut low, showing rooms, equipment and people inside. */
  interior: boolean;
  labels: Map<string, string>;
  autoRotate: boolean;
}

// ---------------------------------------------------------------- geometry batching

/** Collects shapes by colour and merges them, so a whole campus is a handful of draw calls. */
class Batch {
  private parts = new Map<string, { geos: THREE.BufferGeometry[]; mat: THREE.Material }>();
  constructor(private mats: Materials) {}

  add(geo: THREE.BufferGeometry, color: number, at: THREE.Matrix4, opts: { rough?: number; glass?: boolean; emissive?: boolean } = {}): void {
    const key = `${color}|${opts.rough ?? 0.8}|${opts.glass ? 1 : 0}|${opts.emissive ? 1 : 0}`;
    let p = this.parts.get(key);
    if (!p) this.parts.set(key, (p = { geos: [], mat: this.mats.get(color, opts) }));
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(at);
    // Merging needs the same attributes everywhere: drop UVs (all materials are plain colour).
    g.deleteAttribute('uv');
    p.geos.push(g);
  }

  build(into: THREE.Object3D, shadows = true): void {
    for (const p of this.parts.values()) {
      const merged = mergeGeometries(p.geos, false);
      for (const g of p.geos) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, p.mat);
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      into.add(mesh);
    }
    this.parts.clear();
  }
}

class Materials {
  private cache = new Map<string, THREE.MeshStandardMaterial>();
  /** Window glass and lamps glow at night: one shared material each, dimmed by day. */
  readonly glow: THREE.MeshStandardMaterial[] = [];

  get(color: number, opts: { rough?: number; glass?: boolean; emissive?: boolean } = {}): THREE.MeshStandardMaterial {
    const key = `${color}|${opts.rough ?? 0.8}|${opts.glass ? 1 : 0}|${opts.emissive ? 1 : 0}`;
    let m = this.cache.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: opts.glass ? 0.15 : (opts.rough ?? 0.8), metalness: opts.glass ? 0.1 : 0 });
      if (opts.glass || opts.emissive) {
        m.emissive = new THREE.Color(opts.emissive ? color : 0xffc46a);
        m.emissiveIntensity = 0;
        this.glow.push(m);
      }
      this.cache.set(key, m);
    }
    return m;
  }

  dispose(): void {
    for (const m of this.cache.values()) m.dispose();
    this.cache.clear();
    this.glow.length = 0;
  }
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
const SPH = new THREE.IcosahedronGeometry(0.5, 2);
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();

/** A transform: position, rotation about y, scale. */
function tr(x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0, base?: THREE.Matrix4): THREE.Matrix4 {
  tmpQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, ry);
  const m = new THREE.Matrix4().compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz));
  return base ? new THREE.Matrix4().multiplyMatrices(base, m) : m;
}

/** An axis-aligned box from corner (x0, y0, z0) to (x1, y1, z1), in the frame `base`. */
function box(b: Batch, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, base?: THREE.Matrix4, opts?: { rough?: number; glass?: boolean; emissive?: boolean }): void {
  b.add(BOX, color, tr((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), 0, base), opts);
}

function cyl(b: Batch, x: number, y0: number, z: number, r: number, y1: number, color: number, base?: THREE.Matrix4, opts?: { rough?: number; emissive?: boolean }): void {
  b.add(CYL, color, tr(x, (y0 + y1) / 2, z, r * 2, y1 - y0, r * 2, 0, base), opts);
}

function ball(b: Batch, x: number, y: number, z: number, rx: number, color: number, base?: THREE.Matrix4, ry = rx, rz = rx, opts?: { rough?: number; emissive?: boolean }): void {
  b.add(SPH, color, tr(x, y, z, rx * 2, ry * 2, rz * 2, 0, base), opts);
}

/** A gable roof (ridge along x when `alongX`) over the rectangle, rising `rise` above `y`. */
function gable(b: Batch, x0: number, z0: number, x1: number, z1: number, y: number, rise: number, alongX: boolean, color: number): void {
  const xm = (x0 + x1) / 2;
  const zm = (z0 + z1) / 2;
  const v = alongX
    ? [x0, y, z0, x1, y, z0, x1, y + rise, zm, x0, y + rise, zm, x0, y, z1, x1, y, z1]
    : [x0, y, z0, x0, y, z1, xm, y + rise, z1, xm, y + rise, z0, x1, y, z0, x1, y, z1];
  // two slopes and two gable ends (triangles)
  const idx = alongX ? [0, 3, 2, 0, 2, 1, 4, 5, 2, 4, 2, 3, 0, 4, 3, 1, 2, 5] : [0, 1, 2, 0, 2, 3, 4, 3, 2, 4, 2, 5, 0, 3, 4, 1, 5, 2];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  // Normals from the winding can face in; make every face point outward from the roof's middle.
  const pos = flat.getAttribute('position');
  const nor = flat.getAttribute('normal');
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3 - xm;
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3 - y;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3 - zm;
    if (cx * nor.getX(i) + cy * nor.getY(i) + cz * nor.getZ(i) < 0) for (let k = 0; k < 3; k++) nor.setXYZ(i + k, -nor.getX(i + k), -nor.getY(i + k), -nor.getZ(i + k));
  }
  b.add(flat, color, new THREE.Matrix4());
  g.dispose();
  flat.dispose();
}

/** A four-sided pyramid roof (hip roof on a square plot). */
function hip(b: Batch, cx: number, cz: number, half: number, y: number, rise: number, color: number): void {
  const cone = new THREE.ConeGeometry(half * Math.SQRT2, rise, 4, 1);
  b.add(cone, color, tr(cx, y + rise / 2, cz, 1, 1, 1, Math.PI / 4));
  cone.dispose();
}

// ---------------------------------------------------------------- the home

const GLASS = 0x6f9db0;
const FRAME = 0xfbf8f2;

function windowsRow(b: Batch, r: Room3D, y0: number, y1: number): void {
  const { x, y: z, w, h } = r.rect;
  const glass = { glass: true };
  for (let i = 0; i < w; i++) {
    box(b, x + i + 0.25, y0, z + h - 0.005, x + i + 0.75, y1, z + h + 0.03, GLASS, undefined, glass);
    box(b, x + i + 0.25, y0, z - 0.03, x + i + 0.75, y1, z + 0.005, GLASS, undefined, glass);
    box(b, x + i + 0.2, y0 - 0.06, z + h, x + i + 0.8, y0 - 0.02, z + h + 0.07, FRAME);
  }
  for (let j = 0; j < h; j++) {
    box(b, x + w - 0.005, y0, z + j + 0.25, x + w + 0.03, y1, z + j + 0.75, GLASS, undefined, glass);
    box(b, x - 0.03, y0, z + j + 0.25, x + 0.005, y1, z + j + 0.75, GLASS, undefined, glass);
    box(b, x + w, y0 - 0.06, z + j + 0.2, x + w + 0.07, y0 - 0.02, z + j + 0.8, FRAME);
  }
}

function building(b: Batch, r: Room3D, interior: boolean): void {
  const { x, y: z, w, h } = r.rect;
  const c = roomColours(r.type);
  const lift = 0.15;
  if (interior) {
    // floor, then low walls round it (a gap where the door is)
    box(b, x, lift, z, x + w, lift + 0.04, z + h, c.floor);
    const H = lift + CUTAWAY;
    const T = 0.08;
    const gapAt = (side: 'n' | 's' | 'e' | 'w', i: number) => {
      const d = r.door;
      if (!d) return false;
      if (side === 's') return d.outside.y === z + h && d.inside.x === x + i;
      if (side === 'n') return d.outside.y === z - 1 && d.inside.x === x + i;
      if (side === 'e') return d.outside.x === x + w && d.inside.y === z + i;
      return d.outside.x === x - 1 && d.inside.y === z + i;
    };
    // each wall segment with a cap in the room's colour
    const wall = (x0: number, z0: number, x1: number, z1: number) => {
      box(b, x0, lift, z0, x1, H, z1, c.wall);
      box(b, x0, H, z0, x1, H + 0.03, z1, c.accent);
    };
    for (let i = 0; i < w; i++) {
      if (!gapAt('n', i)) wall(x + i, z, x + i + 1, z + T);
      if (!gapAt('s', i)) wall(x + i, z + h - T, x + i + 1, z + h);
    }
    for (let j = 0; j < h; j++) {
      if (!gapAt('w', j)) wall(x, z + j, x + T, z + j + 1);
      if (!gapAt('e', j)) wall(x + w - T, z + j, x + w, z + j + 1);
    }
    return;
  }
  const H = lift + r.height;
  box(b, x - 0.04, 0.0, z - 0.04, x + w + 0.04, lift + 0.08, z + h + 0.04, mix(c.wall, 0x000000, 0.25));
  box(b, x, lift, z, x + w, H, z + h, c.wall);
  box(b, x - 0.02, H - 0.12, z - 0.02, x + w + 0.02, H, z + h + 0.02, c.accent);
  windowsRow(b, r, lift + 0.32, lift + 0.72);
  if (r.floors === 2) {
    box(b, x - 0.02, lift + STOREY * 0.9 - 0.05, z - 0.02, x + w + 0.02, lift + STOREY * 0.9, z + h + 0.02, mix(c.wall, 0x000000, 0.12));
    windowsRow(b, r, lift + STOREY * 0.9 + 0.22, lift + STOREY * 0.9 + 0.62);
  }
  // the door, with a little canopy
  if (r.door) {
    const d = r.door;
    const dx = d.outside.x - d.inside.x;
    const dz = d.outside.y - d.inside.y;
    const cx = d.inside.x + 0.5 + dx * 0.5;
    const cz = d.inside.y + 0.5 + dz * 0.5;
    const along = dz !== 0;
    const half = 0.18;
    if (along) {
      box(b, cx - half, lift, cz - 0.03 + dz * 0.01, cx + half, lift + 0.62, cz + 0.03 + dz * 0.01, 0x8a5a3c);
      box(b, cx - 0.3, lift + 0.66, cz, cx + 0.3, lift + 0.7, cz + dz * 0.3, c.accent);
    } else {
      box(b, cx - 0.03 + dx * 0.01, lift, cz - half, cx + 0.03 + dx * 0.01, lift + 0.62, cz + half, 0x8a5a3c);
      box(b, cx, lift + 0.66, cz - 0.3, cx + dx * 0.3, lift + 0.7, cz + 0.3, c.accent);
    }
  }
  if (r.pitched) {
    const roofC = r.type === 'villa' ? 0x9c5a3c : r.type === 'ward' ? 0xc0634a : mix(c.accent, 0x000000, 0.1);
    const over = 0.18;
    const alongX = w >= h;
    gable(b, x - over, z - over, x + w + over, z + h + over, H, 0.45 + Math.min(w, h) * 0.17, alongX, roofC);
  } else {
    box(b, x - 0.03, H, z - 0.03, x + w + 0.03, H + 0.1, z + h + 0.03, mix(c.wall, 0x000000, 0.08));
    box(b, x + 0.08, H, z + 0.08, x + w - 0.08, H + 0.06, z + h - 0.08, 0xc9cdc6);
    const units = Math.max(1, Math.min(3, Math.floor((w * h) / 4)));
    for (let k = 0; k < units; k++) {
      const ux = x + w * (units === 1 ? 0.5 : 0.28 + (0.44 * k) / (units - 1));
      box(b, ux - 0.22, H + 0.06, z + h * 0.35 - 0.22, ux + 0.22, H + 0.36, z + h * 0.35 + 0.22, 0xe8e8e2);
    }
    box(b, x + w * 0.18, H - 0.42, z + h, x + w * 0.82, H - 0.2, z + h + 0.05, c.accent);
  }
  if (r.works) {
    // scaffolding poles round the building
    for (let i = 0; i <= w; i++) for (const zz of [z - 0.15, z + h + 0.15]) box(b, x + i - 0.02, 0, zz - 0.02, x + i + 0.02, H + 0.2, zz + 0.02, 0x8a8f96);
    for (let j = 0; j <= h; j++) for (const xx of [x - 0.15, x + w + 0.15]) box(b, xx - 0.02, 0, z + j - 0.02, xx + 0.02, H + 0.2, z + j + 0.02, 0x8a8f96);
  }
}

/** One piece of equipment in its tile, front toward +z before the layout's turn. */
function equipment(b: Batch, id: EquipmentId, cellX: number, cellZ: number, rot: number, mounted: boolean, slot: number): void {
  const lift = 0.19;
  let base = tr(cellX + 0.5, lift, cellZ + 0.5, 1, 1, 1, rot);
  if (mounted && id !== 'call_system' && id !== 'door_sensor') base = new THREE.Matrix4().multiplyMatrices(base, tr((slot % 2 ? -1 : 1) * 0.4, 0, -0.3));
  const W = 0xf4f2ec;
  const steel = 0xb9c0c8;
  switch (id) {
    case 'care_bed':
      box(b, -0.26, 0.08, -0.4, 0.26, 0.17, 0.42, steel, base);
      box(b, -0.25, 0.17, -0.39, 0.25, 0.27, 0.41, W, base);
      box(b, -0.255, 0.2, -0.05, 0.255, 0.285, 0.415, 0x6fb7ac, base);
      box(b, -0.17, 0.27, -0.36, 0.17, 0.33, -0.22, 0xffffff, base);
      box(b, -0.29, 0.06, -0.46, 0.29, 0.52, -0.4, 0xd9c2a0, base);
      box(b, -0.29, 0.06, 0.42, 0.29, 0.36, 0.47, 0xd9c2a0, base);
      break;
    case 'call_system':
    case 'door_sensor':
      box(b, -0.08, 0.5, -0.48, 0.08, 0.68, -0.45, W, base);
      ball(b, 0, 0.6, -0.44, 0.035, id === 'call_system' ? 0xe5484d : 0x6fd3a8, base);
      break;
    case 'feeding_pump':
    case 'vital_monitor':
    case 'suction_unit':
    case 'rehab_frame':
    case 'sensory_kit':
      cyl(b, 0, 0, 0, 0.02, 0.9, steel, base);
      cyl(b, 0, 0, 0, 0.12, 0.03, 0x3a3f46, base);
      box(b, -0.1, 0.55, -0.05, 0.1, 0.72, 0.05, id === 'vital_monitor' ? 0x3b4a57 : 0xe9eef2, base);
      break;
    case 'nurse_desk':
    case 'reception_desk':
    case 'exam_desk':
    case 'office_desk': {
      const accent = { nurse_desk: 0x4a6aa5, reception_desk: 0x4b4fc4, exam_desk: 0x3b5ba5, office_desk: 0x3c6e47 }[id];
      box(b, -0.42, 0.34, -0.16, 0.42, 0.38, 0.26, 0xe8dcc6, base);
      box(b, -0.4, 0, 0.22, 0.4, 0.34, 0.26, accent, base);
      if (id === 'nurse_desk' || id === 'reception_desk') box(b, -0.44, 0, 0.24, 0.44, 0.56, 0.36, accent, base);
      box(b, -0.12, 0.38, -0.02, 0.12, 0.56, 0.0, 0x3a3f46, base);
      box(b, -0.08, 0.2, -0.42, 0.08, 0.24, -0.26, 0x4a6aa5, base);
      box(b, -0.08, 0.24, -0.43, 0.08, 0.42, -0.41, 0x4a6aa5, base);
      break;
    }
    case 'med_cart':
      box(b, -0.22, 0.06, -0.18, 0.22, 0.56, 0.18, W, base);
      for (let k = 0; k < 4; k++) box(b, -0.2, 0.1 + k * 0.11, 0.18, 0.2, 0.19 + k * 0.11, 0.19, [0x4a6aa5, 0x6fc3f2, 0xffd166, 0xe5484d][k], base);
      break;
    case 'lockers':
      box(b, -0.4, 0, -0.4, 0.4, 0.95, -0.08, 0x6b8fb5, base);
      break;
    case 'medicine_shelf':
      box(b, -0.4, 0, -0.4, 0.4, 0.95, -0.08, W, base);
      for (let k = 0; k < 4; k++) box(b, -0.36, 0.06 + k * 0.23, -0.36, 0.36, 0.16 + k * 0.23, -0.07, [0xe5484d, 0x2f74d8, 0xffd166, 0x1e9e6a][k], base);
      break;
    case 'storage_rack':
      box(b, -0.4, 0, -0.38, 0.4, 0.95, -0.06, 0x8d97a1, base);
      for (let k = 0; k < 3; k++) box(b, -0.36, 0.08 + k * 0.28, -0.35, 0.36, 0.24 + k * 0.28, -0.05, 0xc9a06a, base);
      break;
    case 'whiteboard':
      box(b, -0.4, 0.38, -0.3, 0.4, 0.92, -0.26, 0xf8f8f6, base);
      box(b, -0.36, 0.02, -0.3, -0.33, 0.95, -0.26, steel, base);
      box(b, 0.33, 0.02, -0.3, 0.36, 0.95, -0.26, steel, base);
      break;
    case 'rest_sofa':
      box(b, -0.4, 0.06, -0.3, 0.4, 0.24, 0.22, 0x8fb8a8, base);
      box(b, -0.4, 0.06, -0.34, 0.4, 0.5, -0.18, 0x8fb8a8, base);
      break;
    case 'waiting_chairs':
      for (let k = 0; k < 3; k++) {
        box(b, -0.4 + k * 0.27, 0.2, -0.18, -0.15 + k * 0.27, 0.25, 0.12, 0x3f8fae, base);
        box(b, -0.4 + k * 0.27, 0.25, -0.22, -0.15 + k * 0.27, 0.5, -0.18, 0x3f8fae, base);
      }
      break;
    case 'dining_table':
      box(b, -0.32, 0.34, -0.32, 0.32, 0.38, 0.32, 0xc08a55, base);
      cyl(b, 0, 0, 0, 0.04, 0.34, 0xc08a55, base);
      for (const [cx, cz] of [[0, -0.44], [0, 0.44], [-0.44, 0], [0.44, 0]]) box(b, cx - 0.09, 0.2, cz - 0.09, cx + 0.09, 0.24, cz + 0.09, 0xa0623a, base);
      break;
    case 'washer':
      box(b, -0.26, 0, -0.24, 0.26, 0.62, 0.24, W, base);
      cyl(b, 0, 0.29, 0.245, 0.12, 0.31, 0x5c7a99, base);
      break;
    case 'bath_set':
      box(b, -0.4, 0, -0.38, 0.4, 0.34, 0.06, 0xf8f8f6, base);
      box(b, -0.36, 0.2, -0.34, 0.36, 0.33, 0.02, 0x9fd3e8, base);
      break;
    case 'exercise_mat':
      box(b, -0.38, 0, -0.32, 0.38, 0.04, 0.32, 0x4f8fd8, base);
      ball(b, 0.22, 0.14, -0.18, 0.11, 0x6fd39a, base);
      break;
    case 'parallel_bars':
      box(b, -0.46, 0, -0.32, 0.46, 0.04, 0.32, 0x9c6b45, base);
      for (const zz of [-0.2, 0.2]) {
        box(b, -0.4, 0.53, zz - 0.02, 0.4, 0.57, zz + 0.02, 0xf2c46d, base);
        for (const xx of [-0.36, 0.36]) cyl(b, xx, 0.04, zz, 0.018, 0.55, steel, base);
      }
      break;
    case 'training_manikin':
      box(b, -0.42, 0.3, -0.3, 0.42, 0.34, 0.3, 0xe8dcc6, base);
      box(b, -0.18, 0.34, -0.12, 0.16, 0.42, 0.12, 0x5a87c9, base);
      ball(b, -0.25, 0.39, 0, 0.07, 0xf1d3b8, base);
      break;
    case 'care_van':
      box(b, -0.32, 0.06, -0.44, 0.32, 0.6, 0.44, W, base);
      box(b, -0.3, 0.4, 0.38, 0.3, 0.58, 0.445, 0x5c7a99, base);
      box(b, -0.33, 0.24, -0.3, -0.32, 0.32, 0.1, 0x3f7f9a, base);
      break;
  }
}

function tree(b: Batch, x: number, z: number, s: number, kind: 'green' | 'dark' | 'sakura' | 'gold', y = 0): void {
  const leaf = { green: [0x4f8a45, 0x5f9e4e, 0x6fb05a], dark: [0x3f7a3a, 0x4f8a45, 0x5a9248], sakura: [0xf2a7c3, 0xf7c0d4, 0xe891b2], gold: [0xd9b341, 0xe6c55a, 0x9db54a] }[kind];
  cyl(b, x, y, z, 0.06 * s, y + 0.8 * s, 0x6e4a2e);
  for (let k = 0; k < 4; k++) {
    const a = k * 2.4 + x;
    ball(b, x + Math.cos(a) * 0.2 * s, y + (0.9 + (k % 3) * 0.2) * s, z + Math.sin(a) * 0.2 * s, (0.3 + (k % 2) * 0.08) * s, leaf[k % 3]);
  }
}

function decor(b: Batch, type: string, cx: number, cz: number): void {
  const y = 0.15;
  switch (type) {
    case 'tree':
    case 'tree2':
      tree(b, cx, cz, 1, type === 'tree' ? 'green' : 'dark', y);
      break;
    case 'sakura':
    case 'sakura_arch':
      tree(b, cx, cz, 1, 'sakura', y);
      break;
    case 'flowers':
    case 'planter':
      if (type === 'planter') box(b, cx - 0.3, y, cz - 0.3, cx + 0.3, y + 0.2, cz + 0.3, 0x8a5a3c);
      for (let k = 0; k < 6; k++) ball(b, cx + Math.cos(k) * 0.22, y + 0.22, cz + Math.sin(k * 1.7) * 0.22, 0.08, [0xf08aa8, 0xffd166, 0xf4f1ea, 0xe5484d][k % 4]);
      ball(b, cx, y + 0.12, cz, 0.22, 0x5f9e4e, undefined, 0.14, 0.22);
      break;
    case 'hedge':
      box(b, cx - 0.48, y, cz - 0.25, cx + 0.48, y + 0.4, cz + 0.25, 0x4f8a45);
      break;
    case 'lamp':
    case 'lantern':
    case 'gold_lantern':
      cyl(b, cx, y, cz, 0.025, y + (type === 'lamp' ? 1.0 : 0.5), 0x5a6570);
      ball(b, cx, y + (type === 'lamp' ? 1.05 : 0.55), cz, 0.08, type === 'gold_lantern' ? 0xffcf4d : 0xffe2a8, undefined, 0.08, 0.08, { emissive: true });
      break;
    case 'umbrella':
      cyl(b, cx, y, cz, 0.02, y + 0.9, 0xeeeeee);
      ball(b, cx, y + 0.95, cz, 0.42, 0xe5484d, undefined, 0.12, 0.42);
      break;
    case 'fountain':
    case 'gold_fountain': {
      const stone = type === 'gold_fountain' ? 0xe8c25a : 0xede6d6;
      cyl(b, cx, y, cz, 0.45, y + 0.2, stone);
      cyl(b, cx, y + 0.12, cz, 0.4, y + 0.21, 0x3e8fb5, undefined, { rough: 0.1 });
      cyl(b, cx, y, cz, 0.06, y + 0.6, stone);
      ball(b, cx, y + 0.65, cz, 0.08, 0xddf3ff);
      break;
    }
    case 'gazebo':
    case 'sala':
      box(b, cx - 0.42, y, cz - 0.42, cx + 0.42, y + 0.12, cz + 0.42, 0xb98352);
      for (const [px, pz] of [[-0.36, -0.36], [0.36, -0.36], [0.36, 0.36], [-0.36, 0.36]]) cyl(b, cx + px, y + 0.12, cz + pz, 0.03, y + 0.95, 0xf3e7cf);
      hip(b, cx, cz, 0.6, y + 0.95, 0.5, 0xb8452f);
      break;
    case 'thai_house':
      for (const [px, pz] of [[-0.35, -0.35], [0.35, -0.35], [0.35, 0.35], [-0.35, 0.35]]) cyl(b, cx + px, y, cz + pz, 0.035, y + 0.42, 0x5e3a20);
      box(b, cx - 0.45, y + 0.42, cz - 0.45, cx + 0.45, y + 0.48, cz + 0.45, 0xb98352);
      box(b, cx - 0.36, y + 0.48, cz - 0.36, cx + 0.36, y + 1.1, cz + 0.36, 0x8a5a34);
      gable(b, cx - 0.48, cz - 0.48, cx + 0.48, cz + 0.48, y + 1.1, 0.7, false, 0xa9472f);
      break;
    case 'pond':
      box(b, cx - 0.5, y - 0.02, cz - 0.5, cx + 0.5, y + 0.03, cz + 0.5, 0x3e8fb5, undefined, { rough: 0.08 });
      for (let k = 0; k < 3; k++) cyl(b, cx + Math.cos(k * 2.1) * 0.25, y + 0.03, cz + Math.sin(k * 2.1) * 0.25, 0.1, y + 0.04, 0x4f8a45);
      break;
    case 'statue':
      box(b, cx - 0.2, y, cz - 0.2, cx + 0.2, y + 0.3, cz + 0.2, 0xe6e1d6);
      cyl(b, cx, y + 0.3, cz, 0.08, y + 0.75, 0xe0b23c);
      ball(b, cx, y + 0.82, cz, 0.09, 0xe8bf4f);
      break;
    default:
      tree(b, cx, cz, 0.8, 'green', y);
  }
}

// ---------------------------------------------------------------- the town

function town(b: Batch, t: TownLayout): void {
  const r = t.roads;
  const asphalt = 0x55595f;
  const walk = 0xcfc8b6;
  const yRoad = -0.02;
  for (const row of [r.north, r.front, r.front2]) {
    box(b, r.minX, yRoad - 0.02, row, r.maxX, yRoad, row + 2, asphalt, undefined, { rough: 0.95 });
    box(b, r.minX, yRoad - 0.01, row - 1, r.maxX, yRoad + 0.06, row, walk);
    box(b, r.minX, yRoad - 0.01, row + 2, r.maxX, yRoad + 0.06, row + 3, walk);
    for (let x = r.minX; x < r.maxX; x += 2) box(b, x, yRoad, row + 0.97, x + 0.9, yRoad + 0.005, row + 1.03, 0xf2d46a);
  }
  for (const col of [r.west, r.east]) {
    box(b, col, yRoad - 0.02, r.minY, col + 2, yRoad, r.maxY, asphalt, undefined, { rough: 0.95 });
    box(b, col - 1, yRoad - 0.01, r.minY, col, yRoad + 0.06, r.maxY, walk);
    box(b, col + 2, yRoad - 0.01, r.minY, col + 3, yRoad + 0.06, r.maxY, walk);
    for (let z = r.minY; z < r.maxY; z += 2) box(b, col + 0.97, yRoad, z, col + 1.03, yRoad + 0.005, z + 0.9, 0xf2d46a);
  }
  for (const c of t.crossings)
    for (let k = 0; k < 7; k++) {
      const a = c.row + 0.12 + k * 0.26;
      if (c.axis === 'x') box(b, c.at + 0.1, yRoad, a, c.at + 0.9, yRoad + 0.008, a + 0.14, 0xf8f6ef);
      else box(b, a, yRoad, c.at + 0.1, a + 0.14, yRoad + 0.008, c.at + 0.9, 0xf8f6ef);
    }
  const roofs: Record<string, number> = { tw_house_a1: 0xc0634a, tw_house_a2: 0x5f7f8f, tw_house_a3: 0x4f8a70, tw_house_b1: 0x9c5a3c, tw_house_b2: 0x7d6aa0 };
  for (const h of t.buildings) {
    const x0 = h.x + 0.1;
    const z0 = h.y + 0.1;
    const x1 = h.x + 1.9;
    const z1 = h.y + 1.9;
    const glass = { glass: true };
    if (h.kind.startsWith('tw_house')) {
      const two = h.kind.startsWith('tw_house_a');
      const H = two ? STOREY * 1.55 : STOREY * 0.9;
      box(b, x0, 0, z0, x1, H, z1, two ? 0xf3ead8 : 0xf1e1cf);
      for (const yy of two ? [0.35, STOREY * 0.8 + 0.25] : [0.35])
        for (let k = 0; k < 3; k++) {
          box(b, x0 + 0.2 + k * 0.55, yy, z1 - 0.005, x0 + 0.5 + k * 0.55, yy + 0.38, z1 + 0.03, GLASS, undefined, glass);
          box(b, x1 - 0.005, yy, z0 + 0.2 + k * 0.55, x1 + 0.03, yy + 0.38, z0 + 0.5 + k * 0.55, GLASS, undefined, glass);
        }
      if (two) hip(b, h.x + 1, h.y + 1, 1.0, H, 0.7, roofs[h.kind]);
      else gable(b, x0 - 0.12, z0 - 0.12, x1 + 0.12, z1 + 0.12, H, 0.7, true, roofs[h.kind]);
    } else if (h.kind === 'tw_temple') {
      box(b, h.x, 0, h.y, h.x + 2, 0.22, h.y + 2, 0xf6f1e6);
      box(b, h.x + 0.3, 0.22, h.y + 0.35, h.x + 1.7, 1.15, h.y + 1.65, 0xf6f1e6);
      gable(b, h.x + 0.15, h.y + 0.1, h.x + 1.85, h.y + 1.9, 1.12, 0.62, false, 0xb8452f);
      gable(b, h.x + 0.32, h.y, h.x + 1.68, h.y + 2, 1.38, 0.6, false, 0xb8452f);
      gable(b, h.x + 0.45, h.y + 0.25, h.x + 1.55, h.y + 1.75, 1.6, 0.6, false, 0x3f7f5a);
      for (const zz of [h.y, h.y + 2]) box(b, h.x + 0.97, 1.98, zz - 0.03, h.x + 1.03, 2.3, zz + 0.03, 0xe0b23c);
    } else {
      const tall = h.kind.startsWith('tw_shop') ? STOREY * 2.5 : STOREY * 1.05;
      const awning = h.kind === 'tw_shop_1' ? 0x2f9aa0 : h.kind === 'tw_shop_2' ? 0xe5484d : h.kind === 'tw_cafe' ? 0x3f5f4a : 0x1e9e6a;
      box(b, x0, 0, z0, x1, tall, z1, h.kind === 'tw_cafe' ? 0x9c6b45 : 0xede3cf);
      box(b, x0 - 0.05, tall, z0 - 0.05, x1 + 0.05, tall + 0.12, z1 + 0.05, 0xe2dccd);
      box(b, x0, 0.85, z1, x1, 0.9, z1 + 0.35, awning);
      box(b, x0 + 0.1, 0.05, z1 - 0.005, x1 - 0.1, 0.7, z1 + 0.03, GLASS, undefined, glass);
      if (tall > 2)
        for (const yy of [1.2, 2.1])
          for (let k = 0; k < 3; k++) box(b, x0 + 0.2 + k * 0.55, yy, z1 - 0.005, x0 + 0.5 + k * 0.55, yy + 0.4, z1 + 0.03, GLASS, undefined, glass);
    }
  }
  for (const tr0 of t.trees) tree(b, tr0.x + 0.5, tr0.y + 0.5, tr0.front ? 0.9 : 1.2, tr0.kind === 'dc_sakura' ? 'sakura' : tr0.kind === 'dc_tree2' ? 'dark' : 'green');
  for (const p of t.props) {
    const cx = p.x + 0.5;
    const cz = p.y + 0.5;
    if (p.kind === 'st3_lamp') {
      cyl(b, cx, 0, cz, 0.025, 1.45, 0x5a6570);
      ball(b, cx, 1.47, cz, 0.08, 0xffe2a8, undefined, 0.08, 0.08, { emissive: true });
    } else if (p.kind === 'st3_pole') {
      cyl(b, cx, 0, cz, 0.035, 1.75, 0xb9b3a6);
      box(b, cx - 0.22, 1.6, cz - 0.02, cx + 0.22, 1.64, cz + 0.02, 0x8d97a1);
    } else if (p.kind === 'st3_busstop') {
      box(b, cx - 0.5, 0.85, cz - 0.25, cx + 0.5, 0.9, cz + 0.25, 0x2f74d8);
      box(b, cx - 0.45, 0.2, cz - 0.22, cx + 0.45, 0.8, cz - 0.2, 0xcfe8f2);
      box(b, cx - 0.35, 0.2, cz - 0.18, cx + 0.35, 0.25, cz - 0.05, 0xc9a06a);
    } else if (p.kind === 'st3_spirit') {
      cyl(b, cx, 0, cz, 0.05, 0.55, 0xf6f1e6);
      box(b, cx - 0.12, 0.55, cz - 0.12, cx + 0.12, 0.8, cz + 0.12, 0xf6f1e6);
      hip(b, cx, cz, 0.17, 0.8, 0.25, 0xb8452f);
    } else if (p.kind === 'st3_cart') {
      box(b, cx - 0.28, 0.18, cz - 0.18, cx + 0.28, 0.5, cz + 0.18, 0xc0392b);
      ball(b, cx, 1.15, cz, 0.42, 0xf2c230, undefined, 0.1, 0.42);
      cyl(b, cx, 0.5, cz, 0.012, 1.15, 0xdddddd);
    } else {
      box(b, cx - 0.06, 0.1, cz - 0.3, cx + 0.06, 0.35, cz + 0.3, 0xe5484d);
    }
  }
}

// ---------------------------------------------------------------- people

const SKIN = 0xf1c9a5;

function figure(p: Person3D, mats: Materials): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const m = new THREE.Mesh(geo, mats.get(color));
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    g.add(m);
  };
  const clothes = p.kind === 'resident' ? 0x9fcfe0 : p.color;
  const hair = p.elder ? 0xd8d8d4 : 0x2b2522;
  if (p.chair) {
    add(CYL, 0x5d6670, -0.12, 0.13, 0, 0.26, 0.03, 0.26);
    add(CYL, 0x5d6670, 0.12, 0.13, 0, 0.26, 0.03, 0.26);
    g.children[0].rotation.z = Math.PI / 2;
    g.children[1].rotation.z = Math.PI / 2;
    add(BOX, 0x2f3a48, 0, 0.22, 0, 0.24, 0.04, 0.22);
    add(BOX, 0x2f3a48, 0, 0.36, -0.11, 0.24, 0.28, 0.03);
    add(SPH, clothes, 0, 0.36, 0, 0.2, 0.26, 0.16);
    add(SPH, SKIN, 0, 0.6, 0, 0.22, 0.22, 0.22);
    add(SPH, hair, 0, 0.64, -0.02, 0.23, 0.18, 0.23);
    return g;
  }
  add(CYL, 0x2f3a48, -0.05, 0.12, 0, 0.07, 0.24, 0.07);
  add(CYL, 0x2f3a48, 0.05, 0.12, 0, 0.07, 0.24, 0.07);
  add(SPH, clothes, 0, 0.36, 0, 0.22, 0.3, 0.17);
  add(SPH, SKIN, 0, 0.62, 0, 0.24, 0.24, 0.24);
  add(SPH, hair, 0, 0.67, -0.02, 0.25, 0.19, 0.25);
  if (p.kind === 'staff' && p.color === 0xffffff) add(BOX, 0xffffff, 0, 0.77, 0, 0.12, 0.05, 0.08);
  return g;
}

function lyingFigure(p: Person3D, mats: Materials): THREE.Group {
  const g = new THREE.Group();
  const blanket = new THREE.Mesh(BOX, mats.get(p.color));
  blanket.scale.set(0.42, 0.08, 0.5);
  blanket.position.set(0, 0.33, 0.12);
  const head = new THREE.Mesh(SPH, mats.get(SKIN));
  head.scale.set(0.18, 0.18, 0.18);
  head.position.set(0, 0.38, -0.27);
  const hair = new THREE.Mesh(SPH, mats.get(0xd8d8d4));
  hair.scale.set(0.19, 0.12, 0.17);
  hair.position.set(0, 0.42, -0.31);
  g.add(blanket, head, hair);
  for (const c of g.children) c.castShadow = true;
  g.rotation.y = facingRotation(p.lying!);
  return g;
}

// ---------------------------------------------------------------- the view

export class Scene3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private mats = new Materials();
  private staticGroup = new THREE.Group();
  private peopleGroup = new THREE.Group();
  private labelGroup = new THREE.Group();
  private sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  private hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5a7a3a, 0.9);
  private people = new Map<string, { node: THREE.Group; tx: number; tz: number; phase: number; lying: boolean }>();
  private lastSite: unknown = null;
  private lastKey = '';
  private raf = 0;
  private clock = new THREE.Clock();
  private resize: ResizeObserver;
  private centre = new THREE.Vector3();

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = 'none';
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minPolarAngle = 0.15;
    this.controls.maxPolarAngle = 1.38; // never under the ground
    this.controls.minDistance = 4;
    this.controls.maxDistance = 70;
    this.controls.autoRotateSpeed = 0.8;
    this.scene.add(this.staticGroup, this.peopleGroup, this.labelGroup, this.hemi, this.sun, this.sun.target);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(host);
    this.fit();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    loop();
  }

  private fit(): void {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(input: View3DInput): void {
    const { game } = input;
    const site = game.site;
    const rooms = roomsPlan(game);
    const key = `${input.interior ? 'i' : 'e'}|${[...input.labels.values()].join(',')}`;
    if (site !== this.lastSite || key !== this.lastKey) {
      const first = this.lastSite === null;
      this.lastSite = site;
      this.lastKey = key;
      this.buildStatic(game, rooms, input);
      if (first) {
        this.centre.set(site.width / 2, 0, site.height / 2);
        this.controls.target.copy(this.centre);
        this.recenter();
        this.controls.update();
      }
    }
    this.controls.autoRotate = input.autoRotate;
    this.light(game.minute);
    this.placePeople(peoplePlan(game, rooms, input.markers), input.interior);
  }

  private buildStatic(game: GameState, rooms: Room3D[], input: View3DInput): void {
    for (const c of [...this.staticGroup.children]) {
      this.staticGroup.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
    }
    for (const c of [...this.labelGroup.children]) {
      this.labelGroup.remove(c);
      const s = c as THREE.Sprite;
      s.material.map?.dispose();
      s.material.dispose();
    }
    const site = game.site;
    const b = new Batch(this.mats);
    // the town's lawn and the lot raised a little above it
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), this.mats.get(0x86a95e, { rough: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(site.width / 2, -0.05, site.height / 2);
    ground.receiveShadow = true;
    this.staticGroup.add(ground);
    box(b, 0, -0.05, 0, site.width, 0.15, site.height, 0x93bd68, undefined, { rough: 1 });
    for (let y = 0; y < site.height; y++)
      for (let x = 0; x < site.width; x++) if (site.corridor[y * site.width + x]) box(b, x, 0.15, y, x + 1, 0.17, y + 1, (x + y) % 2 ? 0xe6dcc6 : 0xddd2bb, undefined, { rough: 0.9 });
    // the fence, open where a path meets it, and the gate
    const open = (x: number, y: number) => x >= 0 && y >= 0 && x < site.width && y < site.height && !!site.corridor[y * site.width + x];
    for (let i = 0; i < site.width; i++) {
      if (!open(i, site.height - 1)) box(b, i, 0.15, site.height - 0.04, i + 1, 0.45, site.height, 0xf4efe4);
      if (!open(i, 0)) box(b, i, 0.15, 0, i + 1, 0.45, 0.04, 0xf4efe4);
    }
    for (let j = 0; j < site.height; j++) {
      if (!open(0, j)) box(b, 0, 0.15, j, 0.04, 0.45, j + 1, 0xf4efe4);
      if (!open(site.width - 1, j)) box(b, site.width - 0.04, 0.15, j, site.width, 0.45, j + 1, 0xf4efe4);
    }
    const e = site.entrance;
    for (const gx of [e.x - 0.15, e.x + 1.05]) box(b, gx, 0.15, site.height - 0.15, gx + 0.1, 1.3, site.height + 0.05, 0xf3ead8);
    box(b, e.x - 0.2, 1.3, site.height - 0.2, e.x + 1.2, 1.42, site.height + 0.1, 0xc0634a);
    for (const r of rooms) {
      building(b, r, input.interior);
      if (input.interior) {
        const slots = new Map<string, number>();
        for (const it of r.items) {
          const k = `${it.cell.x},${it.cell.y}`;
          const n = it.mounted ? (slots.get(k) ?? 0) : 0;
          if (it.mounted) slots.set(k, n + 1);
          equipment(b, it.id, it.cell.x, it.cell.y, facingRotation(it.facing), !!it.mounted, n);
        }
      }
      const label = input.labels.get(r.id);
      if (label) this.labelGroup.add(this.label(label, r.rect.x + r.rect.w / 2, (input.interior ? CUTAWAY + 0.9 : r.height + (r.pitched ? 1.3 : 0.7)) + 0.15, r.rect.y + r.rect.h / 2, roomColours(r.type).accent));
    }
    for (const d of site.decor ?? []) decor(b, d.type, d.cell.x + 0.5, d.cell.y + 0.5);
    town(b, townLayout(site, null));
    b.build(this.staticGroup);
  }

  private label(text: string, x: number, y: number, z: number, color: number): THREE.Sprite {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    const font = '700 44px "IBM Plex Sans Thai", "Noto Sans Thai", Tahoma, sans-serif';
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 56;
    c.width = w;
    c.height = 76;
    ctx.font = font;
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, 68, 34);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(text, w / 2, 40);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set((w / 76) * 0.55, 0.55, 1);
    s.position.set(x, y, z);
    s.renderOrder = 10;
    return s;
  }

  private placePeople(list: Person3D[], interior: boolean): void {
    const keep = new Set<string>();
    for (const p of list) {
      if (p.inside && !interior) continue;
      const lying = !!p.lying;
      const id = `${p.key}|${lying ? 'l' : 's'}|${p.chair ? 'c' : ''}`;
      keep.add(id);
      const y = 0.15;
      let rec = this.people.get(id);
      if (!rec) {
        const node = lying ? lyingFigure(p, this.mats) : figure(p, this.mats);
        node.position.set(p.x, y, p.z);
        this.peopleGroup.add(node);
        rec = { node, tx: p.x, tz: p.z, phase: (p.key.length * 1.7) % 6.28, lying };
        this.people.set(id, rec);
      }
      rec.tx = p.x;
      rec.tz = p.z;
      if (lying) rec.node.rotation.y = facingRotation(p.lying!);
    }
    for (const [id, rec] of this.people)
      if (!keep.has(id)) {
        this.peopleGroup.remove(rec.node);
        this.people.delete(id);
      }
  }

  private light(minute: number): void {
    const { day, elevation, azimuth } = daylight(minute);
    const dist = 40;
    this.sun.position.set(this.centre.x + Math.cos(azimuth) * Math.cos(elevation) * dist, Math.sin(elevation) * dist, this.centre.z - Math.sin(azimuth) * Math.cos(elevation) * dist * 0.6 + 10);
    this.sun.target.position.copy(this.centre);
    this.sun.intensity = 0.15 + day * 2.4;
    const dusk = Math.max(0, 1 - Math.abs(day - 0.35) * 3);
    this.sun.color.setHex(mix(0xfff1dc, 0xffa860, dusk * 0.7));
    this.hemi.intensity = 0.35 + day * 0.6;
    const sky = new THREE.Color(mix(mix(0x0c1633, 0x9fd0f0, day), 0xf6b27a, dusk * 0.45));
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(sky.getHex(), 60, 160);
    const glow = Math.max(0, 1 - day * 1.4);
    for (const m of this.mats.glow) m.emissiveIntensity = glow * 1.4;
    const s = this.sun.shadow.camera as THREE.OrthographicCamera;
    const span = Math.max(30, this.centre.x * 2.2);
    s.left = -span;
    s.right = span;
    s.top = span;
    s.bottom = -span;
    s.far = 120;
    s.updateProjectionMatrix();
  }

  private frame(): void {
    const dt = Math.min(0.1, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    for (const rec of this.people.values()) {
      const n = rec.node;
      const dx = rec.tx - n.position.x;
      const dz = rec.tz - n.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01) {
        const step = Math.min(d, dt * 2.2);
        n.position.x += (dx / d) * step;
        n.position.z += (dz / d) * step;
        if (!rec.lying) n.rotation.y = Math.atan2(dx, dz);
        n.position.y = 0.15 + Math.abs(Math.sin(t * 10 + rec.phase)) * 0.03;
      } else if (!rec.lying) n.position.y = 0.15;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /** Back to the starting view of the whole home. */
  recenter(): void {
    // A tall phone screen sees less across, so start further back to fit the whole home.
    const k = this.camera.aspect < 1 ? Math.min(2, 1.25 / this.camera.aspect) : 1;
    this.controls.target.copy(this.centre);
    this.camera.position.set(this.centre.x + 16 * k, 18 * k, this.centre.z + 22 * k);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.resize.disconnect();
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && m.geometry !== BOX && m.geometry !== CYL && m.geometry !== SPH) m.geometry.dispose();
      const sp = o as THREE.Sprite;
      if (sp.isSprite) {
        sp.material.map?.dispose();
        sp.material.dispose();
      }
    });
    this.mats.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
