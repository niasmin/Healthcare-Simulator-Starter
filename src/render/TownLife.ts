import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { Site } from '../domain/types';
import { cellCenter } from './iso';
import { DROP, townRoads } from './WorldBackdrop';
import type { Weather } from './Ambience';
import { dispose } from './dispose';
import { figureBase, RENDERED_ANCHORS } from './sprites';

/**
 * Life in the town around the home: people walking along the pavements, joggers, cyclists, a
 * dog walker, and neighbours chatting outside the shops. Purely visual, like the backdrop: it
 * reads the site and the clock, never the sim, and uses its own repeatable jitter.
 * Fewer people are out at night; on rainy days they carry umbrellas.
 */

/** Townsfolk drawn with the character sheet's chibi sprites. */
const FOLK = ['ch_owner_f', 'ch_owner_m', 'ch_elder_f', 'ch_elder_m', 'ch_resident', 'ch_kid', 'ch_student', 'ch_jogger'];
const PERSON_W = 22;

const jitter = (n: number) => {
  const s = Math.sin(n * 91.7 + 47.3) * 43758.5453;
  return s - Math.floor(s);
};

type Kind = 'walker' | 'jogger' | 'cyclist' | 'dog' | 'idle';
interface Lane {
  /** 'x': walks along x at a fixed row; 'y': along y at a fixed column. */
  axis: 'x' | 'y';
  /** The fixed row/column, in cells (fractional: which side of the pavement). */
  at: number;
  from: number;
  to: number;
}
interface Folk {
  node: Container;
  body: Container;
  umbrella: Graphics;
  lane: Lane;
  pos: number;
  speed: number;
  kind: Kind;
  phase: number;
  /** Stays in at night when this is above the night level (0..1). */
  homebody: number;
  /** 3D figures' front and back views, swapped by the way they walk. */
  views: Array<{ front: Sprite; back: Sprite; flip: boolean }>;
}

export class TownLife {
  /** Behind the lot (north and west pavements) and in front of it (south and east). */
  readonly back = new Container();
  readonly front = new Container();
  private folk: Folk[] = [];
  private site: Site | null = null;
  private clock = 0;
  private weather: Weather = 'clear';

  constructor(private textures: Map<string, Texture>) {
    this.back.eventMode = 'none';
    this.front.eventMode = 'none';
    this.back.sortableChildren = true;
    this.front.sortableChildren = true;
  }

  /** (Re)build the town's people for this site; the sale plot, when listed, widens the town. */
  build(site: Site, saleToX: number | null): void {
    this.site = site;
    for (const f of this.folk) dispose(f.node);
    this.folk = [];
    const r = townRoads(site, saleToX);
    // Pavement lanes on both sides of every road, except where the side is the lot itself.
    const lanes: Lane[] = [];
    // Most people stay within a dozen cells of the home, where the player looks most.
    const near = 12;
    const along = (row: number, wide = false) => lanes.push({ axis: 'x', at: row, from: wide ? r.minX + 2 : -near, to: wide ? r.maxX - 2 : r.eastEdge + near });
    const down = (col: number, wide = false) => lanes.push({ axis: 'y', at: col, from: wide ? r.minY + 2 : -near, to: wide ? r.maxY - 2 : site.height + near });
    // The pavements that face the home come twice, so they are the busiest.
    // Roads are two cells wide; a pavement cell runs along each side.
    for (let k = 0; k < 2; k++) {
      along(r.front - 0.6);
      along(r.front + 2.4);
      along(r.north + 2.4);
      down(r.west + 2.4);
      down(r.east - 0.6);
    }
    along(r.north - 0.6, true);
    along(r.front2 - 0.6);
    along(r.front2 + 2.4, true);
    down(r.west - 0.6, true);
    down(r.east + 2.4, true);
    const n = Math.round(46 + Math.min(16, (r.eastEdge - 20) / 3));
    for (let i = 0; i < n; i++) {
      const lane = lanes[i % lanes.length];
      const roll = jitter(i * 3.1 + 1);
      const kind: Kind = roll < 0.1 ? 'jogger' : roll < 0.2 ? 'cyclist' : roll < 0.27 ? 'dog' : roll < 0.37 ? 'idle' : 'walker';
      this.add(lane, kind, i);
    }
  }

  /** A townsperson: the 3D figure (front and back views) when rendered, else the chibi sprite. */
  private figure(name: string, into: Container, views: Folk['views'], width: number, x = 0, y = 0, flip = false): void {
    const base = figureBase(name);
    if (base && this.textures.has(`${base}_s`) && this.textures.has(`${base}_n`)) {
      const pair = { front: this.view(`${base}_s`, into, x, y, flip), back: this.view(`${base}_n`, into, x, y, flip), flip };
      pair.back.visible = false;
      views.push(pair);
      return;
    }
    const t = this.textures.get(name);
    if (!t) return;
    const sp = new Sprite(t);
    sp.anchor.set(0.5, 0.97);
    sp.scale.set((flip ? -width : width) / t.width, width / t.width);
    sp.position.set(x, y);
    into.addChild(sp);
  }

  private view(name: string, into: Container, x: number, y: number, flip: boolean): Sprite {
    const t = this.textures.get(name)!;
    const a = RENDERED_ANCHORS[name];
    const sp = new Sprite(t);
    sp.anchor.set(a[0] / t.width, a[1] / t.height);
    const k = 0.9 / (a[2] ?? 1);
    sp.scale.set(flip ? -k : k, k);
    sp.position.set(x, y);
    into.addChild(sp);
    return sp;
  }

  private add(lane: Lane, kind: Kind, i: number): void {
    const node = new Container();
    const body = new Container();
    const views: Folk['views'] = [];
    node.addChild(new Graphics().ellipse(0, 0, kind === 'cyclist' ? 13 : 9, 4).fill({ color: 0x000000, alpha: 0.16 }));
    node.addChild(body);
    const sprites = FOLK.filter((k) => this.textures.has(k) || figureBase(k));
    const pick = (k: number) => sprites[Math.floor(jitter(i * 7 + k) * sprites.length) % sprites.length];
    if (kind === 'cyclist') {
      // A bicycle drawn in lines, the rider on top.
      const bike = new Graphics();
      const frame = [0xd9534f, 0x2f6aa5, 0x3f8f86, 0xe0a23b][i % 4];
      bike.circle(-8, -5, 5).stroke({ width: 1.6, color: 0x2b2522 });
      bike.circle(8, -5, 5).stroke({ width: 1.6, color: 0x2b2522 });
      bike.moveTo(-8, -5).lineTo(-1, -13).lineTo(8, -5).moveTo(-1, -13).lineTo(5, -13).lineTo(8, -5).stroke({ width: 1.8, color: frame });
      body.addChild(bike);
      if (sprites.length) this.figure(pick(1), body, views, PERSON_W * 0.9, 0, -9);
    } else {
      const who = kind === 'jogger' && (this.textures.has('ch_jogger') || figureBase('ch_jogger')) ? 'ch_jogger' : sprites.length ? pick(2) : null;
      if (who) this.figure(who, body, views, PERSON_W);
      if (kind === 'dog') {
        // A small dog trotting ahead on a lead.
        const dog = new Graphics();
        const coat = [0xc9955b, 0xf2efe8, 0x4a3a30][i % 3];
        dog.ellipse(14, -5, 6, 3.5).fill(coat).stroke({ width: 1, color: 0x5a4636, alpha: 0.6 });
        dog.circle(20, -8, 3).fill(coat).stroke({ width: 1, color: 0x5a4636, alpha: 0.6 });
        dog.rect(10, -3, 1.6, 4).fill(0x5a4636).rect(16, -3, 1.6, 4).fill(0x5a4636);
        dog.moveTo(4, -16).lineTo(18, -9).stroke({ width: 1, color: 0x8b2e2e });
        body.addChild(dog);
      }
    }
    // An umbrella, shown on rainy days.
    const umbrella = new Graphics();
    const uc = [0x2f6aa5, 0xd9534f, 0x3f8f86, 0xf2b631, 0x7d6aa0][i % 5];
    umbrella.moveTo(0, -24).lineTo(0, -40).stroke({ width: 1.2, color: 0x3a3a3a });
    umbrella.arc(0, -38, 13, Math.PI, 0).fill(uc);
    umbrella.visible = false;
    body.addChild(umbrella);
    const speed = kind === 'idle' ? 0 : kind === 'cyclist' ? 3.2 : kind === 'jogger' ? 1.9 : kind === 'dog' ? 0.95 : 0.7 + jitter(i * 11) * 0.45;
    const dir = jitter(i * 13) < 0.5 ? -1 : 1;
    const f: Folk = { node, body, umbrella, lane, pos: lane.from + jitter(i * 17 + 3) * (lane.to - lane.from), speed: speed * dir, kind, phase: jitter(i * 19) * 6.28, homebody: jitter(i * 23), views };
    if (kind === 'idle') {
      // Two neighbours chatting: a second figure facing the first.
      if (sprites.length) this.figure(pick(5), body, views, PERSON_W, 16, 3, true);
    }
    this.folk.push(f);
    this.place(f);
  }

  setWeather(w: Weather): void {
    this.weather = w;
  }

  private place(f: Folk): void {
    const site = this.site;
    if (!site) return;
    const [cx, cy] = f.lane.axis === 'x' ? [f.pos, f.lane.at] : [f.lane.at, f.pos];
    const c = cellCenter(cx, cy);
    f.node.position.set(c.x, c.y + DROP);
    f.node.zIndex = c.y;
    // Behind the lot (north or west of it, alongside): drawn before the home; otherwise in front.
    const behind = (cy < 0 && cx < site.width + 1) || (cx < 0 && cy < site.height + 1);
    const layer = behind ? this.back : this.front;
    if (f.node.parent !== layer) layer.addChild(f.node);
    // Face the way they walk: in iso, +x heads down-right and +y down-left.
    const right = f.lane.axis === 'x' ? f.speed >= 0 : f.speed < 0;
    f.body.scale.x = right ? 1 : -1;
    if (f.views.length && f.speed !== 0) {
      // Heading +x (down-right) or +y (down-left) shows the front; the other two the back. The
      // front view faces down-left and the back view up-right, so walking along x is mirrored.
      const ahead = f.speed > 0;
      const mirror = (f.lane.axis === 'x' ? -1 : 1) * f.body.scale.x;
      for (const v of f.views) {
        v.front.visible = ahead;
        v.back.visible = !ahead;
        for (const sp of [v.front, v.back]) sp.scale.x = Math.abs(sp.scale.x) * mirror * (v.flip ? -1 : 1);
      }
    }
  }

  /** Per frame. `pace` is 0 while the game is paused; `night` 0..1 thins the crowd after dark. */
  tick(dtMs: number, pace: number, night: number): void {
    const dt = Math.min(0.1, dtMs / 1000);
    this.clock += dt;
    const rain = this.weather === 'rain';
    for (const f of this.folk) {
      // After dark most people are home; in the rain fewer go out (cyclists stay in).
      const out = f.homebody > night * 0.75 && !(rain && (f.kind === 'cyclist' || f.homebody < 0.35));
      f.node.visible = out;
      if (!out) continue;
      f.umbrella.visible = rain;
      if (pace && f.speed) {
        f.pos += f.speed * dt * Math.min(2, pace);
        if (f.pos > f.lane.to) f.pos = f.lane.from;
        if (f.pos < f.lane.from) f.pos = f.lane.to;
        this.place(f);
      }
      const bob = f.speed === 0 ? Math.sin(this.clock * 2 + f.phase) * 0.5 : f.kind === 'cyclist' ? Math.sin(this.clock * 9 + f.phase) * 0.6 : Math.abs(Math.sin(this.clock * (f.kind === 'jogger' ? 16 : 10) + f.phase)) * (f.kind === 'jogger' ? 3 : 2);
      f.body.y = pace || f.speed === 0 ? -bob : 0;
    }
  }

  destroy(): void {
    for (const f of this.folk) dispose(f.node);
    this.folk = [];
  }
}
