import { Application, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { DECOR_SPRITE, EQUIP_SPRITE, ROOM_BADGE, PERSON_SPRITE_WIDTH, loadSpriteTextures } from './sprites';
import { WORLD_MARGIN, drawWorld, worldBounds } from './WorldBackdrop';
import { Ambience } from './Ambience';
import { EQUIPMENT, ROOMS } from '../data/rooms';
import { cellIndex } from '../domain/grid';
import type { RoomStatus } from '../domain/rules/rooms';
import type { Cell, EquipmentId, GameState, Room, RoomType } from '../domain/types';
import { cellCenter, cellDiamond, cellToWorld, TILE_H, TILE_W, worldToCell } from './iso';

/**
 * Rendering layer. Reads game state, never mutates it. All gameplay decisions
 * happen in the sim; this class only draws and reports pointer cells back.
 */

/** A person to draw. Positions are resolved by the renderer from room layout. */
export interface PersonMarker {
  key: string;
  kind: 'resident' | 'staff';
  color: number;
  roomId: string | null;
  /** Bed index (residents, or staff working at that resident's bed). */
  bed?: number;
  /** Spot index for idle staff inside a room. */
  spot?: number;
  /** Standing sprite (staff); falls back to the vector figure when missing. */
  sprite?: string;
}

export interface RenderInput {
  people: PersonMarker[];
  game: GameState;
  statuses: Map<string, RoomStatus>;
  labelFor: (room: Room) => string;
  entranceLabel: string;
  selectedRoomId: string | null;
  hover: Cell | null;
  preview: { cells: Cell[]; valid: boolean } | null;
  /** Tutorial: suggested tiles to build on or tap. */
  hint?: Cell[] | null;
  hoverTint: 'neutral' | 'danger';
  leftDragPans: boolean;
  /** Sign on the plot for sale next door, or null when there is none. */
  sale: { toX: number; label: string } | null;
  /** Room name pills on the map (the layers button hides them). Default on. */
  showLabels?: boolean;
  /** Exterior view: finished buildings with roofs, no interiors or people. */
  exterior?: boolean;
  /** 'low' turns off moving effects (clouds, petals, puffs, walking) for slow phones. Default high. */
  effects?: 'high' | 'low';
}

export interface RendererCallbacks {
  onHover: (cell: Cell | null) => void;
  onClick: (cell: Cell) => void;
  onDragStart: (cell: Cell) => void;
  onDragMove: (cell: Cell) => void;
  onDragEnd: () => void;
  /** A second finger landed: abandon the build drag without placing anything. */
  onDragCancel: () => void;
}

const WALL_H = 26;
const FRONT_WALL_H = 6;
const SLAB_DEPTH = 14;
/** Exterior view: storey height of a finished building, and the room types that get a pitched roof. */
const STOREY_H = 46;
const PITCHED: ReadonlySet<RoomType> = new Set<RoomType>(['ward', 'villa', 'staff_room', 'dining_room']);
const FONT = '"IBM Plex Sans Thai", "Noto Sans Thai", "Leelawadee UI", Tahoma, sans-serif';

/** Blend two colours: t = 0 gives a, t = 1 gives b. */
function mix(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 255;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return m(16) | m(8) | m(0);
}

function shade(color: number, f: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((color >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((color >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((color & 255) * f)));
  return (r << 16) | (g << 8) | b;
}

interface PropStyle {
  s: number; // footprint scale relative to tile
  h: number; // height px
}
const PROP: Record<EquipmentId, PropStyle> = {
  care_bed: { s: 0.62, h: 9 },
  call_system: { s: 0.22, h: 22 },
  med_cart: { s: 0.34, h: 16 },
  nurse_desk: { s: 0.66, h: 14 },
  exercise_mat: { s: 0.7, h: 3 },
  parallel_bars: { s: 0.6, h: 18 },
  lockers: { s: 0.4, h: 28 },
  rest_sofa: { s: 0.6, h: 10 },
  door_sensor: { s: 0.2, h: 20 },
  feeding_pump: { s: 0.25, h: 18 },
  suction_unit: { s: 0.3, h: 18 },
  care_van: { s: 0.85, h: 22 },
  training_manikin: { s: 0.5, h: 7 },
  whiteboard: { s: 0.5, h: 26 },
  exam_desk: { s: 0.62, h: 13 },
  waiting_chairs: { s: 0.55, h: 9 },
  vital_monitor: { s: 0.24, h: 22 },
  medicine_shelf: { s: 0.4, h: 26 },
  dining_table: { s: 0.6, h: 10 },
  washer: { s: 0.42, h: 18 },
  reception_desk: { s: 0.7, h: 14 },
  storage_rack: { s: 0.4, h: 28 },
  bath_set: { s: 0.4, h: 12 },
  office_desk: { s: 0.55, h: 14 },
};

export class IsoRenderer {
  private app = new Application();
  private world = new Container();
  private backdropLayer = new Container();
  private lastBackdrop = '';
  private carsLayer = new Container();
  private cars: Array<{ g: Graphics; x: number; speed: number; row: number }> = [];
  private amb = new Ambience();
  /** Staff figures that walk to where they are needed instead of jumping there. */
  private walkers = new Map<string, { node: Container; body: Sprite; x: number; y: number; tx: number; ty: number; phase: number; sprite: string }>();
  private clock = 0;
  /** Smallest zoom at which the town still covers the whole screen. */
  private minScale = 0.2;
  private staticLayer = new Container();
  private overlay = new Graphics();
  private labelLayer = new Container();
  private labelScale = 1;
  private peopleLayer = new Container();
  private peopleShapes = new Graphics();
  private lastPeople = '';
  /** Per room: cells holding beds (in bed order) and free floor cells, for placing people. */
  private roomCells = new Map<string, { beds: Cell[]; free: Cell[] }>();
  private ready = false;
  private tex = new Map<string, Texture>();
  private destroyed = false;
  private lastSite: GameState['site'] | null = null;
  private lastStatic = '';
  private input: RenderInput | null = null;
  private onWheel = (e: WheelEvent) => this.handleWheel(e);
  private onContext = (e: Event) => e.preventDefault();
  private resizeObserver: ResizeObserver | null = null;

  // pointer state
  /** Active touch points, for two-finger pinch-zoom and pan. */
  private touches = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; midX: number; midY: number; scale: number; wx: number; wy: number } | null = null;
  private pointer: { mode: 'none' | 'pan' | 'maybe-click' | 'drag' | 'pinch'; button: number; sx: number; sy: number; wx: number; wy: number } = {
    mode: 'none',
    button: 0,
    sx: 0,
    sy: 0,
    wx: 0,
    wy: 0,
  };
  private lastHover: string = '';
  /** Once the player pans/zooms we stop auto-fitting the camera on resize. */
  private userMovedCamera = false;

  constructor(private callbacks: RendererCallbacks) {}

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: 0x8ea86b,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    this.tex = await loadSpriteTextures();
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }
    host.appendChild(this.app.canvas);
    this.app.canvas.style.display = 'block';
    this.app.canvas.style.touchAction = 'none';
    this.peopleLayer.sortableChildren = true;
    this.world.addChild(this.backdropLayer, this.staticLayer, this.carsLayer, this.overlay, this.peopleLayer, this.amb.worldFx, this.labelLayer);
    this.app.stage.addChild(this.world, this.amb.tint, this.amb.lights, this.amb.screenFx);
    this.app.ticker.add((tk) => {
      this.driveCars(tk.deltaMS);
      this.syncLabelScale();
      this.walk(tk.deltaMS);
      // The glows live in world space but sit above the screen tint, so they follow the camera here.
      this.amb.lights.position.copyFrom(this.world.position);
      this.amb.lights.scale.copyFrom(this.world.scale);
      this.amb.tick(tk.deltaMS, !!this.input?.game.speed, this.app.screen);
    });
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on('pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        this.touches.set(e.pointerId, { x: e.global.x, y: e.global.y });
        if (this.touches.size >= 2) return this.startPinch();
      }
      this.handleDown(e.global.x, e.global.y, e.button);
    });
    this.app.stage.on('pointermove', (e) => {
      if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
        this.touches.set(e.pointerId, { x: e.global.x, y: e.global.y });
        if (this.pointer.mode === 'pinch') return this.movePinch();
      }
      this.handleMove(e.global.x, e.global.y);
    });
    const up = (e: { pointerType: string; pointerId: number }) => {
      if (e.pointerType === 'touch') {
        this.touches.delete(e.pointerId);
        if (this.pointer.mode === 'pinch') {
          // Wait until every finger is lifted before accepting new gestures.
          if (this.touches.size === 0) this.pointer.mode = 'none';
          return;
        }
      }
      this.handleUp();
    };
    this.app.stage.on('pointerup', up);
    this.app.stage.on('pointerupoutside', up);
    this.app.stage.on('pointercancel', up);
    this.app.stage.on('pointerleave', () => {
      if (this.pointer.mode === 'none') this.emitHover(null);
    });
    this.app.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.app.canvas.addEventListener('contextmenu', this.onContext);
    this.app.renderer.on('resize', () => {
      this.updateMinScale();
      if (this.input) this.amb.drawTint(this.input.game.minute, this.app.screen.width, this.app.screen.height);
      if (!this.userMovedCamera) this.recenter();
    });
    // resizeTo only listens to window resizes; also follow the host element (phone layouts settle late).
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.ready) return;
      this.app.resize();
    });
    this.resizeObserver.observe(host);
    this.ready = true;
    this.recenter();
    if (this.input) this.update(this.input);
  }

  destroy(): void {
    this.destroyed = true;
    if (!this.ready) return;
    this.resizeObserver?.disconnect();
    this.app.canvas.removeEventListener('wheel', this.onWheel);
    this.app.canvas.removeEventListener('contextmenu', this.onContext);
    this.app.destroy(true, { children: true });
    this.ready = false;
  }

  // ---------- camera ----------
  recenter(): void {
    this.userMovedCamera = false;
    if (!this.ready || !this.input) {
      if (this.ready) this.fitTo(20, 20);
      return;
    }
    this.fitTo(this.input.game.site.width, this.input.game.site.height);
  }

  private fitTo(w: number, h: number): void {
    const lotW = (w + h) * (TILE_W / 2);
    const worldW = lotW + 80;
    const worldH = (w + h) * (TILE_H / 2) + 140;
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    this.updateMinScale();
    // Portrait phones: the lot spans the full screen width (its side corners crop slightly);
    // wider screens show the whole lot with a little of the town around it.
    let scale = sh > sw * 1.2 ? (sw / lotW) * 1.12 : Math.min(sw / worldW, sh / worldH) * 1.08;
    scale = Math.max(this.minScale, Math.min(2.2, scale));
    this.world.scale.set(scale);
    const centre = cellToWorld(w / 2, h / 2);
    this.world.position.set(sw / 2 - centre.x * scale, sh / 2 - centre.y * scale + 10 * scale);
  }

  /** Screen-space (canvas CSS px) centre of a cell — used by automated UI tests. */
  cellToScreen(cell: Cell): { x: number; y: number } {
    const c = cellCenter(cell.x, cell.y);
    return { x: this.world.x + c.x * this.world.scale.x, y: this.world.y + c.y * this.world.scale.y };
  }

  zoomBy(factor: number, sx = this.app.screen.width / 2, sy = this.app.screen.height / 2): void {
    if (!this.ready) return;
    this.userMovedCamera = true;
    const old = this.world.scale.x;
    const next = Math.max(this.minScale, Math.min(3, old * factor));
    const wx = (sx - this.world.x) / old;
    const wy = (sy - this.world.y) / old;
    this.world.scale.set(next);
    this.world.position.set(sx - wx * next, sy - wy * next);
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.app.canvas.getBoundingClientRect();
    this.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top);
  }

  // ---------- touch gestures ----------
  private startPinch(): void {
    if (this.pointer.mode === 'drag') this.callbacks.onDragCancel();
    const [a, b] = [...this.touches.values()];
    this.pointer.mode = 'pinch';
    this.pinch = {
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
      scale: this.world.scale.x,
      wx: this.world.x,
      wy: this.world.y,
    };
  }

  private movePinch(): void {
    const pz = this.pinch;
    if (!pz || this.touches.size < 2) return;
    const [a, b] = [...this.touches.values()];
    const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const next = Math.max(this.minScale, Math.min(3, (pz.scale * dist) / pz.dist));
    // Keep the world point under the starting midpoint under the fingers' current midpoint.
    const worldX = (pz.midX - pz.wx) / pz.scale;
    const worldY = (pz.midY - pz.wy) / pz.scale;
    this.world.scale.set(next);
    this.world.position.set(midX - worldX * next, midY - worldY * next);
    this.userMovedCamera = true;
  }

  // ---------- pointer ----------
  private screenToCell(sx: number, sy: number): Cell | null {
    if (!this.input) return null;
    const wx = (sx - this.world.x) / this.world.scale.x;
    const wy = (sy - this.world.y) / this.world.scale.y;
    const c = worldToCell(wx, wy);
    const { width, height } = this.input.game.site;
    if (c.x < 0 || c.y < 0 || c.x >= width || c.y >= height) return null;
    return c;
  }

  private emitHover(cell: Cell | null): void {
    const key = cell ? `${cell.x},${cell.y}` : '';
    if (key === this.lastHover) return;
    this.lastHover = key;
    this.callbacks.onHover(cell);
  }

  private handleDown(sx: number, sy: number, button: number): void {
    const p = this.pointer;
    p.button = button;
    p.sx = sx;
    p.sy = sy;
    p.wx = this.world.x;
    p.wy = this.world.y;
    if (button === 1 || button === 2 || (button === 0 && this.input?.leftDragPans)) {
      p.mode = button === 0 ? 'maybe-click' : 'pan';
      return;
    }
    if (button === 0) {
      const cell = this.screenToCell(sx, sy);
      if (!cell) {
        p.mode = 'pan';
        return;
      }
      p.mode = 'drag';
      this.callbacks.onDragStart(cell);
    }
  }

  private handleMove(sx: number, sy: number): void {
    const p = this.pointer;
    if (p.mode === 'maybe-click' && Math.hypot(sx - p.sx, sy - p.sy) > 5) p.mode = 'pan';
    if (p.mode === 'pan') {
      this.userMovedCamera = true;
      this.world.position.set(p.wx + (sx - p.sx), p.wy + (sy - p.sy));
      return;
    }
    const cell = this.screenToCell(sx, sy);
    this.emitHover(cell);
    if (p.mode === 'drag' && cell) this.callbacks.onDragMove(cell);
  }

  private handleUp(): void {
    const p = this.pointer;
    if (p.mode === 'maybe-click') {
      const cell = this.screenToCell(p.sx, p.sy);
      if (cell) this.callbacks.onClick(cell);
    } else if (p.mode === 'drag') {
      this.callbacks.onDragEnd();
    }
    p.mode = 'none';
  }

  /** Zooming out stops once the town spans the screen (the grass-coloured background fills its far corners). */
  private updateMinScale(): void {
    if (!this.input) return;
    const b = worldBounds(this.input.game.site, this.input.sale?.toX ?? null);
    const span = b.maxX - b.minX + (b.maxY - b.minY);
    const W = span * (TILE_W / 2);
    const H = span * (TILE_H / 2);
    this.minScale = Math.max(0.2, this.app.screen.width / W, this.app.screen.height / H);
  }

  /** Ambient traffic on the front street; it pauses with the game. */
  private driveCars(dtMs: number): void {
    if (!this.input || !this.cars.length) return;
    const speed = this.input.game.speed;
    if (!speed) return;
    const { site } = this.input.game;
    const east = (this.input.sale?.toX ?? site.width) + WORLD_MARGIN;
    for (const car of this.cars) {
      car.x += car.speed * speed * (dtMs / 1000);
      if (car.x > east) car.x = -WORLD_MARGIN;
      if (car.x < -WORLD_MARGIN) car.x = east;
      const c = cellCenter(car.x, car.row + 0.5);
      car.g.position.set(c.x, c.y + SLAB_DEPTH - TILE_H / 2);
    }
  }

  private makeCars(site: GameState['site']): void {
    for (const c of this.carsLayer.removeChildren()) c.destroy();
    const colors = [0xd9534f, 0x2f6aa5, 0xf2f2f2, 0x3f8f86, 0xe0a23b];
    this.cars = colors.map((color, i) => {
      const g = new Graphics();
      // a small iso car: body, roof and windows
      g.poly([-12, 0, 0, -6, 12, 0, 0, 6]).fill(shade(color, 0.7));
      g.poly([-12, 0, 0, 6, 0, 1, -12, -5]).fill(shade(color, 0.85));
      g.poly([0, 6, 12, 0, 12, -5, 0, 1]).fill(shade(color, 0.7));
      g.poly([-12, -5, 0, -11, 12, -5, 0, 1]).fill(color);
      g.poly([-6, -6, 0, -9, 6, -6, 0, -3]).fill({ color: 0x9cc3cf, alpha: 0.9 });
      this.carsLayer.addChild(g);
      return { g, x: -WORLD_MARGIN + i * 9, speed: (i % 2 ? -1 : 1) * (1.4 + (i % 3) * 0.5), row: site.height };
    });
  }

  // ---------- drawing ----------
  update(input: RenderInput): void {
    this.input = input;
    if (!this.ready) return;
    this.amb.setEffects(input.effects !== 'low');
    this.amb.drawTint(input.game.minute, this.app.screen.width, this.app.screen.height);
    this.labelLayer.visible = input.showLabels !== false;
    this.peopleLayer.visible = !input.exterior;
    const backdropKey = `${input.game.site.width}x${input.game.site.height}|${input.sale?.label ?? ''}|${this.tex.size}`;
    if (backdropKey !== this.lastBackdrop) {
      this.lastBackdrop = backdropKey;
      drawWorld(this.backdropLayer, input.game.site, { sale: input.sale ? { fromX: input.game.site.width, toX: input.sale.toX, label: input.sale.label } : null, textures: this.tex });
      this.makeCars(input.game.site);
      this.updateMinScale();
      const b = worldBounds(input.game.site, input.sale?.toX ?? null);
      const pts = [cellToWorld(b.minX, b.minY), cellToWorld(b.maxX, b.minY), cellToWorld(b.maxX, b.maxY), cellToWorld(b.minX, b.maxY)];
      this.amb.setBounds({ minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)), maxY: Math.max(...pts.map((p) => p.y)) });
    }
    const staticKey = `${input.labelFor({ id: '', type: 'ward', rect: { x: 0, y: 0, w: 1, h: 1 }, equipment: {}, builtAt: 0 })}|${input.entranceLabel}|${input.exterior ? 'ext' : 'int'}`;
    if (input.game.site !== this.lastSite || staticKey !== this.lastStatic) {
      this.lastSite = input.game.site;
      this.lastStatic = staticKey;
      this.drawStatic(input);
      this.amb.drawLights(input.game.site);
      this.amb.noticeRooms(input.game.site.rooms);
      this.lastPeople = '';
    }
    this.drawOverlay(input);
    this.drawPeople(input.people);
  }

  private drawStatic(input: RenderInput): void {
    const { site } = input.game;
    for (const c of this.staticLayer.removeChildren()) c.destroy({ children: true });
    for (const c of this.labelLayer.removeChildren()) c.destroy({ children: true });
    this.roomCells.clear();

    const g = new Graphics();
    this.staticLayer.addChild(g);

    // Lot slab sides
    const T = cellToWorld(0, 0);
    const R = cellToWorld(site.width, 0);
    const B = cellToWorld(site.width, site.height);
    const L = cellToWorld(0, site.height);
    g.poly([L.x, L.y, B.x, B.y, B.x, B.y + SLAB_DEPTH, L.x, L.y + SLAB_DEPTH]).fill(0x8f9a6e);
    g.poly([B.x, B.y, R.x, R.y, R.x, R.y + SLAB_DEPTH, B.x, B.y + SLAB_DEPTH]).fill(0x7a845c);
    void T;

    // The street, the town and the plot for sale are drawn by the world backdrop.

    // Ground tiles
    for (let y = 0; y < site.height; y++)
      for (let x = 0; x < site.width; x++) {
        const corridor = site.corridor[cellIndex(x, y, site.width)];
        const color = corridor ? ((x + y) % 2 ? 0xf3ede0 : 0xeee6d5) : (x + y) % 2 ? 0xa9bf86 : 0xa2b97f;
        g.poly(cellDiamond(x, y)).fill(color).stroke({ width: 1, color: corridor ? 0xd8cdb6 : 0x93aa71, alpha: 0.7 });
      }

    // A low white fence around the lot, with a gap at the entrance, so the home reads apart from the town.
    const fence = new Graphics();
    const corners = [cellToWorld(0, 0), cellToWorld(site.width, 0), cellToWorld(site.width, site.height), cellToWorld(0, site.height)];
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      fence.moveTo(a.x, a.y - 5).lineTo(b.x, b.y - 5);
    }
    fence.stroke({ width: 2.5, color: 0xfbf8f2, alpha: 0.95 });
    for (let x = 0; x <= site.width; x += 2) for (const yy of [0, site.height]) {
      const p = cellToWorld(x, yy);
      fence.rect(p.x - 1.2, p.y - 8, 2.4, 8).fill(0xfbf8f2);
    }
    for (let y = 0; y <= site.height; y += 2) for (const xx of [0, site.width]) {
      const p = cellToWorld(xx, y);
      fence.rect(p.x - 1.2, p.y - 8, 2.4, 8).fill(0xfbf8f2);
    }
    // keep the gate open
    const gateL = cellToWorld(site.entrance.x, site.height);
    const gateR = cellToWorld(site.entrance.x + 1, site.height);
    fence.moveTo(gateL.x, gateL.y - 5).lineTo(gateR.x, gateR.y - 5).stroke({ width: 4, color: 0xf6d58e });
    this.staticLayer.addChild(fence);

    // Entrance gate
    const e = site.entrance;
    const ec = cellCenter(e.x, e.y);
    g.poly(cellDiamond(e.x, e.y)).fill(0xf6d58e).stroke({ width: 1.5, color: 0xc9953a });
    const gl = cellToWorld(e.x, e.y + 1);
    const gr = cellToWorld(e.x + 1, e.y + 1);
    g.rect(gl.x - 3, gl.y - 34, 6, 34).fill(0x2f4f4a);
    g.rect(gr.x - 3, gr.y - 34, 6, 34).fill(0x2f4f4a);
    g.poly([gl.x - 4, gl.y - 38, gr.x + 4, gr.y - 38, gr.x + 4, gr.y - 30, gl.x - 4, gl.y - 30]).fill(0xe0614b);
    this.addLabel(input.entranceLabel, ec.x, ec.y - 52, 0xe0614b, true);

    // Entrance sign on the street, from the asset pack
    const signAt = cellCenter(site.entrance.x - 1.6, site.height + 0.2);
    this.placeSprite('dc_sign', signAt.x, signAt.y + SLAB_DEPTH, 104, 0.9);

    // Rooms and garden items, back to front (painter's order by their front-most tile)
    const items: Array<{ key: number; draw: () => void }> = [];
    for (const room of site.rooms)
      items.push({ key: room.rect.x + room.rect.w - 1 + room.rect.y + room.rect.h - 1, draw: () => (input.exterior ? this.drawBuilding(room, input.statuses.get(room.id), input.labelFor(room)) : this.drawRoom(room, input.statuses.get(room.id), input.labelFor(room))) });
    for (const d of site.decor ?? [])
      items.push({
        key: d.cell.x + d.cell.y + 0.5,
        draw: () => {
          const c = cellCenter(d.cell.x, d.cell.y);
          const spec = DECOR_SPRITE[d.type];
          const g2 = new Graphics().ellipse(c.x, c.y + 4, spec.width * 0.32, spec.width * 0.12).fill({ color: 0x000000, alpha: 0.12 });
          this.staticLayer.addChild(g2);
          if (!this.placeSprite(spec.name, c.x, c.y + 8, spec.width, 0.92)) g2.circle(c.x, c.y - 10, 10).fill(0x6c9f4e);
        },
      });
    items.sort((a, b) => a.key - b.key);
    for (const it of items) it.draw();
  }

  private drawRoom(room: Room, status: RoomStatus | undefined, label: string): void {
    const def = ROOMS[room.type];
    const g = new Graphics();
    this.staticLayer.addChild(g);
    const { x, y, w, h } = room.rect;
    const door = status?.door ?? null;
    const wall = def.wallColor;

    // floor
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++)
        g.poly(cellDiamond(i, j)).fill((i + j) % 2 ? def.floorColor : shade(def.floorColor, 0.96)).stroke({ width: 1, color: shade(def.floorColor, 0.88) });
    if (door) g.poly(cellDiamond(door.inside.x, door.inside.y)).fill(shade(def.floorColor, 0.82));
    // GDD §4: show problems as colour on the map — non-operational rooms get a red wash
    if (status && !status.operational) {
      const pts = [cellToWorld(x, y), cellToWorld(x + w, y), cellToWorld(x + w, y + h), cellToWorld(x, y + h)];
      g.poly(pts.flatMap((p) => [p.x, p.y])).fill({ color: 0xe5484d, alpha: 0.22 });
    }

    const isDoor = (inside: Cell, outside: Cell) =>
      !!door && door.inside.x === inside.x && door.inside.y === inside.y && door.outside.x === outside.x && door.outside.y === outside.y;
    const seg = (ax: number, ay: number, bx: number, by: number, height: number, color: number) => {
      const a = cellToWorld(ax, ay);
      const b = cellToWorld(bx, by);
      g.poly([a.x, a.y, b.x, b.y, b.x, b.y - height, a.x, a.y - height]).fill(color);
      g.poly([a.x, a.y - height, b.x, b.y - height]).stroke({ width: 2, color: shade(color, 1.25) });
    };

    // back walls: edge y = y (runs along x) faces the viewer's left; edge x = x faces right
    for (let i = 0; i < w; i++)
      if (!isDoor({ x: x + i, y }, { x: x + i, y: y - 1 })) seg(x + i, y, x + i + 1, y, WALL_H, shade(wall, 1.05));
    for (let j = 0; j < h; j++)
      if (!isDoor({ x, y: y + j }, { x: x - 1, y: y + j })) seg(x, y + j, x, y + j + 1, WALL_H, shade(wall, 0.85));

    // equipment props spread across the floor, skipping the door tile
    const cells: Cell[] = [];
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (!door || door.inside.x !== i || door.inside.y !== j) cells.push({ x: i, y: j });
    const props: EquipmentId[] = [];
    for (const slot of def.equipment) for (let k = 0; k < (room.equipment[slot.id] ?? 0); k++) props.push(slot.id);
    const stride = props.length ? Math.max(1, Math.floor(cells.length / props.length)) : 1;
    const placed = props.map((id, k) => ({ id, cell: cells[Math.min(cells.length - 1, k * stride)] })).filter((p) => p.cell);
    const used = new Set(placed.map((p) => `${p.cell.x},${p.cell.y}`));
    this.roomCells.set(room.id, {
      beds: placed.filter((p) => p.id === 'care_bed').map((p) => p.cell),
      free: cells.filter((c) => !used.has(`${c.x},${c.y}`)),
    });
    placed.sort((a, b) => a.cell.x + a.cell.y - (b.cell.x + b.cell.y));
    const spriteProps: typeof placed = [];
    for (const p of placed) {
      if (EQUIP_SPRITE[p.id] && this.tex.has(EQUIP_SPRITE[p.id]!.name)) spriteProps.push(p);
      else this.drawProp(g, p.id, p.cell);
    }

    // front walls (low cutaway so the interior stays visible)
    for (let j = 0; j < h; j++)
      if (!isDoor({ x: x + w - 1, y: y + j }, { x: x + w, y: y + j })) seg(x + w, y + j, x + w, y + j + 1, FRONT_WALL_H, shade(wall, 0.75));
    for (let i = 0; i < w; i++)
      if (!isDoor({ x: x + i, y: y + h - 1 }, { x: x + i, y: y + h })) seg(x + i, y + h, x + i + 1, y + h, FRONT_WALL_H, shade(wall, 0.95));

    // equipment sprites go above the floor and low front walls
    for (const p of spriteProps) {
      const spec = EQUIP_SPRITE[p.id]!;
      const c0 = cellCenter(p.cell.x, p.cell.y);
      this.placeSprite(spec.name, c0.x, c0.y + 6, spec.width, 0.85);
    }

    // label
    const c = cellToWorld(x + w / 2, y + h / 2);
    const badge = ROOM_BADGE[room.type];
    if (status?.operational) this.addBadge(label, badge.glyph, c.x, c.y - WALL_H - 14, badge.color);
    else this.addBadge(`⚠ ${label}`, null, c.x, c.y - WALL_H - 14, 0xc0392b);
  }

  /**
   * Exterior view: the room as a finished building seen from above. Walls on the two faces toward
   * the viewer with windows and the front door, then a roof (pitched for homes, flat with rooftop
   * units for clinical and service rooms). People and interiors are hidden in this view.
   */
  private drawBuilding(room: Room, status: RoomStatus | undefined, label: string): void {
    const def = ROOMS[room.type];
    const g = new Graphics();
    this.staticLayer.addChild(g);
    const { x, y, w, h } = room.rect;
    const H = STOREY_H;
    const up = (p: { x: number; y: number }, z: number) => ({ x: p.x, y: p.y - z });
    const T = cellToWorld(x, y);
    const R = cellToWorld(x + w, y);
    const B = cellToWorld(x + w, y + h);
    const L = cellToWorld(x, y + h);
    // Cream walls tinted a little toward the room's colour.
    const wallColor = mix(0xf6f1e7, def.wallColor, 0.18);
    // soft shadow to the front-right
    g.poly([L.x, L.y, B.x, B.y, R.x, R.y, R.x + 18, R.y + 9, B.x + 18, B.y + 9, L.x + 18, L.y + 9]).fill({ color: 0x000000, alpha: 0.1 });
    // front-left face (edge y + h) and front-right face (edge x + w)
    const face = (a: { x: number; y: number }, b: { x: number; y: number }, color: number) => {
      const a1 = up(a, H);
      const b1 = up(b, H);
      g.poly([a.x, a.y, b.x, b.y, b1.x, b1.y, a1.x, a1.y]).fill(color);
      // a plinth and a band under the roof in the room's own colour
      g.poly([a.x, a.y, b.x, b.y, b.x, b.y - 4, a.x, a.y - 4]).fill(shade(color, 0.8));
      g.poly([a1.x, a1.y + 6, b1.x, b1.y + 6, b1.x, b1.y, a1.x, a1.y]).fill(shade(def.wallColor, 0.95));
    };
    face(L, B, shade(wallColor, 0.97));
    face(B, R, shade(wallColor, 0.84));
    // windows: one per tile along each face, skipping the door tile
    const door = status?.door ?? null;
    const win = (a: { x: number; y: number }, b: { x: number; y: number }, n: number, skip: number, dark: number) => {
      for (let i = 0; i < n; i++) {
        const f0 = (i + 0.25) / n;
        const f1 = (i + 0.75) / n;
        const p0 = { x: a.x + (b.x - a.x) * f0, y: a.y + (b.y - a.y) * f0 };
        const p1 = { x: a.x + (b.x - a.x) * f1, y: a.y + (b.y - a.y) * f1 };
        if (i === skip) {
          // the front door with a small canopy
          g.poly([p0.x, p0.y - 2, p1.x, p1.y - 2, p1.x, p1.y - 24, p0.x, p0.y - 24]).fill(0x7a5236);
          g.poly([p0.x - 3, p0.y - 26, p1.x + 3, p1.y - 26, p1.x + 3, p1.y - 30, p0.x - 3, p0.y - 30]).fill(shade(def.wallColor, 1.1));
          continue;
        }
        g.poly([p0.x, p0.y - 14, p1.x, p1.y - 14, p1.x, p1.y - 32, p0.x, p0.y - 32]).fill({ color: dark, alpha: 0.9 });
        g.poly([p0.x, p0.y - 23, p1.x, p1.y - 23]).stroke({ width: 1, color: 0xffffff, alpha: 0.6 });
      }
    };
    const doorLeft = door && door.outside.y === y + h ? door.inside.x - x : -1;
    const doorRight = door && door.outside.x === x + w ? door.inside.y - y : -1;
    win(L, B, w, doorLeft, 0x8fbccc);
    win(B, R, h, doorRight, 0x76a6b8);
    const [t1, r1, b1, l1] = [up(T, H), up(R, H), up(B, H), up(L, H)];
    if (PITCHED.has(room.type)) {
      // pitched tile roof, ridge along the longer side, with eaves
      const roof = room.type === 'villa' ? 0x9c5a3c : room.type === 'ward' ? 0xc0634a : shade(def.wallColor, 0.9);
      const ridge = 14 + Math.min(w, h) * 5;
      const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - ridge });
      const alongX = w >= h;
      const k1 = alongX ? mid(t1, l1) : mid(t1, r1);
      const k2 = alongX ? mid(r1, b1) : mid(l1, b1);
      if (alongX) {
        g.poly([t1.x, t1.y, r1.x, r1.y, k2.x, k2.y, k1.x, k1.y]).fill(shade(roof, 1.1));
        g.poly([l1.x, l1.y, b1.x, b1.y, k2.x, k2.y, k1.x, k1.y]).fill(roof);
        g.poly([b1.x, b1.y, r1.x, r1.y, k2.x, k2.y]).fill(shade(wallColor, 0.8));
      } else {
        g.poly([t1.x, t1.y, l1.x, l1.y, k2.x, k2.y, k1.x, k1.y]).fill(shade(roof, 1.1));
        g.poly([r1.x, r1.y, b1.x, b1.y, k2.x, k2.y, k1.x, k1.y]).fill(shade(roof, 0.85));
        g.poly([l1.x, l1.y, b1.x, b1.y, k2.x, k2.y]).fill(shade(wallColor, 0.92));
      }
      g.moveTo(k1.x, k1.y).lineTo(k2.x, k2.y).stroke({ width: 2, color: shade(roof, 0.7) });
    } else {
      // flat roof with a parapet and rooftop units
      g.poly([t1.x, t1.y, r1.x, r1.y, b1.x, b1.y, l1.x, l1.y]).fill(0xd9dcd6).stroke({ width: 3, color: shade(def.wallColor, 0.95) });
      const inset = (p: { x: number; y: number }, k: number) => ({ x: p.x + ((t1.x + b1.x) / 2 - p.x) * k, y: p.y + ((t1.y + b1.y) / 2 - p.y) * k });
      const [ti, ri, bi, li] = [inset(t1, 0.12), inset(r1, 0.12), inset(b1, 0.12), inset(l1, 0.12)];
      g.poly([ti.x, ti.y, ri.x, ri.y, bi.x, bi.y, li.x, li.y]).fill(0xc9cdc6);
      const units = Math.max(1, Math.min(3, Math.floor((w * h) / 4)));
      for (let k = 0; k < units; k++) {
        const c = cellToWorld(x + w * (units === 1 ? 0.5 : 0.28 + (0.44 * k) / (units - 1)), y + h * 0.4);
        const cx = c.x;
        const cy = c.y - H;
        g.poly([cx - 9, cy, cx, cy + 4.5, cx + 9, cy, cx, cy - 4.5]).fill(0xf2f2ee);
        g.poly([cx - 9, cy, cx, cy + 4.5, cx, cy + 10.5, cx - 9, cy + 6]).fill(0xbfc3bd);
        g.poly([cx, cy + 4.5, cx + 9, cy, cx + 9, cy + 6, cx, cy + 10.5]).fill(0xa8aca6);
      }
      // a sign band in the room colour on the front face
      const s0 = { x: L.x + (B.x - L.x) * 0.2, y: L.y + (B.y - L.y) * 0.2 - H + 6 };
      const s1 = { x: L.x + (B.x - L.x) * 0.8, y: L.y + (B.y - L.y) * 0.8 - H + 6 };
      g.poly([s0.x, s0.y + 2, s1.x, s1.y + 2, s1.x, s1.y - 7, s0.x, s0.y - 7]).fill(def.wallColor);
    }
    if (status && !status.operational) g.poly([t1.x, t1.y, r1.x, r1.y, b1.x, b1.y, l1.x, l1.y]).fill({ color: 0xe5484d, alpha: 0.25 });
    const c = cellToWorld(x + w / 2, y + h / 2);
    const badge = ROOM_BADGE[room.type];
    const top = c.y - H - (PITCHED.has(room.type) ? 26 + Math.min(w, h) * 5 : 18);
    if (status?.operational) this.addBadge(label, badge.glyph, c.x, top, badge.color);
    else this.addBadge(`⚠ ${label}`, null, c.x, top, 0xc0392b);
  }

  /** Place a sprite with its base at a world point; width in world px. */
  private placeSprite(name: string, x: number, y: number, width: number, anchorY = 0.85): boolean {
    const t = this.tex.get(name);
    if (!t) return false;
    const sp = new Sprite(t);
    sp.anchor.set(0.5, anchorY);
    sp.scale.set(width / t.width);
    sp.position.set(x, y);
    this.staticLayer.addChild(sp);
    return true;
  }

  private drawPeople(people: PersonMarker[]): void {
    const key = people.map((p) => `${p.key}:${p.roomId}:${p.bed ?? ''}:${p.spot ?? ''}`).join('|');
    if (key === this.lastPeople) return;
    this.lastPeople = key;
    const g = this.peopleShapes;
    g.clear();
    const keep = new Set<string>();
    if (g.parent !== this.peopleLayer) this.peopleLayer.addChild(g);
    const items: Array<{ x: number; y: number; p: PersonMarker }> = [];
    for (const p of people) {
      const rc = p.roomId ? this.roomCells.get(p.roomId) : undefined;
      let cell: Cell | undefined;
      if (rc && p.bed !== undefined) cell = rc.beds[p.bed] ?? rc.free[p.bed % Math.max(1, rc.free.length)];
      else if (rc && p.spot !== undefined) cell = rc.free.length ? rc.free[p.spot % rc.free.length] : rc.beds[0];
      if (!cell) continue;
      const c = cellCenter(cell.x, cell.y);
      // Staff working at a bed stand beside it; several idle staff on one tile fan out.
      const fan = p.kind === 'staff' && p.spot !== undefined && rc ? Math.floor(p.spot / Math.max(1, rc.free.length)) : 0;
      const dx = p.kind === 'staff' ? (p.bed !== undefined ? 18 : -8 + fan * 14) : 0;
      const dy = p.kind === 'staff' ? (p.bed !== undefined ? 6 : 2 + fan * 4) : 0;
      items.push({ x: c.x + dx, y: c.y + dy, p });
    }
    items.sort((a, b) => a.y - b.y);
    const snap = this.input?.effects === 'low';
    for (const { x, y, p } of items) {
      if (p.kind === 'resident') {
        // Lying in bed: head on the pillow, blanket in the care-group colour.
        g.ellipse(x + 1, y - 9, 13, 6.5).fill({ color: p.color, alpha: 0.95 }).stroke({ width: 1, color: shade(p.color, 0.7) });
        g.circle(x - 12, y - 14, 6).fill(0xf1c9a5).stroke({ width: 1.2, color: 0x9b7653 });
        g.ellipse(x - 12, y - 18.5, 6, 3).fill(0xe2ddd4);
      } else if (p.sprite && this.tex.has(p.sprite)) {
        // A walker: role-coloured ground ring and the character, moving together to the new spot.
        keep.add(p.key);
        const w = this.walkers.get(p.key);
        if (w && w.sprite === p.sprite) {
          w.tx = x;
          w.ty = y;
          if (snap) (w.x = x), (w.y = y);
          continue;
        }
        if (w) w.node.destroy({ children: true });
        const node = new Container();
        node.addChild(new Graphics().ellipse(0, 0, 11, 5).fill({ color: p.color, alpha: 0.45 }).stroke({ width: 1.2, color: shade(p.color, 0.7), alpha: 0.8 }));
        const t = this.tex.get(p.sprite)!;
        const body = new Sprite(t);
        body.anchor.set(0.5, 0.97);
        body.scale.set(PERSON_SPRITE_WIDTH / t.width);
        body.position.set(0, 1);
        node.addChild(body);
        node.position.set(x, y);
        node.zIndex = y;
        this.peopleLayer.addChild(node);
        this.walkers.set(p.key, { node, body, x, y, tx: x, ty: y, phase: (p.key.length * 1.7 + x * 0.01) % 6.28, sprite: p.sprite });
      } else {
        g.ellipse(x, y, 10, 4.5).fill({ color: 0x000000, alpha: 0.2 });
        g.roundRect(x - 7, y - 25, 14, 24, 6).fill(p.color).stroke({ width: 1.2, color: shade(p.color, 0.65) });
        g.rect(x - 7, y - 25, 14, 4).fill({ color: 0xffffff, alpha: 0.35 });
        g.circle(x, y - 31, 6.5).fill(0xf1c9a5).stroke({ width: 1.2, color: 0x9b7653 });
        g.ellipse(x, y - 35, 6.4, 3.2).fill(0x2b2522);
      }
    }
    for (const [k, w] of this.walkers)
      if (!keep.has(k)) {
        w.node.destroy({ children: true });
        this.walkers.delete(k);
      }
  }

  /** Walkers head for their spot (within about a second) with a little step bounce; idle ones breathe. */
  private walk(dtMs: number): void {
    const dt = Math.min(0.1, dtMs / 1000);
    this.clock += dt;
    const still = this.input?.effects === 'low';
    for (const w of this.walkers.values()) {
      const dx = w.tx - w.x;
      const dy = w.ty - w.y;
      const dist = Math.hypot(dx, dy);
      let moving = false;
      if (dist > 0.5 && !still) {
        const step = Math.max(110, dist / 1.1) * dt;
        if (step >= dist) (w.x = w.tx), (w.y = w.ty);
        else (w.x += (dx / dist) * step), (w.y += (dy / dist) * step), (moving = true);
        w.body.scale.x = Math.abs(w.body.scale.x) * (dx < -0.5 ? -1 : 1);
      } else (w.x = w.tx), (w.y = w.ty);
      w.node.position.set(w.x, w.y);
      w.node.zIndex = w.y;
      w.body.y = still ? 1 : moving ? 1 - Math.abs(Math.sin(this.clock * 13 + w.phase)) * 3 : 1 - (Math.sin(this.clock * 2.2 + w.phase) + 1) * 0.35;
    }
  }

  private drawProp(g: Graphics, id: EquipmentId, cell: Cell): void {
    const st = PROP[id];
    const color = EQUIPMENT[id].color;
    const c = cellCenter(cell.x, cell.y);
    const hw = (TILE_W / 2) * st.s;
    const hh = (TILE_H / 2) * st.s;
    const top = [c.x, c.y - hh - st.h, c.x + hw, c.y - st.h, c.x, c.y + hh - st.h, c.x - hw, c.y - st.h];
    g.poly([c.x - hw, c.y, c.x, c.y + hh, c.x, c.y + hh - st.h, c.x - hw, c.y - st.h]).fill(shade(color, 0.78));
    g.poly([c.x, c.y + hh, c.x + hw, c.y, c.x + hw, c.y - st.h, c.x, c.y + hh - st.h]).fill(shade(color, 0.62));
    g.poly(top).fill(color).stroke({ width: 1, color: shade(color, 0.55), alpha: 0.6 });
    if (id === 'care_bed') {
      // blanket + pillow
      // blanket over the foot half, pillow at the head
      const z = c.y - st.h;
      g.poly([c.x, z - hh * 0.0, c.x + hw, z, c.x, z + hh, c.x - hw * 0.0, z]).fill({ color: 0x5aa39a, alpha: 0.9 });
      g.ellipse(c.x - hw * 0.45, z - hh * 0.15, 6, 3.5).fill(0xffffff).stroke({ width: 1, color: 0xcfd6d4 });
    }
  }

  /** Keep room pills readable when zoomed out: never smaller on screen than at 60% zoom. */
  private syncLabelScale(): void {
    const k = Math.max(1, 0.6 / this.world.scale.x);
    if (Math.abs(k - this.labelScale) < 0.01) return;
    this.labelScale = k;
    for (const c of this.labelLayer.children) c.scale.set(k);
  }

  /** Room name pill: coloured, white-edged, with the room's glyph on the left (concept-art style). */
  private addBadge(text: string, glyph: string | null, x: number, y: number, color: number): void {
    const t = new Text({ text, style: { fontFamily: FONT, fontSize: 15, fontWeight: '700', fill: 0xffffff }, resolution: 3 });
    t.anchor.set(0, 0.5);
    const tex = glyph ? this.tex.get(glyph) : undefined;
    const gh = 18;
    const gw = tex ? (tex.width / tex.height) * gh : 0;
    const padX = 10;
    const gap = tex ? 7 : 0;
    const width = padX * 2 + gw + gap + t.width;
    const height = Math.max(t.height, gh) + 12;
    const box = new Container();
    const bg = new Graphics()
      .roundRect(-width / 2, -height / 2 + 3, width, height, height / 2)
      .fill({ color: 0x000000, alpha: 0.22 })
      .roundRect(-width / 2, -height / 2, width, height, height / 2)
      .fill(color)
      .stroke({ width: 2, color: 0xffffff, alpha: 0.9 })
      .roundRect(-width / 2 + 3, -height / 2 + 2, width - 6, height / 2 - 2, height / 3)
      .fill({ color: 0xffffff, alpha: 0.14 });
    box.addChild(bg);
    let left = -width / 2 + padX;
    if (tex) {
      const sp = new Sprite(tex);
      sp.anchor.set(0, 0.5);
      sp.scale.set(gh / tex.height);
      sp.position.set(left, 0);
      box.addChild(sp);
      left += gw + gap;
    }
    t.position.set(left, 0);
    box.addChild(t);
    box.position.set(x, y);
    box.scale.set(this.labelScale);
    this.labelLayer.addChild(box);
  }

  private addLabel(text: string, x: number, y: number, color: number, small: boolean): void {
    const t = new Text({
      text,
      style: { fontFamily: FONT, fontSize: small ? 12 : 13, fontWeight: '600', fill: 0xffffff },
      resolution: 3,
    });
    t.anchor.set(0.5);
    const padX = 7;
    const bg = new Graphics()
      .roundRect(-t.width / 2 - padX, -t.height / 2 - 3, t.width + padX * 2, t.height + 6, 8)
      .fill({ color, alpha: 0.92 });
    const box = new Container();
    box.addChild(bg, t);
    box.position.set(x, y);
    this.labelLayer.addChild(box);
  }

  private drawOverlay(input: RenderInput): void {
    const g = this.overlay;
    g.clear();
    const { site } = input.game;
    if (input.selectedRoomId) {
      const room = site.rooms.find((r) => r.id === input.selectedRoomId);
      if (room) {
        const { x, y, w, h } = room.rect;
        const pts = [cellToWorld(x, y), cellToWorld(x + w, y), cellToWorld(x + w, y + h), cellToWorld(x, y + h)];
        g.poly(pts.flatMap((p) => [p.x, p.y])).fill({ color: 0xffd166, alpha: 0.18 }).stroke({ width: 3, color: 0xffb703 });
      }
    }
    if (input.hint && !input.preview) {
      for (const c of input.hint) g.poly(cellDiamond(c.x, c.y)).fill({ color: 0x3b9ae1, alpha: 0.28 }).stroke({ width: 1.5, color: 0x1f7ac4, alpha: 0.85 });
    }
    if (input.preview) {
      const color = input.preview.valid ? 0x2bb673 : 0xe5484d;
      for (const c of input.preview.cells) g.poly(cellDiamond(c.x, c.y)).fill({ color, alpha: 0.45 }).stroke({ width: 1.5, color, alpha: 0.9 });
    }
    if (input.hover && !input.preview) {
      const color = input.hoverTint === 'danger' ? 0xe5484d : 0xffffff;
      g.poly(cellDiamond(input.hover.x, input.hover.y)).fill({ color, alpha: 0.18 }).stroke({ width: 2, color });
    }
  }
}
