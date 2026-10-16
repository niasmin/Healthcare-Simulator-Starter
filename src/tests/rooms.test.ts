import { applyCommand } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { roomStatus } from '../domain/rules/rooms';
import { reachableCorridor } from '../domain/rules/navigation';
import { summarize, buildObjectives } from '../sim/selectors';
import { reconcile } from '../domain/rules/ledger';
import { ok, run, SPINE } from './helpers';
import type { Command } from '../sim/engine';

const WARD = { x: 2, y: 5, w: 4, h: 5 }; // bottom edge row 9, touches spine row 10

describe('navigable paths', () => {
  it('reachability flows from the entrance through connected corridor only', () => {
    let s = run(createInitialState(1), SPINE);
    s = ok(s, { type: 'paintCorridor', rect: { x: 15, y: 2, w: 1, h: 3 } }); // island
    const reach = reachableCorridor(s.site);
    expect(reach[19 * 20 + 9]).toBe(1);
    expect(reach[10 * 20 + 2]).toBe(1);
    expect(reach[3 * 20 + 15]).toBe(0);
  });

  it('a room without a reachable corridor has no access', () => {
    const s = ok(createInitialState(1), { type: 'placeRoom', roomType: 'ward', rect: WARD });
    const st = roomStatus(s.site.rooms[0], s.site);
    expect(st.door).toBeNull();
    expect(st.issues.some((i) => i.kind === 'no_access')).toBe(true);
    expect(st.operational).toBe(false);
  });

  it('gets a deterministic door once a reachable corridor touches it', () => {
    const s = run(createInitialState(1), [...SPINE, { type: 'placeRoom', roomType: 'ward', rect: WARD }]);
    const st = roomStatus(s.site.rooms[0], s.site);
    expect(st.door).toEqual({ inside: { x: 2, y: 9 }, outside: { x: 2, y: 10 } });
  });

  it('cutting the corridor disconnects the room', () => {
    let s = run(createInitialState(1), [...SPINE, { type: 'placeRoom', roomType: 'ward', rect: WARD }]);
    s = ok(s, { type: 'bulldoze', cell: { x: 9, y: 15 } });
    expect(roomStatus(s.site.rooms[0], s.site).door).toBeNull();
  });
});

describe('equipment and capacity', () => {
  const setup: Command[] = [...SPINE, { type: 'placeRoom', roomType: 'ward', rect: WARD }];

  it('a ward needs beds and a call system before it operates', () => {
    let s = run(createInitialState(1), setup);
    const id = s.site.rooms[0].id;
    expect(roomStatus(s.site.rooms[0], s.site).operational).toBe(false);
    s = ok(s, { type: 'installEquipment', roomId: id, equipment: 'care_bed' });
    expect(roomStatus(s.site.rooms[0], s.site).operational).toBe(false);
    s = ok(s, { type: 'installEquipment', roomId: id, equipment: 'call_system' });
    const st = roomStatus(s.site.rooms[0], s.site);
    expect(st.operational).toBe(true);
    expect(st.capacity).toBe(1);
  });

  it('bed count is capped by floor area (2 tiles per bed) and never negative', () => {
    let s = run(createInitialState(1), setup);
    const id = s.site.rooms[0].id;
    for (let i = 0; i < 10; i++) s = ok(s, { type: 'installEquipment', roomId: id, equipment: 'care_bed' });
    expect(applyCommand(s, { type: 'installEquipment', roomId: id, equipment: 'care_bed' }).result).toMatchObject({ ok: false, reason: 'equipment_limit' });
    for (let i = 0; i < 10; i++) s = ok(s, { type: 'removeEquipment', roomId: id, equipment: 'care_bed' });
    expect(applyCommand(s, { type: 'removeEquipment', roomId: id, equipment: 'care_bed' }).result).toMatchObject({ ok: false, reason: 'equipment_none' });
    expect(s.site.rooms[0].equipment.care_bed ?? 0).toBe(0);
    expect(reconcile(s).ok).toBe(true);
  });

  it('rejects equipment that does not belong in the room type', () => {
    const s = run(createInitialState(1), setup);
    expect(applyCommand(s, { type: 'installEquipment', roomId: s.site.rooms[0].id, equipment: 'lockers' }).result).toMatchObject({
      reason: 'equipment_not_allowed',
    });
  });

  it('a full 10-bed ward completes the bed objective', () => {
    let s = run(createInitialState(1), setup);
    const id = s.site.rooms[0].id;
    for (let i = 0; i < 10; i++) s = ok(s, { type: 'installEquipment', roomId: id, equipment: 'care_bed' });
    s = ok(s, { type: 'installEquipment', roomId: id, equipment: 'call_system' });
    const sum = summarize(s);
    expect(sum.bedsOperational).toBe(10);
    expect(buildObjectives(s, sum).find((o) => o.id === 'beds')!.done).toBe(true);
  });
});
