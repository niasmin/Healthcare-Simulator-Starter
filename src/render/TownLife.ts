import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { Site } from '../domain/types';
import { cellCenter } from './iso';
import { DROP, townRoads } from './WorldBackdrop';
import type { Weather } from './Ambience';
import { dispose } from './dispose';

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
    for (let k = 0; k < 2; k++) {
      along(r.front + 1.25);
      along(r.north + 1.25);
      down(r.west + 1.25);
      down(r.east - 0.75);
    }
    along(r.north - 0.75, true);
    along(r.front2 - 0.75);
    along(r.front2 + 1.25, true);
    down(r.west - 0.75, true);
    down(r.east + 1.25, true);
    const n = Math.round(46 + Math.min(16, (r.eastEdge - 20) / 3));
    for (let i = 0; i < n; i++) {
      const lane = lanes[i % lanes.length];
      const roll = jitter(i * 3.1 + 1);
      const kind: Kind = roll < 0.1 ? 'jogger' : roll < 0.2 ? 'cyclist' : roll < 0.27 ? 'dog' : roll < 0.37 ? 'idle' : 'walker';
      this.add(lane, kind, i);
    }
  }

  private add(lane: Lane, kind: Kind, i: number): void {
    const node = new Container();
    const body = new Container();
    node.addChild(new Graphics().ellipse(0, 0, kind === 'cyclist' ? 13 : 9, 4).fill({ color: 0x000000, alpha: 0.16 }));
    node.addChild(body);
    const sprites = FOLK.filter((k) => this.textures.has(k));
    const pick = (k: number) => this.textures.get(sprites[Math.floor(jitter(i * 7 + k) * sprites.length) % sprites.length]);
    if (kind === 'cyclist') {
      // A bicycle drawn in lines, the rider on top.
      const bike = new Graphics();
      const frame = [0xd9534f, 0x2f6aa5, 0x3f8f86, 0xe0a23b][i % 4];
      bike.circle(-8, -5, 5).stroke({ width: 1.6, color: 0x2b2522 });
      bike.circle(8, -5, 5).stroke({ width: 1.6, color: 0x2b2522 });
      bike.moveTo(-8, -5).lineTo(-1, -13).lineTo(8, -5).moveTo(-1, -13).lineTo(5, -13).lineTo(8, -5).stroke({ width: 1.8, color: frame });
      body.addChild(bike);
      const t = pick(1);
      if (t) {
        const sp = new Sprite(t);
        sp.anchor.set(0.5, 0.97);
        sp.scale.set((PERSON_W * 0.9) / t.width);
        sp.position.set(0, -9);
        body.addChild(sp);
      }
    } else {
      const t = kind === 'jogger' && this.textures.has('ch_jogger') ? this.textures.get('ch_jogger') : pick(2);
      if (t) {
        const sp = new Sprite(t);
        sp.anchor.set(0.5, 0.97);
        sp.scale.set(PERSON_W / t.width);
        body.addChild(sp);
      }
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
    const f: Folk = { node, body, umbrella, lane, pos: lane.from + jitter(i * 17 + 3) * (lane.to - lane.from), speed: speed * dir, kind, phase: jitter(i * 19) * 6.28, homebody: jitter(i * 23) };
    if (kind === 'idle') {
      // Two neighbours chatting: a second figure facing the first.
      const t = pick(5);
      if (t) {
        const sp = new Sprite(t);
        sp.anchor.set(0.5, 0.97);
        sp.scale.set(-PERSON_W / t.width, PERSON_W / t.width);
        sp.position.set(16, 3);
        body.addChild(sp);
      }
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
