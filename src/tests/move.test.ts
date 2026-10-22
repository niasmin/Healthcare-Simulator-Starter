import { applyCommand } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { findDoor } from '../domain/rules/navigation';
import { reconcile } from '../domain/rules/ledger';
import { roomStatus } from '../domain/rules/rooms';
import { moveFee, turnedPlacement } from '../sim/systems/move';
import type { GameState } from '../domain/types';
import { admitPlanned, buildHome, hire, ok, quietEvents } from './helpers';

const room = (s: GameState, type: string) => s.site.rooms.find((r) => r.type === type)!;

describe('moving and turning buildings', () => {
  it('moves a building with its equipment and residents, for a fee', () => {
    let s = quietEvents(buildHome(createInitialState(1)));
    [s] = hire(s, 'rn', ['morning']);
    let rid: string;
    [s, rid] = admitPlanned(s);
    const therapy = room(s, 'therapy');
    const cash = s.organization.cashSatang;
    const fee = moveFee(therapy);
    expect(fee).toBeGreaterThan(0);
    // Across the crossway (row 10), so it still has a door.
    s = ok(s, { type: 'moveRoom', roomId: therapy.id, origin: { x: 14, y: 11 } });
    const moved = room(s, 'therapy');
    expect(moved).toMatchObject({ id: therapy.id, equipment: therapy.equipment, rect: { x: 14, y: 11, w: 3, h: 3 } });
    expect(s.organization.cashSatang).toBe(cash - fee);
    expect(roomStatus(moved, s.site).operational).toBe(true);
    // The resident's bed is keyed by the ward's id, so moving the ward keeps them in it.
    const ward = room(s, 'ward');
    s = ok(s, { type: 'moveRoom', roomId: ward.id, origin: { x: 3, y: 5 } });
    expect(room(s, 'ward').rect).toMatchObject({ x: 3, y: 5 });
    expect(roomStatus(room(s, 'ward'), s.site).operational).toBe(true);
    expect(s.residents.find((r) => r.id === rid)!.bedId.startsWith(`${ward.id}#`)).toBe(true);
    expect(reconcile(s).ok).toBe(true);
  });

  it('refuses a footprint that overlaps, leaves the lot or changes size', () => {
    const s = quietEvents(buildHome(createInitialState(1)));
    const therapy = room(s, 'therapy');
    expect(applyCommand(s, { type: 'moveRoom', roomId: therapy.id, origin: { x: 3, y: 6 } }).result).toMatchObject({ ok: false, reason: 'overlap' });
    expect(applyCommand(s, { type: 'moveRoom', roomId: therapy.id, origin: { x: 19, y: 0 } }).result).toMatchObject({ ok: false, reason: 'out_of_bounds' });
    expect(applyCommand(s, { type: 'moveRoom', roomId: 'nope', origin: { x: 0, y: 0 } }).result).toMatchObject({ ok: false, reason: 'not_found' });
    // Over its own old tiles is fine (the building is lifted first).
    expect(applyCommand(s, { type: 'moveRoom', roomId: therapy.id, origin: { x: 3, y: 11 } }).result.ok).toBe(true);
    const poor = { ...s, organization: { ...s.organization, cashSatang: 0 } };
    expect(applyCommand(poor, { type: 'moveRoom', roomId: therapy.id, origin: { x: 14, y: 11 } }).result).toMatchObject({ ok: false, reason: 'insufficient_funds' });
  });

  it('turning a long building swaps its sides about the centre; four turns come back', () => {
    const r = { id: 'r', type: 'ward' as const, rect: { x: 4, y: 4, w: 4, h: 6 }, equipment: {}, builtAt: 0 };
    let cur = { ...r } as typeof r & { facing?: 's' | 'e' | 'n' | 'w' };
    for (let i = 0; i < 4; i++) cur = { ...cur, ...turnedPlacement(cur, 1) };
    expect(cur.rect).toEqual(r.rect);
    expect(cur.facing).toBe('s');
    expect(turnedPlacement(r, 1).rect).toEqual({ x: 3, y: 5, w: 6, h: 4 });
    expect(turnedPlacement(r, 1).facing).toBe('w');
    expect(turnedPlacement(r, -1).facing).toBe('e');
  });

  it('turning a square building only moves its door, free', () => {
    let s = quietEvents(buildHome(createInitialState(1)));
    // The nursing station (10,7 3x3) touches the crossway below and the spine? Give it corridor on its right too.
    s = ok(s, { type: 'paintCorridor', rect: { x: 13, y: 7, w: 1, h: 3 } });
    const st = room(s, 'nursing_station');
    expect(findDoor(st, s.site)!.outside.y).toBe(10);
    const cash = s.organization.cashSatang;
    s = ok(s, { type: 'turnRoom', roomId: st.id, turns: -1 });
    const turned = room(s, 'nursing_station');
    expect(turned.rect).toEqual(st.rect);
    expect(turned.facing).toBe('e');
    expect(findDoor(turned, s.site)!.outside.x).toBe(13);
    expect(s.organization.cashSatang).toBe(cash);
    // setFacing picks a side directly; a side with no corridor falls back to the usual order.
    s = ok(s, { type: 'setFacing', roomId: st.id, facing: 'n' });
    expect(findDoor(room(s, 'nursing_station'), s.site)!.outside.y).toBe(10);
  });

  it('turning a long building in place needs room for its new footprint', () => {
    let s = quietEvents(buildHome(createInitialState(1)));
    const ward = room(s, 'ward');
    // Turned, the 4x5 ward would become 5x4 and reach x=6, where a flower bed now stands.
    s = ok(s, { type: 'placeDecor', decor: 'flowers', cell: { x: 6, y: 6 } });
    expect(applyCommand(s, { type: 'turnRoom', roomId: ward.id, turns: 1 }).result).toMatchObject({ ok: false, reason: 'overlap' });
    s = { ...s, site: { ...s.site, decor: [] } };
    const cash = s.organization.cashSatang;
    s = ok(s, { type: 'turnRoom', roomId: ward.id, turns: 1 });
    expect(room(s, 'ward').rect).toEqual({ x: 2, y: 5, w: 5, h: 4 });
    expect(s.organization.cashSatang).toBe(cash - moveFee(ward));
  });
});
