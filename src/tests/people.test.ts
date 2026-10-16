import { applyCommand, advance } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { reconcile } from '../domain/rules/ledger';
import { windowsOverlap } from '../domain/rules/shifts';
import { freeBeds } from '../domain/rules/beds';
import { TICKS_PER_DAY } from '../sim/constants';
import { wellbeing } from '../sim/systems/needs';
import type { GameState } from '../domain/types';
import { admit, buildHome, hire, ok, quietEvents } from './helpers';

const fresh = () => createInitialState(7);

describe('admission and beds', () => {
  it('admits up to operational capacity and rejects excess admission', () => {
    let s = buildHome(fresh(), 2);
    [s] = admit(s);
    [s] = admit(s);
    const out = applyCommand(s, { type: 'admitResident', candidateId: s.waitlist[0].id });
    expect(out.result).toMatchObject({ ok: false, reason: 'no_free_bed' });
    expect(out.state).toBe(s);
    const beds = s.residents.map((r) => r.bedId);
    expect(new Set(beds).size).toBe(beds.length); // unique bed assignment
  });

  it('cannot admit into a ward that is not operational', () => {
    let s = buildHome(fresh(), 4);
    const ward = s.site.rooms.find((r) => r.type === 'ward')!;
    s = ok(s, { type: 'removeEquipment', roomId: ward.id, equipment: 'call_system' });
    expect(freeBeds(s)).toHaveLength(0);
    expect(applyCommand(s, { type: 'admitResident', candidateId: s.waitlist[0].id }).result).toMatchObject({ reason: 'no_free_bed' });
  });

  it('protects occupied wards and beds', () => {
    let s = buildHome(fresh(), 2);
    [s] = admit(s);
    [s] = admit(s);
    const ward = s.site.rooms.find((r) => r.type === 'ward')!;
    expect(applyCommand(s, { type: 'deleteRoom', roomId: ward.id }).result).toMatchObject({ reason: 'room_occupied' });
    expect(applyCommand(s, { type: 'removeEquipment', roomId: ward.id, equipment: 'care_bed' }).result).toMatchObject({ reason: 'bed_occupied' });
    expect(applyCommand(s, { type: 'removeEquipment', roomId: ward.id, equipment: 'call_system' }).result).toMatchObject({ reason: 'room_occupied' });
  });

  it('discharge frees the bed for the next admission', () => {
    let s = buildHome(fresh(), 1);
    let id: string;
    [s, id] = admit(s);
    expect(freeBeds(s)).toHaveLength(0);
    s = ok(s, { type: 'dischargeResident', residentId: id });
    expect(freeBeds(s)).toHaveLength(1);
  });
});

describe('shifts', () => {
  it('detects overlap across midnight and treats touching ends as non-overlapping', () => {
    expect(windowsOverlap({ start: 23 * 60, end: 7 * 60 }, { start: 6 * 60, end: 14 * 60 })).toBe(true);
    expect(windowsOverlap({ start: 23 * 60, end: 7 * 60 }, { start: 7 * 60, end: 15 * 60 })).toBe(false);
    expect(windowsOverlap({ start: 7 * 60, end: 15 * 60 }, { start: 15 * 60, end: 23 * 60 })).toBe(false);
    expect(windowsOverlap({ start: 22 * 60, end: 2 * 60 }, { start: 1 * 60, end: 3 * 60 })).toBe(true);
  });

  it('prevents overlapping shifts and caps an employee at a double shift', () => {
    let [s, id] = hire(fresh(), 'caregiver', ['morning']);
    expect(applyCommand(s, { type: 'assignShift', employeeId: id, slot: 'morning' }).result).toMatchObject({ reason: 'shift_overlap' });
    s = ok(s, { type: 'assignShift', employeeId: id, slot: 'afternoon' });
    expect(applyCommand(s, { type: 'assignShift', employeeId: id, slot: 'night' }).result).toMatchObject({ reason: 'shift_too_long' });
    s = ok(s, { type: 'unassignShift', employeeId: id, slot: 'afternoon' });
    expect(applyCommand(s, { type: 'assignShift', employeeId: id, slot: 'night' }).result.ok).toBe(true);
  });

  it('dismissing staff removes their shifts and hands back their task', () => {
    let s = buildHome(fresh());
    let rn: string, res: string;
    [s, rn] = hire(s, 'rn', ['morning']);
    [s, res] = admit(s);
    s = ok(s, { type: 'createCarePlan', residentId: res });
    s = advance(s, 6); // 07:00 -> 08:00, vital signs due
    const busy = s.tasks.find((t) => t.status === 'in_progress');
    expect(busy?.assigneeId).toBe(rn);
    s = ok(s, { type: 'dismissStaff', employeeId: rn });
    expect(s.shifts).toHaveLength(0);
    expect(s.tasks.find((t) => t.id === busy!.id)!.status).toBe('pending');
  });
});

describe('care plans and skill matching', () => {
  it('only an assessment-qualified employee can create a care plan, once', () => {
    let s = buildHome(fresh());
    let res: string;
    [s, res] = admit(s);
    expect(applyCommand(s, { type: 'createCarePlan', residentId: res }).result).toMatchObject({ reason: 'no_assessor' });
    [s] = hire(s, 'caregiver');
    expect(applyCommand(s, { type: 'createCarePlan', residentId: res }).result).toMatchObject({ reason: 'no_assessor' });
    [s] = hire(s, 'rn');
    s = ok(s, { type: 'createCarePlan', residentId: res });
    expect(s.tasks.length).toBeGreaterThan(0);
    expect(applyCommand(s, { type: 'createCarePlan', residentId: res }).result).toMatchObject({ reason: 'plan_exists' });
  });

  it('never assigns a task to staff without the required skill', () => {
    let s = buildHome(fresh());
    let res: string;
    [s] = hire(s, 'rn'); // writes the plan but works no shift
    [s] = hire(s, 'pt', ['morning']);
    [s, res] = admit(s, { group: 'bedridden', careLevel: 4 });
    s = ok(s, { type: 'createCarePlan', residentId: res });
    s = advance(s, 6 * 8); // the morning shift
    const meal = s.tasks.find((t) => t.kind === 'meal_assist' && t.dueAt === 8 * 60)!;
    expect(meal.status).toBe('missed');
    for (const t of s.tasks) if (t.assigneeId) expect(s.employees.find((e) => e.id === t.assigneeId)!.skills).toContain(t.skill);
  });

  it('off-shift staff do not work', () => {
    let s = buildHome(fresh());
    let res: string;
    [s] = hire(s, 'rn', ['night']);
    [s, res] = admit(s);
    s = ok(s, { type: 'createCarePlan', residentId: res });
    s = advance(s, 6 * 4);
    expect(s.tasks.filter((t) => t.dueAt <= s.minute - 100).every((t) => t.status === 'missed')).toBe(true);
  });

  it('prefers the least-specialised qualified staff member (saves RNs)', () => {
    let s = buildHome(fresh());
    let cg: string, res: string;
    [s] = hire(s, 'rn', ['morning']);
    [s, cg] = hire(s, 'caregiver', ['morning']);
    [s, res] = admit(s, { group: 'bedridden', careLevel: 4 });
    s = ok(s, { type: 'createCarePlan', residentId: res });
    s = advance(s, 4); // 07:40: personal care at 07:30 should be under way
    const pc = s.tasks.find((t) => t.kind === 'personal_care' && t.dueAt === 7 * 60 + 30)!;
    expect(pc.assigneeId).toBe(cg);
  });

  it('staff cannot reach a ward cut off from the entrance', () => {
    let s = buildHome(fresh());
    let res: string;
    [s] = hire(s, 'rn', ['morning']);
    [s, res] = admit(s);
    s = ok(s, { type: 'createCarePlan', residentId: res });
    s = ok(s, { type: 'bulldoze', cell: { x: 9, y: 15 } });
    s = advance(s, 6 * 4);
    expect(s.tasks.some((t) => t.status === 'done' || t.status === 'in_progress')).toBe(false);
  });
});

/** A fully staffed home with 6 residents of mixed groups. */
function staffedHome(seed: number, withStaff = true): GameState {
  let s = quietEvents(buildHome(createInitialState(seed)));
  if (withStaff) {
    [s] = hire(s, 'rn', ['morning']);
    [s] = hire(s, 'rn', ['afternoon']);
    [s] = hire(s, 'pn', ['morning']);
    [s] = hire(s, 'pn', ['afternoon']);
    [s] = hire(s, 'caregiver', ['morning']);
    [s] = hire(s, 'caregiver', ['afternoon']);
    [s] = hire(s, 'caregiver', ['night']);
    [s] = hire(s, 'pt', ['morning']);
    [s] = hire(s, 'ot', ['morning']);
    [s] = hire(s, 'ot', ['afternoon']);
  } else {
    [s] = hire(s, 'rn'); // can write plans, works no shifts
  }
  const groups = ['active_aging', 'active_aging', 'stroke_rehab', 'stroke_rehab', 'bedridden', 'bedridden'] as const;
  for (const [i, group] of groups.entries()) {
    let id: string;
    [s, id] = admit(s, { group, careLevel: group === 'active_aging' ? 1 + (i % 2) : group === 'stroke_rehab' ? 3 : 4 });
    s = ok(s, { type: 'createCarePlan', residentId: id });
  }
  return s;
}

describe('30-day deterministic care simulation', () => {
  it('same seed gives byte-identical state after 30 days', () => {
    const a = advance(staffedHome(11), TICKS_PER_DAY * 30);
    const b = advance(staffedHome(11), TICKS_PER_DAY * 30);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.history).toHaveLength(30);
  });

  it('a well-staffed home completes its care and keeps residents well; ledger reconciles', () => {
    const s = advance(staffedHome(3), TICKS_PER_DAY * 30);
    const done = s.history.reduce((a, d) => a + d.done, 0);
    const missed = s.history.reduce((a, d) => a + d.missed, 0);
    expect(done / (done + missed)).toBeGreaterThan(0.95);
    for (const r of s.residents) expect(wellbeing(r.needs)).toBeGreaterThan(45);
    const payroll = s.ledger.filter((e) => e.category === 'payroll');
    expect(payroll).toHaveLength(30);
    expect(new Set(payroll.map((e) => e.ref)).size).toBe(30);
    expect(reconcile(s).ok).toBe(true);
    // Unique beds still hold after a month
    expect(new Set(s.residents.map((r) => r.bedId)).size).toBe(s.residents.length);
    for (const e of s.employees) {
      expect(e.energy).toBeGreaterThanOrEqual(0);
      expect(e.energy).toBeLessThanOrEqual(100);
    }
  });

  it('an unstaffed home misses care and residents decline', () => {
    const good = advance(staffedHome(3), TICKS_PER_DAY * 10);
    const bad = advance(staffedHome(3, false), TICKS_PER_DAY * 10);
    const avg = (s: GameState) => s.residents.reduce((a, r) => a + wellbeing(r.needs), 0) / s.residents.length;
    expect(bad.history.reduce((a, d) => a + d.done, 0)).toBe(0);
    expect(avg(bad)).toBeLessThan(avg(good) - 15);
  });
});
