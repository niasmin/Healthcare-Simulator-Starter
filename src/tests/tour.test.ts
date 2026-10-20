import { rectCells } from '../domain/grid';
import { createInitialState } from '../sim/state';
import { buildObjectives, summarize } from '../sim/selectors';
import type { EquipmentId, GameState, RoomType } from '../domain/types';
import { SUGGEST, tourPointer, type TourCtx } from '../ui/tour';
import { admit, hire, ok } from './helpers';

/**
 * The tutorial's pointers (ring targets and suggested tiles) follow the Chapter 1 goals.
 * Playing only by the suggested tiles must produce a working starter home.
 */
const goalOf = (s: GameState) => buildObjectives(s).find((g) => !g.done) ?? null;

describe('tutorial pointers', () => {
  it('walks the build-up using only the suggested tiles, ending in a working home', () => {
    let s = createInitialState(7);
    const ui: Omit<TourCtx, 'game'> = { tool: { kind: 'select' }, selectedRoomId: null };
    const at = () => ({ goal: goalOf(s)!, p: tourPointer(goalOf(s), { game: s, ...ui }) });

    // Corridor: ring the tool, then suggest tiles once it is picked.
    expect(at().goal.id).toBe('corridor');
    expect(at().p.targets).toContain('tool-corridor');
    expect(at().p.hint).toBeNull();
    ui.tool = { kind: 'corridor' };
    expect(at().p.hint).toEqual(rectCells(SUGGEST.corridor));
    s = ok(s, { type: 'paintCorridor', rect: SUGGEST.corridor });

    const build = (goalId: string, type: RoomType, equip: Array<[EquipmentId, number]>) => {
      expect(at().goal.id).toBe(goalId);
      ui.tool = { kind: 'select' };
      expect(at().p.targets).toContain(`tool-room-${type}`);
      ui.tool = { kind: 'room', roomType: type };
      const hint = at().p.hint;
      expect(hint, `${type} hint`).toEqual(rectCells(SUGGEST[type]!));
      s = ok(s, { type: 'placeRoom', roomType: type, rect: SUGGEST[type]! });
      const id = s.site.rooms.find((r) => r.type === type)!.id;
      ui.tool = { kind: 'select' };
      ui.selectedRoomId = null;
      if (equip.length && goalOf(s)?.id !== 'beds') {
        // Not selected yet: the room itself is highlighted on the map.
        expect(at().p.hint).toEqual(rectCells(SUGGEST[type]!));
      }
      ui.selectedRoomId = id;
      if (equip.length) expect(at().p.targets).toContain(`equip-${equip[0][0]}`);
      for (const [e, n] of equip) for (let i = 0; i < n; i++) s = ok(s, { type: 'installEquipment', roomId: id, equipment: e });
      ui.selectedRoomId = null;
      return id;
    };

    // The ward goal is placing it; the beds goal is equipping it.
    expect(at().goal.id).toBe('ward');
    ui.tool = { kind: 'room', roomType: 'ward' };
    expect(at().p.hint).toEqual(rectCells(SUGGEST.ward!));
    s = ok(s, { type: 'placeRoom', roomType: 'ward', rect: SUGGEST.ward! });
    const ward = s.site.rooms.find((r) => r.type === 'ward')!.id;
    ui.tool = { kind: 'select' };
    expect(at().goal.id).toBe('beds');
    expect(at().p.hint).toEqual(rectCells(SUGGEST.ward!)); // tap the ward
    ui.selectedRoomId = ward;
    expect(at().p.targets).toEqual(expect.arrayContaining(['equip-care_bed', 'equip-call_system']));
    for (let i = 0; i < 10; i++) s = ok(s, { type: 'installEquipment', roomId: ward, equipment: 'care_bed' });
    s = ok(s, { type: 'installEquipment', roomId: ward, equipment: 'call_system' });
    ui.selectedRoomId = null;

    const station = build('station', 'nursing_station', [['nurse_desk', 1], ['med_cart', 1]]);
    const therapy = build('therapy', 'therapy', [['exercise_mat', 1], ['parallel_bars', 1]]);
    const staffRoom = build('staff_room', 'staff_room', [['lockers', 1]]);

    const sum = summarize(s);
    for (const id of [ward, station, therapy, staffRoom]) expect(sum.statuses.get(id)?.operational, id).toBe(true);
    expect(sum.bedsOperational).toBe(10);

    expect(at().goal.id).toBe('hire_rn');
    expect(at().p.targets[0]).toBe('hire-rn');
    let rn: string;
    [s, rn] = hire(s, 'rn');
    expect(at().goal.id).toBe('admit');
    expect(at().p.targets).toContain('admit');
    let res: string;
    [s, res] = admit(s);
    expect(at().goal.id).toBe('care_plan');
    expect(at().p.targets).toContain('create-plan');
    s = ok(s, { type: 'createCarePlan', residentId: res });
    expect(at().goal.id).toBe('roster');
    expect(at().p.targets.some((t) => t.startsWith('roster-add-'))).toBe(true);
    void rn;
  });

  it('suggests nothing on tiles that are already taken', () => {
    let s = createInitialState(7);
    s = ok(s, { type: 'paintCorridor', rect: SUGGEST.corridor });
    s = ok(s, { type: 'placeRoom', roomType: 'staff_room', rect: { x: 6, y: 13, w: 3, h: 2 } });
    const p = tourPointer(goalOf(s), { game: s, tool: { kind: 'room', roomType: 'ward' }, selectedRoomId: null });
    expect(goalOf(s)!.id).toBe('ward');
    expect(p.hint).toBeNull();
  });

  it('long goals carry no pointer', () => {
    expect(tourPointer({ id: 'chapter', key: 'goal.chapter', hint: 'tut.chapter1', done: false, action: { kind: 'view', view: 'finance' } }, { game: createInitialState(1), tool: { kind: 'select' }, selectedRoomId: null })).toEqual({ targets: [], hint: null });
  });
});
