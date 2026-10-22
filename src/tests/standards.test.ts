import { advance, applyCommand } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { FINE_PER_ITEM_SATANG, FIRST_INSPECTION_DAYS, FOLLOW_UP_DAYS, INSPECTION_EVERY_DAYS, REASSESS_DAYS, SAFETY_KIT_SATANG } from '../data/standards';
import { carersNeeded, rosteredCarers, standardsChecklist } from '../sim/systems/standards';
import { reconcile } from '../domain/rules/ledger';
import type { GameState, StandardId } from '../domain/types';
import { admitPlanned, buildHome, hire, ok, quietEvents, run } from './helpers';

const DAY = 144;
const check = (s: GameState, id: StandardId) => standardsChecklist(s).find((c) => c.id === id)!;
const failing = (s: GameState) => standardsChecklist(s).filter((c) => !c.ok).map((c) => c.id);

/** A home that meets every check: the test home plus a bathroom, the kit, a drill and a therapist. */
function compliantHome(): GameState {
  let s = quietEvents(buildHome(createInitialState(1)));
  s = run(s, [{ type: 'placeRoom', roomType: 'bathroom', rect: { x: 15, y: 8, w: 2, h: 2 } }]);
  const bath = s.site.rooms.find((r) => r.type === 'bathroom')!.id;
  s = ok(s, { type: 'installEquipment', roomId: bath, equipment: 'bath_set' });
  [s] = hire(s, 'rn', ['morning']);
  [s] = hire(s, 'caregiver', ['night']);
  [s] = hire(s, 'pt', ['morning']);
  s = ok(s, { type: 'setStandards', on: true });
  s = ok(s, { type: 'buySafetyKit' });
  s = ok(s, { type: 'runDrill' });
  return s;
}

describe('licensing standards mode', () => {
  it('is off by default and the checklist is pure (reading it changes nothing)', () => {
    const s = createInitialState(1);
    expect(s.standards).toBeUndefined();
    const before = JSON.stringify(s);
    standardsChecklist(s);
    expect(JSON.stringify(s)).toBe(before);
    expect(applyCommand(s, { type: 'buySafetyKit' }).result).toEqual({ ok: false, reason: 'standards_off' });
  });

  it('a fully set-up home passes every check', () => {
    const s = compliantHome();
    expect(failing(s)).toEqual([]);
    expect(s.organization.cashSatang).toBeLessThan(createInitialState(1).organization.cashSatang);
    expect(reconcile(s).ok).toBe(true);
  });

  it('counts one rostered carer for every five residents (ข้อ 8)', () => {
    let s = compliantHome();
    for (let i = 0; i < 5; i++) [s] = admitPlanned(s);
    expect(carersNeeded(s)).toBe(1);
    for (let i = 0; i < 5; i++) [s] = admitPlanned(s);
    expect(carersNeeded(s)).toBe(2);
    expect(rosteredCarers(s)).toBe(2);
    expect(check(s, 'ratio').ok).toBe(true);
    // Without a shift, a carer on the staff does not count.
    const rn = s.employees.find((e) => e.role === 'rn')!.id;
    s = ok(s, { type: 'unassignShift', employeeId: rn, slot: 'morning' });
    expect(check(s, 'ratio')).toMatchObject({ ok: false, params: { have: 1, need: 2 } });
    // A therapist is not a carer for the ratio.
    [s] = hire(s, 'pt', ['afternoon']);
    expect(check(s, 'ratio').ok).toBe(false);
    [s] = hire(s, 'caregiver', ['afternoon']);
    expect(check(s, 'ratio').ok).toBe(true);
  });

  it('needs a carer on the night shift once anyone lives in', () => {
    let s = quietEvents(buildHome(createInitialState(1)));
    expect(check(s, 'night_watch').ok).toBe(true);
    [s] = hire(s, 'rn', ['morning']);
    [s] = admitPlanned(s);
    expect(check(s, 'night_watch').ok).toBe(false);
    [s] = hire(s, 'caregiver', ['night']);
    expect(check(s, 'night_watch').ok).toBe(true);
  });

  it('first inspection after the grace period: an order to fix, then a fine at the follow-up', () => {
    let s = quietEvents(buildHome(createInitialState(1)));
    s = ok(s, { type: 'setStandards', on: true });
    expect(s.standards!.nextInspection).toBe(1 + FIRST_INSPECTION_DAYS);
    const missing = failing(s).length;
    expect(missing).toBeGreaterThan(0);
    s = advance(s, DAY * (FIRST_INSPECTION_DAYS + 1));
    expect(s.log.some((l) => l.key === 'log.inspection_notice')).toBe(true);
    expect(s.standards!.history).toHaveLength(1);
    expect(s.standards!.history[0]).toMatchObject({ followUp: false, fineSatang: 0 });
    expect(s.standards!.followUp).toBe(true);
    s = advance(s, DAY * FOLLOW_UP_DAYS);
    const visit = s.standards!.history[1];
    expect(visit.followUp).toBe(true);
    expect(visit.fineSatang).toBe(visit.failed.length * FINE_PER_ITEM_SATANG);
    expect(s.ledger.filter((e) => e.memo === 'ledger.inspection_fine')).toHaveLength(1);
    expect(s.standards!.followUp).toBe(false);
    expect(reconcile(s).ok).toBe(true);
  });

  it('a compliant home passes and gains reputation; the next visit is a month later', () => {
    let s = compliantHome();
    const day = s.standards!.nextInspection;
    s = advance(s, DAY * (FIRST_INSPECTION_DAYS + 1));
    const visit = s.standards!.history[0];
    expect(visit).toMatchObject({ day, failed: [], fineSatang: 0 });
    expect(s.standards!.nextInspection).toBe(day + INSPECTION_EVERY_DAYS);
    expect(s.log.some((l) => l.key === 'log.inspection_pass')).toBe(true);
  });

  it('care plans come due for review every three months and can then be written again', () => {
    let s = compliantHome();
    let id: string;
    [s, id] = admitPlanned(s);
    expect(applyCommand(s, { type: 'createCarePlan', residentId: id }).result).toEqual({ ok: false, reason: 'plan_exists' });
    s = { ...s, minute: s.minute + REASSESS_DAYS * 1440 };
    expect(check(s, 'assessment')).toMatchObject({ ok: false, params: { due: 1 } });
    const tasks = s.tasks.length;
    s = ok(s, { type: 'createCarePlan', residentId: id });
    expect(check(s, 'assessment').ok).toBe(true);
    // The review does not add a second set of today's tasks.
    expect(s.tasks.length).toBe(tasks);
  });

  it('one safety kit, one drill a day; switching off keeps what was bought', () => {
    let s = compliantHome();
    expect(applyCommand(s, { type: 'buySafetyKit' }).result).toEqual({ ok: false, reason: 'already_done' });
    expect(applyCommand(s, { type: 'runDrill' }).result).toEqual({ ok: false, reason: 'already_done' });
    s = ok(s, { type: 'setStandards', on: false });
    expect(s.standards).toMatchObject({ on: false, safetyKit: true });
    s = ok(s, { type: 'setStandards', on: true });
    expect(s.standards!.safetyKit).toBe(true);
    const poor = { ...s, organization: { ...s.organization, cashSatang: SAFETY_KIT_SATANG - 1 }, standards: { ...s.standards!, safetyKit: false } };
    expect(applyCommand(poor, { type: 'buySafetyKit' }).result).toEqual({ ok: false, reason: 'insufficient_funds' });
  });

  it('is deterministic', () => {
    const a = advance(compliantHome(), DAY * 20);
    const b = advance(compliantHome(), DAY * 20);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
