import { applyCommand } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { reconcile } from '../domain/rules/ledger';
import { pctOf, thb } from '../domain/money';
import { post } from '../sim/helpers';
import { STARTER_SCENARIO } from '../data/scenarios';
import { BONUS_CERTIFIED, BRANCHES, CLOSE_REFUND_PERCENT, MAX_BRANCHES, QUALITY_NO_MANAGER, START_QUALITY, SUPPORT_COST, SUPPORT_QUALITY } from '../data/network';
import { buildObjectives, peopleMarkers } from '../sim/selectors';
import { networkDayEnd, networkStats, qualityTarget } from '../sim/systems/network';
import { validate } from '../storage/format';
import type { Branch, GameState } from '../domain/types';
import { HOSPITAL, playthrough } from './bot';
import { buildHome, hire, ok, quietEvents } from './helpers';

/** A chapter 7 headquarters with a good name and plenty of cash (extra capital booked through the ledger). */
function hq(seed = 8): GameState {
  const s = post(quietEvents(buildHome(createInitialState(seed))), thb(20_000_000), 'capital', 'ledger.capital');
  return { ...s, chapter: { id: 7, startDay: 1, result: null, past: [] }, organization: { ...s.organization, reputation: 70 } };
}

function open(s: GameState, kind: Branch['kind'], role: 'rn' | 'pn' | 'doctor'): [GameState, string, string] {
  let m: string;
  [s, m] = hire(s, role, ['morning']);
  const out = applyCommand(s, { type: 'openBranch', kind, managerId: m });
  if (!out.result.ok || !out.result.id) throw new Error(`open ${kind}`);
  return [out.state, out.result.id, m];
}

const branch = (s: GameState, id: string) => s.network.branches.find((b) => b.id === id)!;
const setBranch = (s: GameState, id: string, patch: Partial<Branch>): GameState => ({ ...s, network: { ...s.network, branches: s.network.branches.map((b) => (b.id === id ? { ...b, ...patch } : b)) } });

describe('the full campaign: all 7 chapters in 390 days (scripted careful player)', () => {
  const run = playthrough(createInitialState(STARTER_SCENARIO.defaultSeed), 391, { campaign: true });
  const s = run.state;
  const verdicts = [...s.chapter.past, ...(s.chapter.result ? [s.chapter.result] : [])];

  it('wins every chapter on schedule, solvent, with the ledger intact', () => {
    expect(verdicts.map((v) => [v.chapter, v.outcome, v.day])).toEqual([
      [1, 'won', 30],
      [2, 'won', 90],
      [3, 'won', 150],
      [4, 'won', 210],
      [5, 'won', 270],
      [6, 'won', 330],
      [7, 'won', 390],
    ]);
    expect(run.minCash).toBeGreaterThan(0);
    expect(reconcile(s).ok).toBe(true);
  });

  it('runs one branch of each kind, each with a manager off the roster, billed exactly', () => {
    expect(new Set(s.network.branches.map((b) => b.kind))).toEqual(new Set(['nursing', 'homecare', 'clinic']));
    for (const b of s.network.branches) {
      const m = s.employees.find((e) => e.id === b.managerId)!;
      expect(BRANCHES[b.kind].managers).toContain(m.role);
      expect(m.branch).toBe(b.id);
      expect(s.shifts.some((x) => x.employeeId === m.id)).toBe(false);
      expect(peopleMarkers(s).some((p) => p.key === m.id)).toBe(false);
    }
    for (const i of s.invoices.filter((x) => x.kind === 'branch')) for (const l of i.lines) expect(l.amountSatang).toBe(l.qty * l.unitSatang);
    expect(networkStats(s).occupancy).toBeGreaterThanOrEqual(0.7);
  });
});

describe('chapter 7: opening branches', () => {
  it('opens only in chapter 7, with a manager of the right role, for its full price', () => {
    let early = quietEvents(buildHome(createInitialState(8)));
    let rn: string;
    [early, rn] = hire(early, 'rn');
    expect(applyCommand(early, { type: 'openBranch', kind: 'nursing', managerId: rn }).result).toMatchObject({ ok: false, reason: 'chapter_locked' });
    let s = hq();
    let pn: string;
    [s, pn] = hire(s, 'pn');
    expect(applyCommand(s, { type: 'openBranch', kind: 'nursing', managerId: pn }).result).toMatchObject({ reason: 'manager_role' });
    const cash = s.organization.cashSatang;
    let id: string, m: string;
    [s, id, m] = open(s, 'nursing', 'rn');
    expect(s.organization.cashSatang).toBe(cash - BRANCHES.nursing.capexSatang);
    expect(branch(s, id)).toMatchObject({ kind: 'nursing', managerId: m, occupancy: 0, quality: START_QUALITY });
    // The manager leaves the roster for good.
    expect(s.shifts.some((x) => x.employeeId === m)).toBe(false);
    expect(applyCommand(s, { type: 'assignShift', employeeId: m, slot: 'morning' }).result).toMatchObject({ reason: 'employee_branch' });
    expect(applyCommand(s, { type: 'openBranch', kind: 'homecare', managerId: m }).result).toMatchObject({ reason: 'employee_branch' });
    expect(reconcile(s).ok).toBe(true);
  });

  it('caps the network at five branches', () => {
    let s = hq();
    for (let i = 0; i < MAX_BRANCHES; i++) [s] = open(s, 'homecare', 'pn');
    let pn: string;
    [s, pn] = hire(s, 'pn');
    expect(applyCommand(s, { type: 'openBranch', kind: 'homecare', managerId: pn }).result).toMatchObject({ reason: 'branch_limit' });
  });
});

describe('chapter 7: running branches', () => {
  it('a good branch fills up and bills each day; a poor one empties', () => {
    let s: GameState, id: string;
    [s, id] = open(hq(), 'homecare', 'pn');
    s = setBranch(s, id, { quality: 70, occupancy: 5 });
    const before = s.invoices.length;
    const cash = s.organization.cashSatang;
    s = networkDayEnd(s, 1);
    const inv = s.invoices.slice(before).filter((i) => i.kind === 'branch');
    expect(inv).toHaveLength(1);
    expect(inv[0].totalSatang).toBe(5 * BRANCHES.homecare.ratePerUnit);
    expect(s.organization.cashSatang).toBe(cash - BRANCHES.homecare.fixedPerDay - 5 * BRANCHES.homecare.costPerUnit);
    expect(branch(s, id).occupancy).toBeGreaterThan(5);
    s = setBranch(s, id, { quality: 40, occupancy: 10 });
    s = networkDayEnd(s, 2);
    expect(branch(s, id).occupancy).toBeLessThan(10);
    // A poor name at headquarters stops growth even when the branch itself is good.
    s = setBranch({ ...s, organization: { ...s.organization, reputation: 30 } }, id, { quality: 80, occupancy: 4 });
    expect(branch(networkDayEnd(s, 3), id).occupancy).toBe(4);
    expect(reconcile(s).ok).toBe(true);
  });

  it('quality drifts toward a target the manager and headquarters set; certificates raise it; no manager drops it', () => {
    let s: GameState, id: string, m: string;
    [s, id, m] = open(hq(), 'homecare', 'pn');
    const base = qualityTarget(s, branch(s, id));
    const certified = { ...s, employees: s.employees.map((e) => (e.id === m ? { ...e, certs: ['airway_cert' as const] } : e)) };
    expect(qualityTarget(certified, branch(certified, id))).toBe(base + BONUS_CERTIFIED);
    s = networkDayEnd(s, 1);
    expect(branch(s, id).quality).toBeGreaterThan(START_QUALITY);
    // The manager leaves headquarters' staff: the branch is leaderless until someone is appointed.
    s = ok(s, { type: 'dismissStaff', employeeId: m });
    s = networkDayEnd(s, 2);
    expect(branch(s, id).managerId).toBeNull();
    expect(qualityTarget(s, branch(s, id))).toBe(QUALITY_NO_MANAGER);
    let rn: string;
    [s, rn] = hire(s, 'rn');
    s = ok(s, { type: 'assignBranchManager', branchId: id, managerId: rn });
    expect(branch(s, id).managerId).toBe(rn);
  });

  it('a support visit lifts quality at once, costs money, and can wait a week', () => {
    let s: GameState, id: string;
    [s, id] = open(hq(), 'nursing', 'rn');
    const q = branch(s, id).quality;
    const cash = s.organization.cashSatang;
    s = ok(s, { type: 'supportBranch', branchId: id });
    expect(branch(s, id).quality).toBe(q + SUPPORT_QUALITY);
    expect(s.organization.cashSatang).toBe(cash - SUPPORT_COST);
    expect(applyCommand(s, { type: 'supportBranch', branchId: id }).result).toMatchObject({ reason: 'support_cooldown' });
  });

  it('closing refunds part of the opening cost and frees the manager', () => {
    let s: GameState, id: string, m: string;
    [s, id, m] = open(hq(), 'clinic', 'doctor');
    const cash = s.organization.cashSatang;
    s = ok(s, { type: 'closeBranch', branchId: id });
    expect(s.network.branches).toHaveLength(0);
    expect(s.organization.cashSatang).toBe(cash + pctOf(BRANCHES.clinic.capexSatang, CLOSE_REFUND_PERCENT));
    expect(s.employees.find((e) => e.id === m)!.branch).toBeUndefined();
    expect(applyCommand(s, { type: 'assignShift', employeeId: m, slot: 'morning' }).result.ok).toBe(true);
  });

  it('a busy clinic branch refers patients to headquarters’ stroke unit', () => {
    let s = ok(hq(), { type: 'placePrefab', prefab: 'stroke', origin: HOSPITAL.stroke });
    let id: string;
    [s, id] = open(s, 'clinic', 'doctor');
    s = setBranch(s, id, { occupancy: 30, quality: 80 });
    let referred = 0;
    for (let d = 1; d <= 30; d++) {
      const n = s.hospital.referrals.length;
      s = networkDayEnd(s, d);
      if (s.hospital.referrals.length > n) referred++;
    }
    expect(referred).toBeGreaterThan(3);
    expect(referred).toBeLessThan(20);
  });
});

describe('chapter 7: tutorial and saves', () => {
  it('the guide walks through each kind of branch, the roster, then the targets', () => {
    expect(buildObjectives(hq()).map((g) => g.id)).toEqual(['br_nursing', 'br_homecare', 'br_clinic', 'br_roster', 'br_count', 'br_quality', 'br_occupancy', 'chapter']);
  });

  it('a version 9 save gains an empty network', () => {
    const { network: _n, ...rest } = createInitialState(3);
    const out = validate({ ...rest, schemaVersion: 9 } as unknown as GameState);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.state.network.branches).toEqual([]);
  });
});
