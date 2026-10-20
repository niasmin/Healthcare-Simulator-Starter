import { applyCommand, step } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { reconcile } from '../domain/rules/ledger';
import { STARTER_SCENARIO } from '../data/scenarios';
import { COURSES, PLACEMENT_RATE } from '../data/workforce';
import { prefabCost, prefabDef } from '../data/prefabs';
import { buildObjectives, peopleMarkers } from '../sim/selectors';
import { certifiedCount, workforceDayEnd } from '../sim/systems/workforce';
import { MINUTES_PER_DAY } from '../sim/constants';
import { validate } from '../storage/format';
import type { GameState, WorkforceOffer } from '../domain/types';
import { NEW_LAND, TRAINING_ROOM, playthrough } from './bot';
import { buildHome, hire, ok, quietEvents } from './helpers';

/** A chapter 5 home on the bought land, with a 2-seat training room. */
function withTrainingRoom(seed = 8): GameState {
  let s = quietEvents(buildHome(createInitialState(seed)));
  s = { ...s, chapter: { id: 5, startDay: 1, result: null, past: [] } };
  s = ok(ok(s, { type: 'expandLot' }), { type: 'paintCorridor', rect: NEW_LAND.corridor });
  return ok(s, { type: 'placePrefab', prefab: 'training', origin: TRAINING_ROOM });
}

/** Step until the clock shows this minute of the day. */
function until(s: GameState, mod: number): GameState {
  do s = step(s);
  while (s.minute % MINUTES_PER_DAY !== mod);
  return s;
}

const offer = (partial: Partial<WorkforceOffer> = {}): WorkforceOffer => ({
  id: 'offer-t1',
  org: { th: 'คลินิกทดสอบ', en: 'Test Clinic' },
  orgKind: 'clinic',
  role: 'caregiver',
  cert: null,
  days: 2,
  ratePerDay: PLACEMENT_RATE.caregiver,
  expiresDay: 99,
  ...partial,
});

const withOffer = (s: GameState, o: WorkforceOffer): GameState => ({ ...s, workforce: { ...s.workforce, offers: [...s.workforce.offers, o] } });

describe('the full campaign: chapters 1–5 in 270 days (scripted careful player)', () => {
  const run = playthrough(createInitialState(STARTER_SCENARIO.defaultSeed), 271, { campaign: true });
  const s = run.state;
  const verdicts = [...s.chapter.past, ...(s.chapter.result ? [s.chapter.result] : [])];

  it('wins chapter 5 on schedule, solvent, with the ledger intact', () => {
    expect(verdicts.map((v) => [v.chapter, v.outcome, v.day])).toEqual([
      [1, 'won', 30],
      [2, 'won', 90],
      [3, 'won', 150],
      [4, 'won', 210],
      [5, 'won', 270],
    ]);
    expect(run.minCash).toBeGreaterThan(0);
    expect(reconcile(s).ok).toBe(true);
  });

  it('certifies staff, bills placements per day worked, and keeps placed staff off the roster', () => {
    expect(certifiedCount(s)).toBeGreaterThanOrEqual(6);
    const b2b = s.invoices.filter((i) => i.kind === 'b2b');
    expect(b2b.length).toBeGreaterThan(0);
    for (const i of b2b) for (const l of i.lines) expect(l.amountSatang).toBe(l.qty * l.unitSatang);
    for (const c of s.workforce.contracts) {
      expect(s.employees.find((e) => e.id === c.employeeId)?.placement).toBe(c.id);
      expect(s.shifts.some((x) => x.employeeId === c.employeeId)).toBe(false);
    }
    expect(s.ledger.some((e) => e.category === 'training')).toBe(true);
  });
});

describe('chapter 5: training', () => {
  it('needs an operational training room, the right role and a free seat', () => {
    let s = quietEvents(buildHome(createInitialState(8)));
    let cg: string, pn: string;
    [s, cg] = hire(s, 'caregiver', ['morning']);
    expect(applyCommand(s, { type: 'startTraining', employeeId: cg, course: 'care_cert' }).result).toMatchObject({ ok: false, reason: 'no_training_room' });
    s = withTrainingRoom();
    [s, cg] = hire(s, 'caregiver', ['morning']);
    [s, pn] = hire(s, 'pn', ['morning']);
    expect(applyCommand(s, { type: 'startTraining', employeeId: cg, course: 'airway_cert' }).result).toMatchObject({ reason: 'course_not_allowed' });
    const before = s.organization.cashSatang;
    s = ok(s, { type: 'startTraining', employeeId: cg, course: 'care_cert' });
    expect(s.organization.cashSatang).toBe(before - COURSES.care_cert.costSatang);
    expect(applyCommand(s, { type: 'startTraining', employeeId: cg, course: 'tube_cert' }).result).toMatchObject({ reason: 'employee_busy' });
    s = ok(s, { type: 'startTraining', employeeId: pn, course: 'airway_cert' });
    // Two manikins, two seats.
    let third: string;
    [s, third] = hire(s, 'caregiver', ['morning']);
    expect(applyCommand(s, { type: 'startTraining', employeeId: third, course: 'care_cert' }).result).toMatchObject({ reason: 'no_seat' });
    expect(reconcile(s).ok).toBe(true);
  });

  it('class is taken during the shift, in the training room, and passing adds the qualification', () => {
    let s = withTrainingRoom();
    let cg: string;
    [s, cg] = hire(s, 'caregiver', ['morning']);
    s = until(s, 6 * 60);
    s = ok(s, { type: 'startTraining', employeeId: cg, course: 'tube_cert' });
    // Before the shift: no class yet.
    s = step(s);
    expect(s.workforce.training[0].remaining).toBe(COURSES.tube_cert.minutes);
    s = until(s, 8 * 60);
    const e = s.employees.find((x) => x.id === cg)!;
    expect(e.taskId?.startsWith('train-')).toBe(true);
    const room = s.site.rooms.find((r) => r.type === 'training_room')!;
    expect(peopleMarkers(s).find((m) => m.key === cg)?.roomId).toBe(room.id);
    // The 8-hour shift is exactly one course.
    s = until(s, 15 * 60);
    const done = s.employees.find((x) => x.id === cg)!;
    expect(s.workforce.training).toHaveLength(0);
    expect(done.certs).toEqual(['tube_cert']);
    expect(done.skills).toContain('tube_feeding');
    expect(done.taskId).toBeNull();
  });

  it('staff without shifts attend 08:00–16:00', () => {
    let s = withTrainingRoom();
    let cg: string;
    [s, cg] = hire(s, 'caregiver');
    s = until(s, 6 * 60);
    s = ok(s, { type: 'startTraining', employeeId: cg, course: 'care_cert' });
    s = until(s, 16 * 60);
    expect(s.employees.find((x) => x.id === cg)!.certs).toEqual(['care_cert']);
  });
});

describe('chapter 5: placements', () => {
  it('match the requested role and certificate, take the employee off the roster, and block new shifts', () => {
    let s = withOffer(withTrainingRoom(), offer({ cert: 'care_cert' }));
    let cg: string, pn: string;
    [s, cg] = hire(s, 'caregiver', ['morning']);
    [s, pn] = hire(s, 'pn');
    expect(applyCommand(s, { type: 'acceptOffer', offerId: 'offer-t1', employeeId: pn }).result).toMatchObject({ reason: 'role_mismatch' });
    expect(applyCommand(s, { type: 'acceptOffer', offerId: 'offer-t1', employeeId: cg }).result).toMatchObject({ reason: 'needs_cert' });
    s = { ...s, employees: s.employees.map((e) => (e.id === cg ? { ...e, certs: ['care_cert'] } : e)) };
    s = ok(s, { type: 'acceptOffer', offerId: 'offer-t1', employeeId: cg });
    expect(s.shifts.some((x) => x.employeeId === cg)).toBe(false);
    expect(s.workforce.offers).toHaveLength(0);
    expect(applyCommand(s, { type: 'assignShift', employeeId: cg, slot: 'afternoon' }).result).toMatchObject({ reason: 'employee_placed' });
    expect(applyCommand(s, { type: 'startTraining', employeeId: cg, course: 'tube_cert' }).result).toMatchObject({ reason: 'employee_placed' });
  });

  it('work 07:00–15:00 at the partner, are billed per day, and come back when the contract is done', () => {
    let s = withOffer(withTrainingRoom(), offer({ days: 2 }));
    let cg: string;
    [s, cg] = hire(s, 'caregiver');
    s = until(s, 6 * 60);
    s = ok(s, { type: 'acceptOffer', offerId: 'offer-t1', employeeId: cg });
    s = until(s, 7 * 60);
    expect(s.employees.find((x) => x.id === cg)!.taskId?.startsWith('place-')).toBe(true);
    expect(peopleMarkers(s).some((m) => m.key === cg)).toBe(false);
    s = until(s, 15 * 60);
    expect(s.employees.find((x) => x.id === cg)!.taskId).toBeNull();
    expect(s.workforce.contracts[0].done).toBe(1);
    s = until(s, 0);
    const inv = s.invoices.filter((i) => i.kind === 'b2b');
    expect(inv).toHaveLength(1);
    expect(inv[0].totalSatang).toBe(PLACEMENT_RATE.caregiver);
    s = until(s, 0);
    expect(s.workforce.contracts).toHaveLength(0);
    expect(s.workforce.past.map((p) => [p.outcome, p.done, p.missed])).toEqual([['completed', 2, 0]]);
    expect(s.employees.find((x) => x.id === cg)!.placement).toBeUndefined();
    expect(reconcile(s).ok).toBe(true);
  });

  it('ending early, or losing the employee, ends the contract and costs reputation', () => {
    let s = withOffer(withTrainingRoom(), offer({ days: 10 }));
    let cg: string;
    [s, cg] = hire(s, 'caregiver');
    s = ok(s, { type: 'acceptOffer', offerId: 'offer-t1', employeeId: cg });
    const rep = s.organization.reputation;
    s = ok(s, { type: 'dismissStaff', employeeId: cg });
    s = step(s);
    expect(s.workforce.contracts).toHaveLength(0);
    expect(s.workforce.past[0].outcome).toBe('ended');
    expect(s.organization.reputation).toBe(rep - 2);
  });

  it('requests arrive only from chapter 5 with a training room, and expire', () => {
    const early = quietEvents(buildHome(createInitialState(8)));
    expect(workforceDayEnd(early, 1).workforce.offers).toHaveLength(0);
    let s = workforceDayEnd(withTrainingRoom(), 1);
    expect(s.workforce.offers.length).toBeGreaterThan(0);
    for (const o of s.workforce.offers) expect(o.ratePerDay).toBeGreaterThanOrEqual(PLACEMENT_RATE[o.role]);
    s = { ...s, workforce: { ...s.workforce, offers: s.workforce.offers.map((o) => ({ ...o, expiresDay: 1 })) } };
    expect(workforceDayEnd({ ...s, chapter: { ...s.chapter, id: 4 } }, 1).workforce.offers).toHaveLength(0);
  });
});

describe('chapter 5: tutorial and saves', () => {
  it('the guide walks through room, first certificate, first placement and the targets', () => {
    const s = withTrainingRoom();
    const goals = buildObjectives(s);
    expect(goals.map((g) => g.id)).toEqual(['tr_room', 'tr_first', 'wf_first', 'wf_roster', 'certified', 'contracts', 'chapter']);
    expect(goals[0].done).toBe(true);
    expect(prefabCost(prefabDef('training')!)).toBeGreaterThan(0);
  });

  it('a version 7 save gains an empty workforce', () => {
    const { workforce: _w, ...rest } = createInitialState(3);
    const v7 = { ...rest, schemaVersion: 7 } as unknown as GameState;
    const out = validate(v7);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.state.workforce).toEqual({ training: [], offers: [], contracts: [], past: [] });
  });
});
