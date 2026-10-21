import { freeBeds, parseBedId } from '../domain/rules/beds';
import { BREAK_ENERGY, peopleMarkers } from '../sim/selectors';
import { createInitialState } from '../sim/state';
import type { CareTask, GameState } from '../domain/types';
import { admit, buildHome, hire, ok, quietEvents } from './helpers';

/** The test home plus a second ward and a second nursing station on the same corridor. */
function twoWards(): GameState {
  let s = quietEvents(buildHome(createInitialState(8)));
  s = ok(s, { type: 'placeRoom', roomType: 'ward', rect: { x: 14, y: 5, w: 4, h: 5 } });
  const ward2 = s.site.rooms[s.site.rooms.length - 1].id;
  for (let i = 0; i < 10; i++) s = ok(s, { type: 'installEquipment', roomId: ward2, equipment: 'care_bed' });
  s = ok(s, { type: 'installEquipment', roomId: ward2, equipment: 'call_system' });
  s = ok(s, { type: 'placeRoom', roomType: 'nursing_station', rect: { x: 6, y: 7, w: 3, h: 3 } });
  const st2 = s.site.rooms[s.site.rooms.length - 1].id;
  s = ok(s, { type: 'installEquipment', roomId: st2, equipment: 'nurse_desk' });
  s = ok(s, { type: 'installEquipment', roomId: st2, equipment: 'med_cart' });
  return s;
}
const wardOf = (bed: string) => parseBedId(bed).roomId;

describe('every room gets used', () => {
  it('new residents go to the emptiest ward, so both wards fill evenly', () => {
    let s = twoWards();
    const wards = s.site.rooms.filter((r) => r.type === 'ward').map((r) => r.id);
    for (let i = 0; i < 6; i++) [s] = admit(s);
    const count = (id: string) => s.residents.filter((r) => wardOf(r.bedId) === id).length;
    expect(count(wards[0])).toBe(3);
    expect(count(wards[1])).toBe(3);
    // With one ward fuller, the next bed offered is in the other one.
    expect(wardOf(freeBeds(s)[0])).toBe(wards[0]);
  });

  it('idle nurses and caregivers spread over every nursing station', () => {
    let s = twoWards();
    for (const role of ['rn', 'pn', 'caregiver', 'caregiver'] as const) [s] = hire(s, role, ['morning']);
    const stations = new Set(s.site.rooms.filter((r) => r.type === 'nursing_station').map((r) => r.id));
    const used = new Set(peopleMarkers(s).filter((m) => m.kind === 'staff').map((m) => m.roomId));
    expect([...stations].every((id) => used.has(id))).toBe(true);
  });

  it('tired staff take their break in the staff room; therapists wait in the therapy room', () => {
    let s = twoWards();
    let tired: string, pt: string;
    [s, tired] = hire(s, 'caregiver', ['morning']);
    [s, pt] = hire(s, 'pt', ['morning']);
    s = { ...s, employees: s.employees.map((e) => (e.id === tired ? { ...e, energy: BREAK_ENERGY - 5 } : e)) };
    const room = (id: string) => s.site.rooms.find((r) => r.id === peopleMarkers(s).find((m) => m.key === id)?.roomId)?.type;
    expect(room(tired)).toBe('staff_room');
    expect(room(pt)).toBe('therapy');
  });

  it('a therapy session brings the resident and the therapist to the therapy room', () => {
    let s = twoWards();
    let rid: string, pt: string;
    [s, rid] = admit(s);
    [s, pt] = hire(s, 'pt', ['morning']);
    const task: CareTask = { id: 'tk-th', residentId: rid, kind: 'mobility_session', skill: 'mobility', dueAt: s.minute, duration: 40, priority: 3, status: 'in_progress', assigneeId: pt, finishAt: s.minute + 40 };
    s = { ...s, tasks: [task], employees: s.employees.map((e) => (e.id === pt ? { ...e, taskId: task.id, busyUntil: s.minute + 40 } : e)) };
    const therapy = s.site.rooms.find((r) => r.type === 'therapy')!.id;
    const ms = peopleMarkers(s);
    expect(ms.find((m) => m.key === rid)).toMatchObject({ roomId: therapy });
    expect(ms.find((m) => m.key === rid)?.bed).toBeUndefined();
    expect(ms.find((m) => m.key === pt)).toMatchObject({ roomId: therapy });
  });
});
