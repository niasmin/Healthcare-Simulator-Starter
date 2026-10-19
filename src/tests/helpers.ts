import type { Command } from '../sim/engine';
import { applyCommand } from '../sim/engine';
import type { GameState } from '../domain/types';

/** Apply a command and assert it succeeded. */
export function ok(state: GameState, cmd: Command): GameState {
  const out = applyCommand(state, cmd);
  if (!out.result.ok) throw new Error(`Command ${cmd.type} failed: ${out.result.reason}`);
  return out.state;
}

export function run(state: GameState, cmds: Command[]): GameState {
  return cmds.reduce(ok, state);
}

/** Corridor from the entrance (9,19) straight up to y=10, plus a crossway on row 10. */
export const SPINE: Command[] = [
  { type: 'paintCorridor', rect: { x: 9, y: 10, w: 1, h: 9 } },
  { type: 'paintCorridor', rect: { x: 2, y: 10, w: 16, h: 1 } },
];

import type { ResidentCandidate, StaffCandidate, StaffRole, ShiftSlot } from '../domain/types';

export const WARD = { x: 2, y: 5, w: 4, h: 5 };

/** Spine corridor + 10-bed ward + nursing station + therapy + staff room, all operational. */
export function buildHome(state: GameState, beds = 10): GameState {
  let s = run(state, [
    ...SPINE,
    { type: 'placeRoom', roomType: 'ward', rect: WARD },
    { type: 'placeRoom', roomType: 'nursing_station', rect: { x: 10, y: 7, w: 3, h: 3 } },
    { type: 'placeRoom', roomType: 'therapy', rect: { x: 2, y: 11, w: 3, h: 3 } },
    { type: 'placeRoom', roomType: 'staff_room', rect: { x: 12, y: 11, w: 2, h: 2 } },
  ]);
  const id = (t: string) => s.site.rooms.find((r) => r.type === t)!.id;
  for (let i = 0; i < beds; i++) s = ok(s, { type: 'installEquipment', roomId: id('ward'), equipment: 'care_bed' });
  s = run(s, [
    { type: 'installEquipment', roomId: id('ward'), equipment: 'call_system' },
    { type: 'installEquipment', roomId: id('nursing_station'), equipment: 'nurse_desk' },
    { type: 'installEquipment', roomId: id('nursing_station'), equipment: 'med_cart' },
    { type: 'installEquipment', roomId: id('therapy'), equipment: 'exercise_mat' },
    { type: 'installEquipment', roomId: id('therapy'), equipment: 'parallel_bars' },
    { type: 'installEquipment', roomId: id('staff_room'), equipment: 'lockers' },
  ]);
  return s;
}

/** Put a specific applicant in the pool, hire them and give them shifts. Returns [state, employeeId]. */
export function hire(state: GameState, role: StaffRole, slots: ShiftSlot[] = [], exp = 2): [GameState, string] {
  const n = state.nextId;
  const c: StaffCandidate = { id: `test-app-${n}`, name: { th: `ทดสอบ${n}`, en: `Test${n}` }, role, experienceYears: exp };
  const out = applyCommand({ ...state, applicants: [...state.applicants, c] }, { type: 'hireStaff', candidateId: c.id });
  if (!out.result.ok || !out.result.id) throw new Error('hire failed');
  let s = out.state;
  for (const slot of slots) s = ok(s, { type: 'assignShift', employeeId: out.result.id, slot });
  return [s, out.result.id];
}

/** Admit a specific resident. Returns [state, residentId]. */
export function admit(state: GameState, partial: Partial<ResidentCandidate> = {}): [GameState, string] {
  const n = state.nextId;
  const c: ResidentCandidate = {
    id: `test-cand-${n}`,
    name: { th: `ผู้พัก${n}`, en: `Resident${n}` },
    age: 78,
    group: 'stroke_rehab',
    careLevel: 3,
    needs: { physical: 70, mobility: 35, mental: 70, happiness: 60, satisfaction: 70, nutrition: 70 },
    ...partial,
  };
  const out = applyCommand({ ...state, waitlist: [...state.waitlist, c] }, { type: 'admitResident', candidateId: c.id });
  if (!out.result.ok || !out.result.id) throw new Error(`admit failed: ${!out.result.ok ? out.result.reason : ''}`);
  return [out.state, out.result.id];
}

/** Admit a resident and create their care plan straight away. */
export function admitPlanned(state: GameState, partial: Partial<ResidentCandidate> = {}): [GameState, string] {
  const [s, id] = admit(state, partial);
  return [ok(s, { type: 'createCarePlan', residentId: id }), id];
}

/** Switch random events off (for tests of other rules). */
export function quietEvents(state: GameState): GameState {
  const off = { family_visit: 1e9, resident_change: 1e9, staff_resign: 1e9, referral: 1e9 };
  return { ...state, events: { ...state.events, cooldownUntil: off } };
}
