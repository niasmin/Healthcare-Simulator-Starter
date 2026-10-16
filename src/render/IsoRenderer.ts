import { Application, Container, Graphics, Text } from 'pixi.js';
import { EQUIPMENT, ROOMS } from '../data/rooms';
import { cellIndex } from '../domain/grid';
import type { RoomStatus } from '../domain/rules/rooms';
import type { Cell, EquipmentId, GameState, Room } from '../domain/types';
import { cellCenter, cellDiamond, cellToWorld, TILE_H, TILE_W, worldToCell } from './iso';

/**
 * Rendering layer. Reads game state, never mutates it. All gameplay decisions
 * happen in the sim; this class only draws and reports pointer cells back.
 */

export interface RenderInput {
  game: GameState;
  statuses: Map<string, RoomStatus>;
  labelFor: (room: Room) => string;
  entranceLabel: string;
  selectedRoomId: string | null;
  hover: Cell | null;
  preview: { cells: Cell[]; valid: boolean } | null;
  hoverTint: 'neutral' | 'danger';
  leftDragPans: boolean;
}

export interface RendererCallbacks {
  onHover: (cell: Cell | null) => void;
  onClick: (cell: Cell) => void;
  onDragStart: (cell: Cell) => void;
  onDragMove: (cell: Cell) => void;
  onDragEnd: () => void;
}

const WALL_H = 26;
const FRONT_WALL_H = 6;
const SLAB_DEPTH = 14;
const FONT = '"IBM Plex Sans Thai", "Noto Sans Thai", "Leelawadee UI", Tahoma, sans-serif';

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
};

export class IsoRenderer {
  private app = new Application();
  private world = new Container();
  private staticLayer = new Container();
  private overlay = new Graphics();
  private labelLayer = new Container();
  private ready = false;
  private destroyed = false;
  private lastSite: GameState['site'] | null = null;
  private lastStatic = '';
  private input: RenderInput | null = null;
  private onWheel = (e: WheelEvent) => this.handleWheel(e);
  private onContext = (e: Event) => e.preventDefault();

  // pointer state
  private pointer: { mode: 'none' | 'pan' | 'maybe-click' | 'drag'; button: number; sx: number; sy: number; wx: number; wy: number } = {
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
      background: 0xe9e4d8,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }
    host.appendChild(this.app.canvas);
    this.app.canvas.style.display = 'block';
    this.app.canvas.style.touchAction = 'none';
    this.world.addChild(this.staticLayer, this.overlay, this.labelLayer);
    this.app.stage.addChild(this.world);
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on('pointerdown', (e) => this.handleDown(e.global.x, e.global.y, e.button));
    this.app.stage.on('pointermove', (e) => this.handleMove(e.global.x, e.global.y));
    this.app.stage.on('pointerup', () => this.handleUp());
    this.app.stage.on('pointerupoutside', () => this.handleUp());
    this.app.stage.on('pointerleave', () => {
      if (this.pointer.mode === 'none') this.emitHover(null);
    });
    this.app.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.app.canvas.addEventListener('contextmenu', this.onContext);
    this.app.renderer.on('resize', () => {
      if (!this.userMovedCamera) this.recenter();
    });
    this.ready = true;
    this.recenter();
    if (this.input) this.update(this.input);
  }

  destroy(): void {
    this.destroyed = true;
    if (!this.ready) return;
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
    const worldW = (w + h) * (TILE_W / 2) + 80;
    const worldH = (w + h) * (TILE_H / 2) + 140;
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const scale = Math.max(0.2, Math.min(2.2, Math.min(sw / worldW, sh / worldH)));
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
    const next = Math.max(0.2, Math.min(3, old * factor));
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

  // ---------- drawing ----------
  update(input: RenderInput): void {
    this.input = input;
    if (!this.ready) return;
    const staticKey = `${input.labelFor({ id: '', type: 'ward', rect: { x: 0, y: 0, w: 1, h: 1 }, equipment: {}, builtAt: 0 })}|${input.entranceLabel}`;
    if (input.game.site !== this.lastSite || staticKey !== this.lastStatic) {
      this.lastSite = input.game.site;
      this.lastStatic = staticKey;
      this.drawStatic(input);
    }
    this.drawOverlay(input);
  }

  private drawStatic(input: RenderInput): void {
    const { site } = input.game;
    for (const c of this.staticLayer.removeChildren()) c.destroy({ children: true });
    for (const c of this.labelLayer.removeChildren()) c.destroy({ children: true });

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

    // Street in front of the lot (row y = height), purely decorative
    for (let x = -2; x < site.width + 2; x++) {
      const d = cellDiamond(x, site.height);
      g.poly(d.map((v, i) => (i % 2 ? v + SLAB_DEPTH : v))).fill(0x6f7378);
    }
    for (let x = -2; x < site.width + 2; x += 2) {
      const c = cellCenter(x, site.height);
      g.poly([c.x - 8, c.y + SLAB_DEPTH - 2, c.x + 8, c.y + SLAB_DEPTH + 2, c.x + 6, c.y + SLAB_DEPTH + 3, c.x - 10, c.y + SLAB_DEPTH - 1]).fill(0xe8e3c9);
    }

    // Ground tiles
    for (let y = 0; y < site.height; y++)
      for (let x = 0; x < site.width; x++) {
        const corridor = site.corridor[cellIndex(x, y, site.width)];
        const color = corridor ? ((x + y) % 2 ? 0xf3ede0 : 0xeee6d5) : (x + y) % 2 ? 0xa9bf86 : 0xa2b97f;
        g.poly(cellDiamond(x, y)).fill(color).stroke({ width: 1, color: corridor ? 0xd8cdb6 : 0x93aa71, alpha: 0.7 });
      }

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

    // Rooms, back to front
    const rooms = [...site.rooms].sort((a, b) => a.rect.x + a.rect.y - (b.rect.x + b.rect.y));
    for (const room of rooms) this.drawRoom(room, input.statuses.get(room.id), input.labelFor(room));
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
    placed.sort((a, b) => a.cell.x + a.cell.y - (b.cell.x + b.cell.y));
    for (const p of placed) this.drawProp(g, p.id, p.cell);

    // front walls (low cutaway so the interior stays visible)
    for (let j = 0; j < h; j++)
      if (!isDoor({ x: x + w - 1, y: y + j }, { x: x + w, y: y + j })) seg(x + w, y + j, x + w, y + j + 1, FRONT_WALL_H, shade(wall, 0.75));
    for (let i = 0; i < w; i++)
      if (!isDoor({ x: x + i, y: y + h - 1 }, { x: x + i, y: y + h })) seg(x + i, y + h, x + i + 1, y + h, FRONT_WALL_H, shade(wall, 0.95));

    // label
    const c = cellToWorld(x + w / 2, y + h / 2);
    this.addLabel(status?.operational ? label : `⚠ ${label}`, c.x, c.y - WALL_H - 8, status?.operational ? wall : 0xc0392b, false);
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
