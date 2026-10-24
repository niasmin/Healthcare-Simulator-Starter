import { Container, Graphics } from 'pixi.js';
import type { GameState, Room } from '../domain/types';
import { cellCenter, cellToWorld } from './iso';

/**
 * Ambient effects drawn around the map. Purely visual: they read the game clock and the site,
 * never the sim's RNG, and use their own small deterministic jitter.
 * - light: a smooth tint through dawn, day, dusk and night (keyframes, blended every 10 minutes);
 * - dark: after dusk the map sinks into darkness except around its light sources (windows,
 *   path lamps, the entrance, garden lamps), which leave soft pools of light;
 * - lights: warm windows and lamp glows that fade in after dusk (additive, above the tint);
 * - mist: low morning mist drifting over the lot at dawn (and a little on rainy days);
 * - fireflies: blinking specks over the garden and the lawns on clear nights;
 * - clouds: soft shadows drifting over the town by day;
 * - petals: a few sakura petals floating down the screen by day;
 * - puffs: a dust cloud and sparkles where a room has just been built.
 * With effects off (low quality or reduced motion) only the tint and the lights remain.
 */

type Key = { at: number; color: number; alpha: number; night: number };
const KEYS: Key[] = [
  { at: 0, color: 0x0d1733, alpha: 0.3, night: 1 },
  { at: 300, color: 0x111d3a, alpha: 0.28, night: 1 },
  { at: 360, color: 0x8a5a7a, alpha: 0.2, night: 0.5 },
  { at: 420, color: 0xf2a65a, alpha: 0.12, night: 0.1 },
  { at: 480, color: 0xfff2d6, alpha: 0, night: 0 },
  { at: 1050, color: 0xfff2d6, alpha: 0, night: 0 },
  { at: 1110, color: 0xf0a050, alpha: 0.14, night: 0 },
  { at: 1170, color: 0xd9704a, alpha: 0.2, night: 0.3 },
  { at: 1230, color: 0x3a3366, alpha: 0.3, night: 0.8 },
  { at: 1290, color: 0x111d3a, alpha: 0.28, night: 1 },
  { at: 1440, color: 0x0d1733, alpha: 0.3, night: 1 },
];

function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** The light at a time of day: tint colour, its strength, and how dark it is (0 day .. 1 night). */
export function lightAt(minute: number): { color: number; alpha: number; night: number } {
  const m = ((minute % 1440) + 1440) % 1440;
  const i = KEYS.findIndex((k) => k.at > m);
  const b = KEYS[i];
  const a = KEYS[i - 1];
  const t = (m - a.at) / (b.at - a.at);
  return { color: mix(a.color, b.color, t), alpha: a.alpha + (b.alpha - a.alpha) * t, night: a.night + (b.night - a.night) * t };
}

export type Weather = 'clear' | 'cloudy' | 'rain';
/** The day's weather, purely for looks: about one rainy and one overcast day in six. */
export function weatherFor(seed: number, day: number): Weather {
  let h = Math.imul(seed ^ 0x5bd1e995, 0x27d4eb2d) ^ Math.imul(day + 0x165667b1, 0x85ebca6b);
  h ^= h >>> 13;
  const k = ((h >>> 0) % 6 + 6) % 6;
  return k === 0 ? 'rain' : k === 1 ? 'cloudy' : 'clear';
}

/** A repeatable jitter in 0..1 (no Math.random, so screenshots and tests are stable). */
const jitter = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

interface Petal { g: Graphics; x: number; y: number; vy: number; sway: number; phase: number; spin: number }
interface Cloud { g: Graphics; x: number; y: number; speed: number }
interface Drop { g: Graphics; x: number; y: number; v: number }
interface Puff { g: Graphics; age: number; life: number; vx: number; vy: number; grow: number; sparkle: boolean }
interface Fly { g: Graphics; ax: number; ay: number; phase: number; speed: number; r: number }
interface Wisp { g: Graphics; x: number; y: number; speed: number; phase: number }

/** How dark the night gets away from any light (on top of the tint). */
const NIGHT_DARK = 0.5;
/** A path lamp on about one corridor tile in this many. */
const LAMP_EVERY = 5;
const FIREFLIES = 36;

/** Corridor tiles with a path lamp (the renderer draws the post, the night lights its pool). */
export function pathLamps(site: GameState['site']): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let j = 0; j < site.height; j++)
    for (let i = 0; i < site.width; i++) if (site.corridor[j * site.width + i] && (i * 3 + j * 2) % LAMP_EVERY === 0) out.push({ x: i, y: j });
  return out;
}

export class Ambience {
  /** Screen-space tint over the world. */
  readonly tint = new Graphics();
  /** World-space darkness with soft holes where the light is, kept in step with the camera. */
  readonly dark = new Container();
  /** World-space glows, kept in step with the world's camera, drawn above the tint. */
  readonly lights = new Container();
  /** World-space layer for cloud shadows and building puffs (inside the world). */
  readonly worldFx = new Container();
  /** Screen-space petals, above everything on the map. */
  readonly screenFx = new Container();

  private lastTint = '';
  private lastLightsSite: GameState['site'] | null = null;
  private night = 0;
  private petals: Petal[] = [];
  private clouds: Cloud[] = [];
  private cloudLayer = new Container();
  private puffLayer = new Container();
  private puffs: Puff[] = [];
  private knownRooms: Set<string> | null = null;
  private effects = true;
  private weather: Weather = 'clear';
  private drops: Drop[] = [];
  private rainLayer = new Container();
  private gloom = new Graphics();
  private time = 0;
  private minute = 0;
  private flies: Fly[] = [];
  private flyLayer = new Container();
  private wisps: Wisp[] = [];
  private mistLayer = new Container();
  private bounds = { minX: -600, maxX: 600, minY: -200, maxY: 600 };
  /** The lot itself (world px), where the mist lies. */
  private lot = { minX: -600, maxX: 600, minY: -200, maxY: 600 };

  constructor() {
    this.tint.eventMode = 'none';
    this.lights.eventMode = 'none';
    this.dark.eventMode = 'none';
    this.worldFx.eventMode = 'none';
    this.screenFx.eventMode = 'none';
    this.flyLayer.blendMode = 'add';
    this.worldFx.addChild(this.mistLayer, this.cloudLayer, this.puffLayer);
    this.lights.addChild(this.flyLayer);
    this.screenFx.addChild(this.gloom, this.rainLayer);
  }

  /** Overcast and rainy days darken the map; rain adds falling streaks (effects on). */
  setWeather(w: Weather): void {
    if (w === this.weather) return;
    this.weather = w;
    this.lastTint = '';
    if (w !== 'rain') for (const d of this.drops.splice(0)) d.g.destroy();
  }

  setEffects(on: boolean): void {
    if (on === this.effects) return;
    this.effects = on;
    this.cloudLayer.visible = on;
    this.mistLayer.visible = on;
    this.flyLayer.visible = on;
    this.petals.forEach((p) => (p.g.visible = on));
    this.rainLayer.visible = on;
    if (!on) for (const p of this.puffs.splice(0)) p.g.destroy();
  }

  /** The world's extent, for where clouds drift. */
  setBounds(b: { minX: number; maxX: number; minY: number; maxY: number }): void {
    this.bounds = b;
    if (!this.clouds.length) this.makeClouds();
  }

  /** Tint for the clock (redrawn only when it changes). */
  drawTint(minute: number, width: number, height: number): void {
    const l = lightAt(minute);
    this.night = l.night;
    this.minute = minute;
    const key = `${l.color}|${l.alpha.toFixed(3)}|${width}x${height}|${this.weather}`;
    if (key === this.lastTint) return;
    this.lastTint = key;
    this.tint.clear();
    if (l.alpha > 0.001) this.tint.rect(0, 0, width, height).fill({ color: l.color, alpha: l.alpha });
    // Grey daylight under cloud; the night is dark enough already.
    const grey = (this.weather === 'rain' ? 0.2 : this.weather === 'cloudy' ? 0.1 : 0) * (1 - l.night);
    this.gloom.clear();
    if (grey > 0.001) this.gloom.rect(0, 0, width, height).fill({ color: 0x5d6b7a, alpha: grey });
    this.lights.alpha = Math.min(1, l.night * 1.1);
    this.lights.visible = l.night > 0.02;
    this.dark.alpha = l.night * NIGHT_DARK * (this.weather === 'rain' ? 1.15 : 1);
    this.dark.visible = l.night > 0.02;
  }

  /**
   * Where the light comes from at night: windows along the two faces of every building toward
   * the viewer, a path lamp on some corridor tiles, the entrance and the garden lamps. Each is a
   * point with a radius (world px) and a warmth.
   */
  private lightSources(site: GameState['site']): Array<{ x: number; y: number; r: number; color: number; k: number }> {
    const out: Array<{ x: number; y: number; r: number; color: number; k: number }> = [];
    for (const room of site.rooms) {
      if (room.worksUntil !== undefined) continue; // dark while the builders are in
      const { x, y, w, h } = room.rect;
      const c = cellCenter(x + (w - 1) / 2, y + (h - 1) / 2);
      out.push({ x: c.x, y: c.y - 10, r: 20 + (w + h) * 9, color: 0xffa83a, k: 0.55 });
      // Windows spill light onto the ground in front of each face.
      for (let i = 0; i < w; i++) {
        const p = cellToWorld(x + i + 0.5, y + h + 0.35);
        out.push({ x: p.x, y: p.y, r: 26, color: 0xffb350, k: 0.45 });
      }
      for (let j = 0; j < h; j++) {
        const p = cellToWorld(x + w + 0.35, y + j + 0.5);
        out.push({ x: p.x, y: p.y, r: 26, color: 0xffb350, k: 0.4 });
      }
    }
    for (const lamp of pathLamps(site)) {
      const c = cellCenter(lamp.x, lamp.y);
      out.push({ x: c.x + 18, y: c.y - 4, r: 48, color: 0xffd58a, k: 0.55 });
    }
    for (const d of site.decor ?? []) {
      if (d.type !== 'lamp' && d.type !== 'gold_lantern') continue;
      const c = cellCenter(d.cell.x, d.cell.y);
      out.push({ x: c.x, y: c.y - 6, r: 62, color: 0xffd27a, k: 0.75 });
    }
    const e = cellCenter(site.entrance.x, site.entrance.y);
    out.push({ x: e.x, y: e.y - 8, r: 70, color: 0xffd27a, k: 0.7 });
    return out;
  }

  /** Night lighting: warm glows and the darkness with holes around them (rebuilt when the site changes). */
  drawLights(site: GameState['site']): void {
    if (site === this.lastLightsSite) return;
    this.lastLightsSite = site;
    for (const c of this.lights.removeChildren()) if (c !== this.flyLayer) c.destroy();
    for (const c of this.dark.removeChildren()) c.destroy();
    this.dark.cacheAsTexture(false);
    const sources = this.lightSources(site);
    const g = new Graphics();
    g.blendMode = 'add';
    // A soft radial glow: stacked ellipses, brighter towards the middle (iso: half as tall as wide).
    const glow = (gr: Graphics, x: number, y: number, r: number, color: number, strength: number, rings = 6) => {
      for (let i = rings; i >= 1; i--) gr.ellipse(x, y, (r * i) / rings, (r * i) / rings / 2).fill({ color, alpha: strength / rings });
    };
    for (const l of sources) glow(g, l.x, l.y, l.r * 0.8, l.color, l.k * 0.9);
    this.lights.addChildAt(g, 0);
    // The darkness: one sheet over the whole world, with soft holes cut where the light falls.
    const { minX, maxX, minY, maxY } = this.bounds;
    const pad = 1600;
    const sheet = new Graphics().rect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2).fill(0x060b1c);
    const holes = new Graphics();
    holes.blendMode = 'erase';
    for (const l of sources) glow(holes, l.x, l.y, l.r * 1.25, 0xffffff, Math.min(1, l.k * 1.6), 5);
    this.dark.addChild(sheet, holes);
    this.dark.cacheAsTexture({ resolution: 0.5 });
    this.makeFireflies(site);
    const corners = [cellToWorld(0, 0), cellToWorld(site.width, 0), cellToWorld(site.width, site.height), cellToWorld(0, site.height)];
    this.lot = { minX: Math.min(...corners.map((c) => c.x)), maxX: Math.max(...corners.map((c) => c.x)), minY: Math.min(...corners.map((c) => c.y)), maxY: Math.max(...corners.map((c) => c.y)) };
    if (this.wisps.length) this.makeMist();
  }

  /** Firefly anchors over open lawn and garden tiles (repeatable: no Math.random). */
  private makeFireflies(site: GameState['site']): void {
    for (const f of this.flies.splice(0)) f.g.destroy();
    const taken = new Set<number>();
    for (const r of site.rooms) for (let j = r.rect.y; j < r.rect.y + r.rect.h; j++) for (let i = r.rect.x; i < r.rect.x + r.rect.w; i++) taken.add(j * site.width + i);
    const open: Array<{ x: number; y: number }> = [];
    for (let j = -3; j < site.height + 3; j++)
      for (let i = -3; i < site.width + 3; i++) {
        const inside = i >= 0 && j >= 0 && i < site.width && j < site.height;
        if (inside && (taken.has(j * site.width + i) || site.corridor[j * site.width + i])) continue;
        open.push({ x: i, y: j });
      }
    for (const d of site.decor ?? []) open.push(d.cell, d.cell);
    if (!open.length) return;
    for (let n = 0; n < FIREFLIES; n++) {
      const cell = open[Math.floor(jitter(n * 7.3 + site.width) * open.length)];
      const c = cellCenter(cell.x, cell.y);
      const g = new Graphics();
      g.circle(0, 0, 5).fill({ color: 0xd8ff7a, alpha: 0.18 }).circle(0, 0, 1.8).fill({ color: 0xf4ffb8, alpha: 0.95 });
      this.flyLayer.addChild(g);
      this.flies.push({ g, ax: c.x, ay: c.y - 12, phase: jitter(n * 3.1) * 6.28, speed: 0.4 + jitter(n * 5.7) * 0.6, r: 10 + jitter(n * 9.9) * 18 });
    }
  }

  private makeMist(): void {
    for (const w of this.wisps.splice(0)) w.g.destroy();
    // Over the lot and a little beyond it.
    const minX = this.lot.minX - 200;
    const maxX = this.lot.maxX + 200;
    const minY = this.lot.minY - 60;
    const maxY = this.lot.maxY + 60;
    for (let i = 0; i < 16; i++) {
      const g = new Graphics();
      for (let k = 0; k < 6; k++) g.ellipse((k - 2.5) * 80 + jitter(i * 4 + k) * 40, jitter(i * 6 + k) * 20 - 10, 130 + jitter(k * 3 + i) * 70, 22 + jitter(k + i * 2) * 12).fill({ color: 0xf3f6fa, alpha: 0.14 });
      this.mistLayer.addChild(g);
      this.wisps.push({ g, x: minX + jitter(i * 13 + 3) * (maxX - minX), y: minY + jitter(i * 19 + 5) * (maxY - minY), speed: 6 + jitter(i * 29) * 8, phase: jitter(i * 31) * 6.28 });
    }
  }

  /** Mist thickness for the time of day: thickest just before sunrise, gone by mid-morning. */
  private mistAt(): number {
    const m = ((this.minute % 1440) + 1440) % 1440;
    const dawn = m >= 270 && m < 480 ? (m < 360 ? (m - 270) / 90 : 1 - (m - 360) / 120) : 0;
    return Math.max(dawn, this.weather === 'rain' ? 0.45 : 0);
  }

  /** New rooms since the last call get a puff (the first call only records what is there). */
  noticeRooms(rooms: Room[]): void {
    const ids = new Set(rooms.map((r) => r.id));
    const before = this.knownRooms;
    this.knownRooms = ids;
    if (!before || !this.effects) return;
    for (const r of rooms) if (!before.has(r.id)) this.puffAt(r);
  }

  private puffAt(room: Room): void {
    const { x, y, w, h } = room.rect;
    const c = cellCenter(x + (w - 1) / 2, y + (h - 1) / 2);
    const n = 14 + Math.min(10, w * h);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + jitter(i + x * 7 + y * 13) * 0.6;
      const g = new Graphics().circle(0, 0, 9 + jitter(i * 3 + w) * 7).fill({ color: 0xf4efe6, alpha: 0.85 });
      g.position.set(c.x + Math.cos(a) * (w + h) * 6, c.y + Math.sin(a) * (w + h) * 3);
      this.puffLayer.addChild(g);
      this.puffs.push({ g, age: 0, life: 0.9 + jitter(i + 5) * 0.4, vx: Math.cos(a) * 34, vy: Math.sin(a) * 17 - 18, grow: 0.9, sparkle: false });
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const g = new Graphics().star(0, 0, 4, 6, 2.5).fill(0xffe17a);
      g.position.set(c.x, c.y - 24);
      this.puffLayer.addChild(g);
      this.puffs.push({ g, age: 0, life: 1.1, vx: Math.cos(a) * 70, vy: Math.sin(a) * 40 - 30, grow: 0, sparkle: true });
    }
  }

  private makeClouds(): void {
    for (const c of this.cloudLayer.removeChildren()) c.destroy();
    this.clouds = [];
    for (let i = 0; i < 5; i++) {
      const g = new Graphics();
      for (let k = 0; k < 4; k++) g.ellipse((k - 1.5) * 70 + jitter(i * 9 + k) * 30, jitter(i * 5 + k) * 30 - 15, 120 + jitter(k + i) * 60, 55 + jitter(k * 2 + i) * 20).fill({ color: 0x1d2a3a, alpha: 0.05 });
      this.cloudLayer.addChild(g);
      const { minX, maxX, minY, maxY } = this.bounds;
      this.clouds.push({ g, x: minX + jitter(i * 11) * (maxX - minX), y: minY + jitter(i * 17) * (maxY - minY), speed: 10 + jitter(i * 23) * 10 });
    }
  }

  private makePetals(width: number, height: number): void {
    for (const p of this.petals) p.g.destroy();
    this.petals = [];
    const n = Math.round(Math.min(26, (width * height) / 42000));
    for (let i = 0; i < n; i++) {
      const g = new Graphics().ellipse(0, 0, 3.2, 2).fill({ color: i % 3 ? 0xf7c6d9 : 0xfbe3ec, alpha: 0.9 });
      this.screenFx.addChild(g);
      this.petals.push({ g, x: jitter(i * 31) * width, y: jitter(i * 37) * height, vy: 18 + jitter(i * 41) * 22, sway: 14 + jitter(i * 43) * 18, phase: jitter(i * 47) * 6.28, spin: 1 + jitter(i * 53) * 2 });
    }
  }

  private rain(dt: number, screen: { width: number; height: number }): void {
    const want = Math.round(Math.min(140, (screen.width * screen.height) / 9000));
    while (this.drops.length < want) {
      const i = this.drops.length;
      const g = new Graphics().moveTo(0, 0).lineTo(-3, 13).stroke({ width: 1.2, color: 0xcfe0f0, alpha: 0.55 });
      this.rainLayer.addChild(g);
      this.drops.push({ g, x: jitter(i * 13 + 1) * screen.width, y: jitter(i * 17 + 2) * screen.height, v: 520 + jitter(i * 19) * 260 });
    }
    for (const d of this.drops) {
      d.y += d.v * dt;
      d.x -= d.v * 0.22 * dt;
      if (d.y > screen.height) {
        d.y = -14;
        d.x = jitter(d.v + this.time) * (screen.width + 60);
      }
      if (d.x < -10) d.x += screen.width + 20;
      d.g.position.set(d.x, d.y);
    }
  }

  /** Per frame. `running` is false while the game is paused (petals and clouds still drift slowly). */
  tick(dtMs: number, running: boolean, screen: { width: number; height: number }): void {
    const dt = Math.min(0.1, dtMs / 1000);
    this.time += dt;
    if (!this.effects) return;
    const day = 1 - this.night;
    // Clouds drift east-south-east across the town, wrapping around.
    const { minX, maxX, minY, maxY } = this.bounds;
    for (const c of this.clouds) {
      c.x += c.speed * dt * (running ? 1 : 0.35);
      c.y += c.speed * 0.25 * dt * (running ? 1 : 0.35);
      if (c.x > maxX + 300) c.x = minX - 300;
      if (c.y > maxY + 150) c.y = minY - 150;
      c.g.position.set(c.x, c.y);
    }
    this.cloudLayer.alpha = day * (this.weather === 'clear' ? 1 : this.weather === 'cloudy' ? 2.2 : 3);
    // Morning mist drifts slowly across the lot.
    const mist = this.mistAt();
    this.mistLayer.alpha = mist;
    if (mist > 0.01) {
      if (!this.wisps.length) this.makeMist();
      for (const w of this.wisps) {
        w.x += w.speed * dt;
        if (w.x > this.lot.maxX + 500) w.x = this.lot.minX - 500;
        w.g.position.set(w.x, w.y + Math.sin(this.time * 0.2 + w.phase) * 6);
      }
    }
    // Fireflies wander round their spot and blink, on dry nights only.
    const flyOn = this.night > 0.6 && this.weather !== 'rain';
    this.flyLayer.visible = flyOn;
    if (flyOn)
      for (const f of this.flies) {
        const t = this.time * f.speed + f.phase;
        f.g.position.set(f.ax + Math.sin(t) * f.r + Math.sin(t * 2.3) * 4, f.ay + Math.cos(t * 0.8) * f.r * 0.45 - Math.abs(Math.sin(t * 1.7)) * 6);
        f.g.alpha = Math.max(0, Math.sin(this.time * 2.6 + f.phase * 3)) * (this.night - 0.6) * 2.5;
      }
    // Petals fall and sway; they wrap at the bottom of the screen.
    const expected = Math.round(Math.min(26, (screen.width * screen.height) / 42000));
    if (this.petals.length !== expected) this.makePetals(screen.width, screen.height);
    this.screenFx.alpha = 1;
    const petalAlpha = day * (this.weather === 'clear' ? 0.95 : this.weather === 'cloudy' ? 0.4 : 0);
    if (this.weather === 'rain') this.rain(dt, screen);
    for (const p of this.petals) {
      p.g.alpha = petalAlpha;
      p.y += p.vy * dt;
      p.x += Math.sin(this.time * 0.9 + p.phase) * p.sway * dt + 6 * dt;
      if (p.y > screen.height + 8) {
        p.y = -8;
        p.x = jitter(p.phase * 100 + this.time) * screen.width;
      }
      if (p.x > screen.width + 8) p.x = -8;
      p.g.position.set(p.x, p.y);
      p.g.rotation = this.time * p.spin + p.phase;
    }
    // Building puffs expand and fade; sparkles fly out and twinkle.
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        p.g.destroy();
        this.puffs.splice(i, 1);
        continue;
      }
      p.g.x += p.vx * dt;
      p.g.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy = p.vy * 0.94 + (p.sparkle ? 40 : -4) * dt;
      p.g.alpha = p.sparkle ? (1 - k) * (0.6 + 0.4 * Math.sin(p.age * 30)) : (1 - k) * 0.9;
      if (!p.sparkle) p.g.scale.set(1 + k * p.grow * 1.6);
      else p.g.rotation += dt * 6;
    }
  }
}
