import { advance, applyCommand } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { findDoor } from '../domain/rules/navigation';
import { reconcile } from '../domain/rules/ledger';
import { roomStatus } from '../domain/rules/rooms';
import { connectPath, moveFee, turnedRect, worksMinutes } from '../sim/systems/move';
import { CORRIDOR_COST_PER_TILE } from '../data/rooms';
import type { GameState } from '../domain/types';
import { admitPlanned, buildHome, hire, ok, quietEvents } from './helpers';

const room = (s: GameState, type: string) => s.site.rooms.find((r) => r.type === type)!;

describe('moving and turning buildings', () => {
  it('moves a building with its equipment, for a fee, closed while the works last', () => {
    let s = quietEvents(buildHome(createInitialState(1)));
    const therapy = room(s, 'therapy');
    const cash = s.organization.cashSatang;
    const fee = moveFee(therapy);
    expect(fee).toBeGreaterThan(0);
    // Across the crossway (row 10), so it still has a door.
    s = ok(s, { type: 'moveRoom', roomId: therapy.id, origin: { x: 14, y: 11 } });
    const moved = room(s, 'therapy');
    expect(moved).toMatchObject({ id: therapy.id, equipment: therapy.equipment, rect: { x: 14, y: 11, w: 3, h: 3 } });
    expect(s.organization.cashSatang).toBe(cash - fee);
    expect(roomStatus(moved, s.site)).toMatchObject({ operational: false, issues: [{ kind: 'works', until: s.minute + worksMinutes(therapy) }] });
    expect(applyCommand(s, { type: 'moveRoom', roomId: therapy.id, origin: { x: 3, y: 11 } }).result).toMatchObject({ ok: false, reason: 'works_active' });
    s = advance(s, worksMinutes(therapy) / 10);
    expect(room(s, 'therapy').worksUntil).toBeUndefined();
    expect(roomStatus(room(s, 'therapy'), s.site).operational).toBe(true);
    expect(s.log.some((l) => l.key === 'log.works_done')).toBe(true);
    expect(reconcile(s).ok).toBe(true);
  });

  it('bigger buildings take longer', () => {
    const s = buildHome(createInitialState(1));
    expect(worksMinutes(room(s, 'ward'))).toBeGreaterThan(worksMinutes(room(s, 'therapy')));
    expect(worksMinutes(room(s, 'ward')) % 10).toBe(0);
  });

  it('a ward with residents cannot move until it is empty', () => {
    let s = quietEvents(buildHome(createInitialState(1)));
    [s] = hire(s, 'rn', ['morning']);
    [s] = admitPlanned(s);
    const ward = room(s, 'ward');
    expect(applyCommand(s, { type: 'moveRoom', roomId: ward.id, origin: { x: 3, y: 5 } }).result).toMatchObject({ ok: false, reason: 'room_occupied' });
    expect(applyCommand(s, { type: 'turnRoom', roomId: ward.id, turns: 1 }).result).toMatchObject({ ok: false, reason: 'room_occupied' });
  });

  it('refuses a footprint that overlaps, leaves the lot, stays put or cannot be paid', () => {
    const s = quietEvents(buildHome(createInitialState(1)));
    const therapy = room(s, 'therapy');
    expect(applyCommand(s, { type: 'moveRoom', roomId: therapy.id, origin: { x: 3, y: 6 } }).result).toMatchObject({ ok: false, reason: 'overlap' });
    expect(applyCommand(s, { type: 'moveRoom', roomId: therapy.id, origin: { x: 19, y: 0 } }).result).toMatchObject({ ok: false, reason: 'out_of_bounds' });
    expect(applyCommand(s, { type: 'moveRoom', roomId: 'nope', origin: { x: 0, y: 0 } }).result).toMatchObject({ ok: false, reason: 'not_found' });
    expect(applyCommand(s, { type: 'moveRoom', roomId: therapy.id, origin: { x: 2, y: 11 } }).result).toMatchObject({ ok: false, reason: 'nothing_to_build' });
    // Over its own old tiles is fine (the building is lifted first).
    expect(applyCommand(s, { type: 'moveRoom', roomId: therapy.id, origin: { x: 3, y: 11 } }).result.ok).toBe(true);
    const poor = { ...s, organization: { ...s.organization, cashSatang: 0 } };
    expect(applyCommand(poor, { type: 'moveRoom', roomId: therapy.id, origin: { x: 14, y: 11 } }).result).toMatchObject({ ok: false, reason: 'insufficient_funds' });
  });

  it('turning a long building swaps its sides about the centre; four turns come back', () => {
    const r = { id: 'r', type: 'ward' as const, rect: { x: 4, y: 4, w: 4, h: 6 }, equipment: {}, builtAt: 0 };
    let cur = { ...r };
    for (let i = 0; i < 4; i++) cur = { ...cur, rect: turnedRect(cur) };
    expect(cur.rect).toEqual(r.rect);
    expect(turnedRect(r)).toEqual({ x: 3, y: 5, w: 6, h: 4 });
  });

  it('doors are automatic: a square building is not turned, its door finds the corridor', () => {
    let s = quietEvents(buildHome(createInitialState(1)));
    const st = room(s, 'nursing_station');
    expect(applyCommand(s, { type: 'turnRoom', roomId: st.id, turns: 1 }).result).toMatchObject({ ok: false, reason: 'nothing_to_build' });
    // An older save's chosen door side is ignored.
    s = { ...s, site: { ...s.site, rooms: s.site.rooms.map((r) => (r.id === st.id ? { ...r, facing: 'n' } : r)) } };
    expect(findDoor(room(s, 'nursing_station'), s.site)).toEqual(findDoor(st, s.site));
  });

  it('paves the shortest corridor that gives a cut-off building its door', () => {
    let s = quietEvents(buildHome(createInitialState(1)));
    // A staff room out on its own, two tiles from the crossway.
    s = ok(s, { type: 'placeRoom', roomType: 'staff_room', rect: { x: 15, y: 5, w: 2, h: 2 } });
    const lone = s.site.rooms[s.site.rooms.length - 1];
    expect(findDoor(lone, s.site)).toBeNull();
    const tiles = connectPath(s, lone.id)!;
    expect(tiles).toHaveLength(3);
    const cash = s.organization.cashSatang;
    s = ok(s, { type: 'connectRoom', roomId: lone.id });
    expect(findDoor(room(s, 'staff_room') && s.site.rooms.find((r) => r.id === lone.id)!, s.site)).not.toBeNull();
    expect(s.organization.cashSatang).toBe(cash - 3 * CORRIDOR_COST_PER_TILE);
    expect(applyCommand(s, { type: 'connectRoom', roomId: lone.id }).result).toMatchObject({ ok: false, reason: 'already_done' });
    expect(reconcile(s).ok).toBe(true);
  });

  it('turning a long building in place needs room for its new footprint', () => {
    let s = quietEvents(buildHome(createInitialState(1)));
    const ward = room(s, 'ward');
    s = ok(s, { type: 'placeDecor', decor: 'flowers', cell: { x: 6, y: 6 } });
    expect(applyCommand(s, { type: 'turnRoom', roomId: ward.id, turns: 1 }).result).toMatchObject({ ok: false, reason: 'overlap' });
    s = { ...s, site: { ...s.site, decor: [] } };
    const cash = s.organization.cashSatang;
    s = ok(s, { type: 'turnRoom', roomId: ward.id, turns: 1 });
    expect(room(s, 'ward').rect).toEqual({ x: 2, y: 5, w: 5, h: 4 });
    expect(room(s, 'ward').worksUntil).toBe(s.minute + worksMinutes(ward));
    expect(s.organization.cashSatang).toBe(cash - moveFee(ward));
  });
});
