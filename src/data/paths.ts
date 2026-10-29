import { thb } from '../domain/money';
import type { CareGroup, GameState, RoomType } from '../domain/types';

/**
 * Business paths ("เส้นทางธุรกิจ"): twelve lines of business the home can grow along, each with a
 * ladder of four upgrades bought with game cash. Six paths run on systems already in the game and
 * are open; the other six are announced and open in later versions. Every upgrade has one plain,
 * mechanical effect. ALL PRICES, TARGETS AND EFFECTS ARE FICTIONAL GAME BALANCING.
 */

export type PathId = 'nursing' | 'villa' | 'memory' | 'homecare' | 'daycare' | 'telehealth' | 'rehab' | 'neuro' | 'hospital' | 'pharmacy' | 'academy' | 'wellness';
export type PathGroup = 'longterm' | 'outreach' | 'treatment' | 'support';
/** Income an upgrade can raise: room & care in wards, in villas, for memory care; home visits; therapy; the neuro clinic and stroke unit. */
export type FeeKey = 'ward' | 'villa' | 'memory' | 'homecare' | 'therapy' | 'hospital';

export type PathEffect =
  | { kind: 'fee'; key: FeeKey; percent: number }
  | { kind: 'satisfaction'; perDay: number }
  | { kind: 'reputation'; perDay: number }
  | { kind: 'morale'; perDay: number }
  | { kind: 'enquiries'; n: number };

/** What the home must have before an upgrade can be bought (besides the one below it). */
export type PathNeed =
  | { kind: 'room'; room: RoomType; n: number }
  | { kind: 'residents'; n: number; groups?: CareGroup[]; premium?: boolean }
  | { kind: 'clients'; n: number }
  | { kind: 'staff'; role: 'doctor' | 'pt'; n: number };

export interface PerkDef {
  id: string;
  path: PathId;
  tier: 1 | 2 | 3 | 4;
  costSatang: number;
  effect: PathEffect;
  needs: PathNeed;
}

export interface PathDef {
  id: PathId;
  group: PathGroup;
  icon: string;
  /** Playable in this version. */
  open: boolean;
  perks: PerkDef[];
}

const COST = [thb(150_000), thb(350_000), thb(700_000), thb(1_200_000)] as const;
const DEMENTIA: CareGroup[] = ['dementia', 'advanced_dementia'];
const REHAB: CareGroup[] = ['stroke_rehab', 'post_surgery'];

function ladder(path: PathId, rungs: Array<[PathEffect, PathNeed]>): PerkDef[] {
  return rungs.map(([effect, needs], i) => ({ id: `${path}_${i + 1}`, path, tier: (i + 1) as PerkDef['tier'], costSatang: COST[i], effect, needs }));
}

export const PATHS: Record<PathId, PathDef> = {
  nursing: {
    id: 'nursing',
    group: 'longterm',
    icon: '🏥',
    open: true,
    perks: ladder('nursing', [
      [{ kind: 'fee', key: 'ward', percent: 5 }, { kind: 'room', room: 'ward', n: 1 }],
      [{ kind: 'satisfaction', perDay: 0.3 }, { kind: 'residents', n: 10 }],
      [{ kind: 'fee', key: 'ward', percent: 10 }, { kind: 'residents', n: 20 }],
      [{ kind: 'reputation', perDay: 0.2 }, { kind: 'residents', n: 35 }],
    ]),
  },
  villa: {
    id: 'villa',
    group: 'longterm',
    icon: '🏡',
    open: true,
    perks: ladder('villa', [
      [{ kind: 'fee', key: 'villa', percent: 8 }, { kind: 'room', room: 'villa', n: 1 }],
      [{ kind: 'satisfaction', perDay: 0.2 }, { kind: 'residents', n: 3, premium: true }],
      [{ kind: 'fee', key: 'villa', percent: 12 }, { kind: 'residents', n: 6, premium: true }],
      [{ kind: 'enquiries', n: 1 }, { kind: 'residents', n: 10, premium: true }],
    ]),
  },
  memory: {
    id: 'memory',
    group: 'longterm',
    icon: '🧩',
    open: true,
    perks: ladder('memory', [
      [{ kind: 'fee', key: 'memory', percent: 8 }, { kind: 'residents', n: 1, groups: DEMENTIA }],
      [{ kind: 'satisfaction', perDay: 0.2 }, { kind: 'residents', n: 3, groups: DEMENTIA }],
      [{ kind: 'fee', key: 'memory', percent: 12 }, { kind: 'residents', n: 6, groups: DEMENTIA }],
      [{ kind: 'reputation', perDay: 0.15 }, { kind: 'residents', n: 10, groups: DEMENTIA }],
    ]),
  },
  homecare: {
    id: 'homecare',
    group: 'outreach',
    icon: '🚐',
    open: true,
    perks: ladder('homecare', [
      [{ kind: 'fee', key: 'homecare', percent: 10 }, { kind: 'room', room: 'homecare_office', n: 1 }],
      [{ kind: 'fee', key: 'homecare', percent: 10 }, { kind: 'clients', n: 3 }],
      [{ kind: 'enquiries', n: 1 }, { kind: 'clients', n: 6 }],
      [{ kind: 'reputation', perDay: 0.15 }, { kind: 'clients', n: 10 }],
    ]),
  },
  daycare: { id: 'daycare', group: 'outreach', icon: '☀️', open: false, perks: [] },
  telehealth: { id: 'telehealth', group: 'outreach', icon: '📡', open: false, perks: [] },
  rehab: {
    id: 'rehab',
    group: 'treatment',
    icon: '🤸',
    open: true,
    perks: ladder('rehab', [
      [{ kind: 'fee', key: 'therapy', percent: 10 }, { kind: 'room', room: 'therapy', n: 1 }],
      [{ kind: 'satisfaction', perDay: 0.2 }, { kind: 'staff', role: 'pt', n: 2 }],
      [{ kind: 'fee', key: 'therapy', percent: 15 }, { kind: 'residents', n: 5, groups: REHAB }],
      [{ kind: 'reputation', perDay: 0.15 }, { kind: 'room', room: 'therapy', n: 2 }],
    ]),
  },
  neuro: {
    id: 'neuro',
    group: 'treatment',
    icon: '🧠',
    open: true,
    perks: ladder('neuro', [
      [{ kind: 'fee', key: 'hospital', percent: 10 }, { kind: 'room', room: 'neuro_clinic', n: 1 }],
      [{ kind: 'fee', key: 'hospital', percent: 10 }, { kind: 'room', room: 'stroke_unit', n: 1 }],
      [{ kind: 'morale', perDay: 0.5 }, { kind: 'staff', role: 'doctor', n: 2 }],
      [{ kind: 'reputation', perDay: 0.2 }, { kind: 'room', room: 'stroke_unit', n: 2 }],
    ]),
  },
  hospital: { id: 'hospital', group: 'treatment', icon: '🏨', open: false, perks: [] },
  pharmacy: { id: 'pharmacy', group: 'support', icon: '💊', open: false, perks: [] },
  academy: { id: 'academy', group: 'support', icon: '🎓', open: false, perks: [] },
  wellness: { id: 'wellness', group: 'support', icon: '🌿', open: false, perks: [] },
};

export const PATH_GROUPS: Array<{ group: PathGroup; paths: PathId[] }> = [
  { group: 'longterm', paths: ['nursing', 'villa', 'memory'] },
  { group: 'outreach', paths: ['homecare', 'daycare', 'telehealth'] },
  { group: 'treatment', paths: ['rehab', 'neuro', 'hospital'] },
  { group: 'support', paths: ['pharmacy', 'academy', 'wellness'] },
];

export const ALL_PERKS: PerkDef[] = Object.values(PATHS).flatMap((p) => p.perks);

export function perkDef(id: string): PerkDef | undefined {
  return ALL_PERKS.find((p) => p.id === id);
}

export function hasPerk(state: GameState, id: string): boolean {
  return !!state.perks?.includes(id);
}

/** Owned upgrades with an effect of this kind. */
function owned(state: GameState): PerkDef[] {
  return (state.perks ?? []).map(perkDef).filter((p): p is PerkDef => !!p);
}

/** Extra percent on one kind of income from owned upgrades. */
export function feeBonus(state: GameState, key: FeeKey): number {
  return owned(state).reduce((a, p) => a + (p.effect.kind === 'fee' && p.effect.key === key ? p.effect.percent : 0), 0);
}

/** A price raised by the owned upgrades for that income, in whole satang. */
export function withFeeBonus(state: GameState, key: FeeKey, amount: number): number {
  const pct = feeBonus(state, key);
  return pct ? Math.round((amount * (100 + pct)) / 100) : amount;
}

/** Daily lifts from owned upgrades. */
export function perkPerDay(state: GameState, kind: 'satisfaction' | 'reputation' | 'morale'): number {
  return owned(state).reduce((a, p) => a + (p.effect.kind === kind ? p.effect.perDay : 0), 0);
}

export function perkEnquiries(state: GameState): number {
  return owned(state).reduce((a, p) => a + (p.effect.kind === 'enquiries' ? p.effect.n : 0), 0);
}

/** How far the home is toward an upgrade's need: [have, need]. */
export function needProgress(state: GameState, need: PathNeed): [number, number] {
  switch (need.kind) {
    case 'room':
      return [state.site.rooms.filter((r) => r.type === need.room).length, need.n];
    case 'residents':
      return [state.residents.filter((r) => (need.premium ? r.premium : true) && (!need.groups || need.groups.includes(r.group))).length, need.n];
    case 'clients':
      return [state.homecare.clients.length, need.n];
    case 'staff':
      return [state.employees.filter((e) => e.role === need.role).length, need.n];
  }
}

export function needMet(state: GameState, need: PathNeed): boolean {
  const [have, n] = needProgress(state, need);
  return have >= n;
}

/** Why an upgrade cannot be bought now, or null when it can. */
export function perkBlocker(state: GameState, id: string): 'not_found' | 'path_closed' | 'already_owned' | 'needs_previous' | 'needs_unmet' | 'insufficient_funds' | null {
  const p = perkDef(id);
  if (!p) return 'not_found';
  if (!PATHS[p.path].open) return 'path_closed';
  if (hasPerk(state, id)) return 'already_owned';
  if (p.tier > 1 && !hasPerk(state, `${p.path}_${p.tier - 1}`)) return 'needs_previous';
  if (!needMet(state, p.needs)) return 'needs_unmet';
  if (state.organization.cashSatang < p.costSatang) return 'insufficient_funds';
  return null;
}

/** Upgrades owned on a path (0–4). */
export function pathLevel(state: GameState, path: PathId): number {
  return PATHS[path].perks.filter((p) => hasPerk(state, p.id)).length;
}
