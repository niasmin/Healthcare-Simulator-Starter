import { chapterDef, nextPlot } from '../data/chapters';
import { DECOR, MAX_APPEAL, gardenAppeal } from '../data/decor';
import { BRANCHES, SUPPORT_COST } from '../data/network';
import { PROGRAMME_EQUIPMENT } from '../data/patients';
import { prefabCost, prefabDef } from '../data/prefabs';
import { EQUIPMENT } from '../data/rooms';
import { COURSES } from '../data/workforce';
import { thb } from '../domain/money';
import { cellIndex } from '../domain/grid';
import type { AutoSettings, BranchKind, CourseId, DecorType, GameState, StaffRole } from '../domain/types';
import { UPGRADES, UPGRADE_ORDER, hasUpgrade } from '../data/shop';
import { buildSomewhere, tryCmd, type Apply } from './autoBuild';
import { log } from './helpers';
import { dailyRunningCost, nextBillingDay, summarize } from './selectors';
import { certifiedCount, isCertified, placementBlocker, trainingBlocker, trainingSeats } from './systems/workforce';
import { dayOf } from './systems/time';

/**
 * Autopilot, "play every chapter": the chapter goals a careful player would work on, chapter by
 * chapter, without fixed coordinates (rooms go wherever buildSomewhere finds a working spot).
 * Chapter 2 secures a ward for the programmes and grows the RN team; chapter 3 buys land, lays a
 * corridor into it, builds villas and a garden; chapter 4 opens Home Care; chapter 5 trains and
 * places staff; chapter 6 opens the clinic and stroke unit; chapter 7 opens branches. A won chapter
 * leads straight into the next; a failed one is played again. Always through public commands.
 */

/** Cash kept on top of the running costs until the next billing day. */
export const CAMPAIGN_RESERVE = thb(150_000);
/** Visits one van can make in a morning. */
const VISITS_PER_VAN = 4;
const MAX_CONTRACTS = 4;
const MAX_POOL = 9;

function runwayNeed(s: GameState): number {
  return dailyRunningCost(s) * Math.max(1, nextBillingDay(s) - dayOf(s.minute)) + CAMPAIGN_RESERVE;
}
const affords = (s: GameState, cost: number) => s.organization.cashSatang >= cost + runwayNeed(s);

function hireRole(s: GameState, apply: Apply, role: StaffRole): [GameState, string | null] {
  const c = s.applicants.find((a) => a.role === role);
  if (!c) return [s, null];
  const out = apply(s, { type: 'hireStaff', candidateId: c.id });
  return out.result.ok && out.result.id ? [out.state, out.result.id] : [s, null];
}

/** Staff kept off the roster for training and placements. */
export function heldForWorkforce(s: GameState, id: string): boolean {
  const e = s.employees.find((x) => x.id === id);
  return !!e && (!!e.placement || !!e.branch || (s.chapter.id >= 5 && isCertified(e)) || s.workforce.training.some((t) => t.employeeId === id));
}

/** Build a ready-made room if affordable; when no spot is left, buy the next plot and try again. */
function build(s: GameState, apply: Apply, prefab: string): GameState {
  const def = prefabDef(prefab);
  if (!def || !affords(s, prefabCost(def))) return s;
  const built = buildSomewhere(s, apply, prefab);
  if (built) return log(built.state, 'good', 'auto.log.build', { prefab });
  const grown = buyLand(s, apply);
  if (grown === s) return s;
  const again = buildSomewhere(grown, apply, prefab);
  return again ? log(again.state, 'good', 'auto.log.build', { prefab }) : grown;
}

/**
 * Buy the next plot and run a corridor into it: along the row whose easternmost corridor tile
 * reaches furthest, provided the row is clear of rooms and decor all the way to the new edge.
 */
export function buyLand(s: GameState, apply: Apply): GameState {
  const plot = nextPlot(s.site.width);
  if (!plot || s.chapter.id < plot.chapter || !affords(s, plot.priceSatang + thb(150_000))) return s;
  const old = s.site.width;
  const rows: Array<{ y: number; x: number }> = [];
  for (let y = 1; y < s.site.height - 1; y++) {
    let x = -1;
    for (let i = old - 1; i >= 0; i--)
      if (s.site.corridor[cellIndex(i, y, old)]) {
        x = i;
        break;
      }
    if (x < 0) continue;
    const blocked = s.site.rooms.some((r) => y >= r.rect.y && y < r.rect.y + r.rect.h && r.rect.x + r.rect.w > x) || s.site.decor.some((d) => d.cell.y === y && d.cell.x > x);
    if (!blocked) rows.push({ y, x });
  }
  rows.sort((a, b) => b.x - a.x || Math.abs(a.y - s.site.height / 2) - Math.abs(b.y - s.site.height / 2));
  const row = rows[0];
  if (!row) return s;
  const [bought, ok] = tryCmd(s, apply, { type: 'expandLot' });
  if (!ok) return s;
  const [laid] = tryCmd(bought, apply, { type: 'paintCorridor', rect: { x: row.x + 1, y: row.y, w: plot.width - 2 - row.x, h: 1 } });
  return log(laid, 'good', 'auto.log.land');
}

/** Chapter 2: the specialised fittings in one ward, more beds to the target, and the RN team. */
function nursingCentre(s: GameState, apply: Apply): GameState {
  const def = chapterDef(s.chapter.id);
  const wards = s.site.rooms.filter((r) => r.type === 'ward');
  if (!wards.some((r) => PROGRAMME_EQUIPMENT.every((k) => (r.equipment[k] ?? 0) > 0))) {
    const ward = wards[wards.length - 1];
    const cost = PROGRAMME_EQUIPMENT.reduce((a, k) => a + EQUIPMENT[k].costSatang, 0);
    if (ward && affords(s, cost)) for (const k of PROGRAMME_EQUIPMENT) if (!(ward.equipment[k] ?? 0)) [s] = tryCmd(s, apply, { type: 'installEquipment', roomId: ward.id, equipment: k });
  }
  if (summarize(s).bedsOperational < def.targetBeds) s = build(s, apply, 'ward10');
  const rn = s.employees.filter((e) => e.role === 'rn').length;
  if (def.targetRn && rn < def.targetRn) {
    let id: string | null;
    [s, id] = hireRole(s, apply, 'rn');
    if (id) [s] = tryCmd(s, apply, { type: 'assignShift', employeeId: id, slot: 'night' });
  }
  return s;
}

/** Cells for garden items: empty, not next to a corridor (so rooms can still be built), nearest the villas. */
function gardenCell(s: GameState): { x: number; y: number } | null {
  const { site } = s;
  const villas = site.rooms.filter((r) => r.type === 'villa');
  if (!villas.length) return null;
  const taken = (x: number, y: number) =>
    site.corridor[cellIndex(x, y, site.width)] === 1 || site.rooms.some((r) => x >= r.rect.x && x < r.rect.x + r.rect.w && y >= r.rect.y && y < r.rect.y + r.rect.h) || site.decor.some((d) => d.cell.x === x && d.cell.y === y);
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = 0; y < site.height; y++)
    for (let x = 0; x < site.width; x++) {
      if (taken(x, y)) continue;
      const nearCorridor = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const i = x + dx;
        const j = y + dy;
        return i >= 0 && j >= 0 && i < site.width && j < site.height && site.corridor[cellIndex(i, j, site.width)] === 1;
      });
      if (nearCorridor) continue;
      const d = Math.min(...villas.map((v) => Math.abs(x - (v.rect.x + v.rect.w / 2)) + Math.abs(y - (v.rect.y + v.rect.h / 2))));
      if (!best || d < best.d) best = { x, y, d };
    }
  return best;
}

/** Chapter 3: land, villas for premium families, and a garden worth living in. */
function tranquila(s: GameState, apply: Apply): GameState {
  const def = chapterDef(s.chapter.id);
  if (s.chapter.id === 3 && s.site.width < (nextPlot(20)?.width ?? 32)) s = buyLand(s, apply);
  const villas = s.site.rooms.filter((r) => r.type === 'villa').length;
  if (villas < (def.targetPremium ?? 4) + 2) s = build(s, apply, 'villa');
  for (const type of ['gazebo', 'fountain', 'umbrella'] as DecorType[]) {
    while (gardenAppeal(s.site.decor) < MAX_APPEAL && affords(s, DECOR[type].costSatang)) {
      const cell = gardenCell(s);
      if (!cell) break;
      const [next, ok] = tryCmd(s, apply, { type: 'placeDecor', decor: type, cell });
      if (!ok) break;
      s = next;
    }
  }
  return s;
}

/** Chapter 4: a Home Care centre, a van for every four clients, and clients the vans can serve. */
function homeCare(s: GameState, apply: Apply): GameState {
  const def = chapterDef(s.chapter.id);
  if (!s.site.rooms.some((r) => r.type === 'homecare_office')) s = build(s, apply, 'homecare');
  const office = s.site.rooms.find((r) => r.type === 'homecare_office');
  if (!office) return s;
  const vans = office.equipment.care_van ?? 0;
  if (s.homecare.clients.length >= vans * VISITS_PER_VAN - 1 && affords(s, EQUIPMENT.care_van.costSatang)) [s] = tryCmd(s, apply, { type: 'installEquipment', roomId: office.id, equipment: 'care_van' });
  const capacity = (s.site.rooms.find((r) => r.id === office.id)!.equipment.care_van ?? 0) * VISITS_PER_VAN;
  const target = (def.targetClients ?? 12) + 2;
  for (const lead of [...s.homecare.leads]) {
    if (s.homecare.clients.length >= Math.min(target, capacity)) break;
    [s] = tryCmd(s, apply, { type: 'admitClient', leadId: lead.id });
  }
  return s;
}

/** Chapter 5 helpers: staff free for training or a placement, and the size of that pool. */
const freeStaff = (s: GameState) => s.employees.filter((e) => !e.placement && !e.branch && !s.shifts.some((x) => x.employeeId === e.id) && !s.workforce.training.some((t) => t.employeeId === e.id));
const poolSize = (s: GameState) => s.employees.filter((e) => !s.shifts.some((x) => x.employeeId === e.id)).length;

/** Send one person of `role` to `course`: someone free first, else a new hire while the pool has room. */
function train(s: GameState, apply: Apply, role: StaffRole, course: CourseId): GameState {
  if (!affords(s, COURSES[course].costSatang) || s.workforce.training.length >= trainingSeats(s)) return s;
  let trainee = freeStaff(s).find((e) => e.role === role && trainingBlocker(s, e.id, course) === null)?.id ?? null;
  if (!trainee && poolSize(s) < MAX_POOL) [s, trainee] = hireRole(s, apply, role);
  if (trainee) [s] = tryCmd(s, apply, { type: 'startTraining', employeeId: trainee, course });
  return s;
}

/** Chapter 5, training: a training room, then certificates up to the chapter's target and for waiting offers. */
function training(s: GameState, apply: Apply): GameState {
  if (!s.site.rooms.some((r) => r.type === 'training_room')) s = build(s, apply, 'training');
  if (!s.site.rooms.some((r) => r.type === 'training_room')) return s;
  // Offers that need a certificate nobody free holds yet: train someone for the next one.
  for (const o of s.workforce.offers) if (o.cert && !freeStaff(s).some((e) => placementBlocker(s, o.id, e.id) === null)) s = train(s, apply, o.role, o.cert);
  const target = chapterDef(s.chapter.id).targetCertified ?? 0;
  if (certifiedCount(s) + s.workforce.training.length < target) {
    const caregivers = s.employees.filter((e) => e.role === 'caregiver' && isCertified(e)).length;
    const before = s.workforce.training.length;
    if (caregivers >= 4) s = train(s, apply, 'pn', 'airway_cert');
    if (s.workforce.training.length === before) s = train(s, apply, 'caregiver', 'care_cert');
  }
  return s;
}

/** Chapter 5, placements: accept partner offers (factories, clinics, schools) with someone suitable, soonest expiry first. */
function placements(s: GameState, apply: Apply): GameState {
  // Partners only send requests to a home with a training room.
  if (!s.site.rooms.some((r) => r.type === 'training_room')) s = build(s, apply, 'training');
  for (const o of [...s.workforce.offers].sort((a, b) => a.expiresDay - b.expiresDay)) {
    if (s.workforce.contracts.length >= MAX_CONTRACTS) break;
    let who = freeStaff(s).find((e) => placementBlocker(s, o.id, e.id) === null)?.id ?? null;
    if (!who && !o.cert && poolSize(s) < MAX_POOL) [s, who] = hireRole(s, apply, o.role);
    if (who) [s] = tryCmd(s, apply, { type: 'acceptOffer', offerId: o.id, employeeId: who });
  }
  return s;
}

/**
 * Shop: buy the cheapest unlocked upgrade not owned yet, but only once the home has 30 beds (the
 * chapter 2 size), and while a month of running costs plus a large reserve stay in the bank
 * (growth comes first: upgrades bought early starve the chapter 2 expansion).
 */
export const SHOP_RESERVE = thb(500_000);
export const SHOP_MIN_BEDS = 30;
function shop(s: GameState, apply: Apply): GameState {
  const next = UPGRADE_ORDER.map((id) => UPGRADES[id])
    .filter((u) => !hasUpgrade(s, u.id) && (s.mode === 'sandbox' || s.chapter.id >= u.unlockChapter))
    .sort((a, b) => a.costSatang - b.costSatang)[0];
  // A 30-bed home (the chapter 2 expansion) comes first; later bed targets don't hold upgrades back.
  if (!next || summarize(s).bedsOperational < SHOP_MIN_BEDS) return s;
  if (s.organization.cashSatang < next.costSatang + 30 * dailyRunningCost(s) + SHOP_RESERVE) return s;
  const [out, ok] = tryCmd(s, apply, { type: 'buyUpgrade', upgrade: next.id });
  return ok ? log(out, 'good', 'auto.log.shop', { upgrade: next.id }) : s;
}

/** Chapter 6: the neuro clinic, then the stroke unit (the admit switch fills its beds). */
function hospital(s: GameState, apply: Apply): GameState {
  if (!s.site.rooms.some((r) => r.type === 'neuro_clinic')) return build(s, apply, 'clinic');
  if (!s.site.rooms.some((r) => r.type === 'stroke_unit')) return build(s, apply, 'stroke');
  return s;
}

/** Chapter 7: one branch of each kind with a newly hired manager; support visits keep quality up. */
const BRANCH_PLAN: Array<[BranchKind, StaffRole]> = [
  ['homecare', 'pn'],
  ['nursing', 'rn'],
  ['clinic', 'doctor'],
];
function network(s: GameState, apply: Apply): GameState {
  for (const [kind, role] of BRANCH_PLAN) {
    if (s.network.branches.some((b) => b.kind === kind)) continue;
    if (!affords(s, BRANCHES[kind].capexSatang)) break;
    let manager: string | null;
    [s, manager] = hireRole(s, apply, role);
    if (manager) [s] = tryCmd(s, apply, { type: 'openBranch', kind, managerId: manager });
    break;
  }
  for (const b of s.network.branches) {
    if (!b.managerId) {
      let manager: string | null;
      [s, manager] = hireRole(s, apply, BRANCHES[b.kind].managers[0]);
      if (manager) [s] = tryCmd(s, apply, { type: 'assignBranchManager', branchId: b.id, managerId: manager });
    }
    if (b.quality < 72 && affords(s, SUPPORT_COST)) [s] = tryCmd(s, apply, { type: 'supportBranch', branchId: b.id });
  }
  return s;
}

/** The business switches this turn serves: each one, or all of them under "play every chapter". */
export type BusinessSwitches = Pick<Required<AutoSettings>, 'chapters' | 'build' | 'estate' | 'homecare' | 'training' | 'placements' | 'branches' | 'shop'>;

/** Twice a day: the business work each switched-on helper covers, from the chapter it unlocks in. */
export function campaignTurn(state: GameState, apply: Apply, on: BusinessSwitches = { chapters: true, build: false, estate: false, homecare: false, training: false, placements: false, branches: false, shop: false }): GameState {
  if (state.chapter.result) return state;
  let s = state;
  const c = s.chapter.id;
  const all = on.chapters;
  if (c >= 2 && (all || on.build) && s.mode !== 'sandbox') s = nursingCentre(s, apply);
  if (c >= 3 && (all || on.estate)) s = tranquila(s, apply);
  if (c >= 4 && (all || on.homecare)) s = homeCare(s, apply);
  if (c >= 5 && (all || on.training)) s = training(s, apply);
  if (c >= 5 && (all || on.placements)) s = placements(s, apply);
  if (c >= 6 && (all || on.build)) s = hospital(s, apply);
  if (c >= 7 && (all || on.branches)) s = network(s, apply);
  if (on.shop) s = shop(s, apply);
  return s;
}

/** Right after a verdict: on to the next chapter after a win, or play a failed one again. */
export function advanceChapter(state: GameState, apply: Apply, speed: GameState['speed']): GameState {
  const r = state.chapter.result;
  if (!r || state.mode === 'sandbox') return state;
  const [s, ok] = tryCmd(state, apply, r.outcome === 'won' ? { type: 'startChapter' } : { type: 'retryChapter' });
  return ok ? { ...s, speed } : state;
}
