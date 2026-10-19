import { rectCells } from '../domain/grid';
import { createInitialState } from '../sim/state';
import { summarize } from '../sim/selectors';
import type { GameState } from '../domain/types';
import { translate } from '../ui/i18n';
import { currentStep, STEPS, stepKey, stepTargets, SUGGEST, tutorialCtx, type TutorialCtx } from '../ui/tutorial';
import { admit, hire, ok } from './helpers';

/**
 * The guided tutorial is derived from game state. These tests play through it with
 * real engine commands, following the suggested layout, and check every step advances.
 */
type UI = { tool: TutorialCtx['tool']; selectedRoomId: string | null; ack: Set<string> };

function at(game: GameState, ui: UI) {
  const ctx = tutorialCtx(game, ui, summarize(game));
  const i = currentStep(ctx);
  return { ctx, i, id: i < 0 ? 'done' : STEPS[i].id, step: STEPS[i] };
}

describe('Chapter 1 tutorial', () => {
  it('walks from welcome to finish using the suggested layout', () => {
    let s = createInitialState(7);
    const ui: UI = { tool: { kind: 'select' }, selectedRoomId: null, ack: new Set() };
    const seen: string[] = [];
    const expectStep = (id: string) => {
      const cur = at(s, ui);
      expect(cur.id).toBe(id);
      if (seen.at(-1) !== id) seen.push(id);
      return cur;
    };

    expectStep('welcome');
    ui.ack.add('welcome');

    expectStep('corridor_tool');
    ui.tool = { kind: 'corridor' };
    const cd = expectStep('corridor_draw');
    expect(cd.step.hint!(cd.ctx)).toEqual(rectCells(SUGGEST.corridor));
    s = ok(s, { type: 'paintCorridor', rect: SUGGEST.corridor });

    expectStep('ward_tool');
    ui.tool = { kind: 'room', roomType: 'ward' };
    const wd = expectStep('ward_draw');
    expect(wd.step.hint!(wd.ctx)).toEqual(rectCells(SUGGEST.ward));
    s = ok(s, { type: 'placeRoom', roomType: 'ward', rect: SUGGEST.ward });
    const wardId = s.site.rooms.find((r) => r.type === 'ward')!.id;

    // Placing switches nothing by itself in the engine; the player then selects the room.
    ui.tool = { kind: 'select' };
    const sel = expectStep('ward_select');
    expect(sel.step.hint!(sel.ctx)).toEqual(rectCells(SUGGEST.ward));
    ui.selectedRoomId = wardId;

    const eq = expectStep('ward_equip');
    expect(stepTargets(eq.step, eq.ctx)).toContain('equip-care_bed');
    expect(stepKey(eq.step, eq.ctx)).toBe('tut.ward_equip');
    // Deselecting before the ward works sends the player back to select it.
    expect(at(s, { ...ui, selectedRoomId: null }).id).toBe('ward_select');
    for (let i = 0; i < 4; i++) s = ok(s, { type: 'installEquipment', roomId: wardId, equipment: 'care_bed' });
    s = ok(s, { type: 'installEquipment', roomId: wardId, equipment: 'call_system' });

    let st = expectStep('station');
    expect(stepKey(st.step, st.ctx)).toBe('tut.station.tool');
    ui.tool = { kind: 'room', roomType: 'nursing_station' };
    st = expectStep('station');
    expect(stepKey(st.step, st.ctx)).toBe('tut.station.draw');
    expect(st.step.hint!(st.ctx)).toEqual(rectCells(SUGGEST.station));
    s = ok(s, { type: 'placeRoom', roomType: 'nursing_station', rect: SUGGEST.station });
    const stationId = s.site.rooms.find((r) => r.type === 'nursing_station')!.id;
    ui.tool = { kind: 'select' };
    st = expectStep('station');
    expect(stepKey(st.step, st.ctx)).toBe('tut.station.select');
    ui.selectedRoomId = stationId;
    st = expectStep('station');
    expect(stepKey(st.step, st.ctx)).toBe('tut.station.equip');
    s = ok(s, { type: 'installEquipment', roomId: stationId, equipment: 'nurse_desk' });
    s = ok(s, { type: 'installEquipment', roomId: stationId, equipment: 'med_cart' });

    expectStep('hire_rn');
    let rn: string, cg: string;
    [s, rn] = hire(s, 'rn');
    expectStep('hire_cg');
    [s, cg] = hire(s, 'caregiver');

    expectStep('admit');
    let res: string;
    [s, res] = admit(s);
    expectStep('care_plan');
    s = ok(s, { type: 'createCarePlan', residentId: res });

    let ro = expectStep('roster');
    expect(stepTargets(ro.step, ro.ctx)).toContain('roster-add-rn-morning');
    s = ok(s, { type: 'assignShift', employeeId: rn, slot: 'morning' });
    ro = expectStep('roster');
    expect(stepTargets(ro.step, ro.ctx)).toContain('roster-add-caregiver-morning');
    s = ok(s, { type: 'assignShift', employeeId: cg, slot: 'morning' });

    expectStep('play');
    s = ok(s, { type: 'setSpeed', speed: 1 });
    expectStep('finish');
    ui.ack.add('finish');
    expect(at(s, ui).i).toBe(-1);

    // Every step was visited, in order.
    expect(seen).toEqual(STEPS.map((x) => x.id));
    // The suggested layout yields a working home.
    const sum = summarize(s);
    expect(sum.statuses.get(wardId)?.operational).toBe(true);
    expect(sum.statuses.get(stationId)?.operational).toBe(true);
  });

  it('goes back a step when the player undoes progress (state-derived)', () => {
    let s = createInitialState(7);
    const ui: UI = { tool: { kind: 'select' }, selectedRoomId: null, ack: new Set(['welcome']) };
    s = ok(s, { type: 'paintCorridor', rect: SUGGEST.corridor });
    expect(at(s, ui).id).toBe('ward_tool');
    s = ok(s, { type: 'bulldoze', cell: { x: 9, y: 13 } });
    s = ok(s, { type: 'bulldoze', cell: { x: 9, y: 14 } });
    expect(['corridor_tool', 'corridor_draw']).toContain(at(s, ui).id);
  });

  it('only suggests tiles that are still buildable', () => {
    let s = createInitialState(7);
    // Block the suggested ward spot with a different room.
    s = ok(s, { type: 'paintCorridor', rect: SUGGEST.corridor });
    s = ok(s, { type: 'placeRoom', roomType: 'staff_room', rect: { x: 6, y: 13, w: 3, h: 3 } });
    const cur = at(s, { tool: { kind: 'room', roomType: 'ward' }, selectedRoomId: null, ack: new Set(['welcome']) });
    expect(cur.id).toBe('ward_draw');
    expect(cur.step.hint!(cur.ctx)).toBeNull();
  });

  it('has Thai and English text for every step and variant', () => {
    const keys = new Set<string>();
    for (const st of STEPS) keys.add(`tut.${st.id}`);
    for (const v of ['tool', 'draw', 'select', 'equip']) keys.add(`tut.station.${v}`);
    keys.delete('tut.station');
    for (const k of keys)
      for (const lang of ['th', 'en'] as const)
        for (const part of ['title', 'body']) {
          const step = STEPS.find((x) => k === `tut.${x.id}` || k.startsWith(`tut.${x.id}.`));
          const out = translate(lang, `${k}.${part}`, step?.params);
          expect(out, `${lang} ${k}.${part}`).not.toBe(`${k}.${part}`);
          expect(out).not.toMatch(/\{room\}/);
        }
  });
});
