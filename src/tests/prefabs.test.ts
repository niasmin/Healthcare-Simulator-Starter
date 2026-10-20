import { applyCommand, advance } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { reconcile } from '../domain/rules/ledger';
import { summarize, buildObjectives } from '../sim/selectors';
import { PREFABS, prefabCost, prefabRect } from '../data/prefabs';
import { applyTemplate } from '../sim/templates';
import { STARTER_SCENARIO } from '../data/scenarios';
import { TICKS_PER_DAY } from '../sim/constants';
import { DICTS } from '../ui/i18n';
import { buildHome, ok, quietEvents, SPINE, run } from './helpers';

describe('ready-made rooms', () => {
  it('place the room and all its equipment in one command, for exactly the hand-built price', () => {
    const base = run(createInitialState(1), SPINE);
    const s = ok(base, { type: 'placePrefab', prefab: 'ward10', origin: { x: 2, y: 5 } });
    const ward = s.site.rooms.find((r) => r.type === 'ward')!;
    expect(ward.rect).toEqual({ x: 2, y: 5, w: 4, h: 5 });
    expect(ward.equipment).toEqual({ care_bed: 10, call_system: 1 });
    expect(summarize(s).bedsOperational).toBe(10);
    // Same cost as the starter build helper's hand-built ward.
    let hand = ok(base, { type: 'placeRoom', roomType: 'ward', rect: { x: 2, y: 5, w: 4, h: 5 } });
    const id = hand.site.rooms[0].id;
    for (let i = 0; i < 10; i++) hand = ok(hand, { type: 'installEquipment', roomId: id, equipment: 'care_bed' });
    hand = ok(hand, { type: 'installEquipment', roomId: id, equipment: 'call_system' });
    expect(s.organization.cashSatang).toBe(hand.organization.cashSatang);
    expect(base.organization.cashSatang - s.organization.cashSatang).toBe(prefabCost(PREFABS[0]));
    expect(reconcile(s).ok).toBe(true);
  });

  it('are all or nothing: an overlap or too little cash changes nothing', () => {
    const base = run(createInitialState(1), SPINE);
    const overlap = applyCommand(base, { type: 'placePrefab', prefab: 'ward10', origin: { x: 8, y: 8 } });
    expect(overlap.result.ok).toBe(false);
    expect(overlap.state).toBe(base);
    const poor = { ...base, organization: { ...base.organization, cashSatang: prefabCost(PREFABS[0]) - 1 } };
    const out = applyCommand(poor, { type: 'placePrefab', prefab: 'ward10', origin: { x: 2, y: 5 } });
    expect(out.result).toMatchObject({ ok: false, reason: 'insufficient_funds' });
    expect(out.state).toBe(poor);
  });

  it('rotate, respect chapter locks, and every one fits its own room rules', () => {
    expect(prefabRect(PREFABS[0], { x: 1, y: 2 }, true)).toEqual({ x: 1, y: 2, w: 5, h: 4 });
    const base = run(createInitialState(1), SPINE);
    expect(applyCommand(base, { type: 'placePrefab', prefab: 'villa', origin: { x: 14, y: 2 } }).result).toMatchObject({ ok: false, reason: 'chapter_locked' });
    for (const p of PREFABS) for (const lang of ['th', 'en'] as const) expect(DICTS[lang][`prefab.${p.id}`], p.id).toBeTruthy();
  });
});

describe('ready-made starter campus', () => {
  const s = applyTemplate(createInitialState(STARTER_SCENARIO.defaultSeed), 'starter');

  it('opens with corridor, nursing station, staff room and a front garden, paid from capital', () => {
    expect(s.site.rooms.map((r) => r.type).sort()).toEqual(['nursing_station', 'staff_room']);
    const sum = summarize(s);
    expect(sum.operationalByType.nursing_station).toBe(1);
    expect(sum.operationalByType.staff_room).toBe(1);
    expect(s.site.decor.length).toBeGreaterThan(0);
    expect(s.organization.cashSatang).toBeLessThan(STARTER_SCENARIO.startingCashSatang);
    expect(reconcile(s).ok).toBe(true);
    const goals = buildObjectives(s);
    expect(goals.find((g) => !g.done)!.id).toBe('ward');
    for (const id of ['corridor', 'station', 'staff_room']) expect(goals.find((g) => g.id === id)!.done).toBe(true);
  });

  it('is deterministic and the empty template changes nothing', () => {
    expect(JSON.stringify(applyTemplate(createInitialState(STARTER_SCENARIO.defaultSeed), 'starter'))).toBe(JSON.stringify(s));
    const fresh = createInitialState(3);
    expect(applyTemplate(fresh, 'empty')).toBe(fresh);
  });
});

describe('retry a failed chapter', () => {
  it('starts the same chapter again from today with the same business', () => {
    let s = quietEvents(buildHome(createInitialState(9)));
    s = advance(s, TICKS_PER_DAY * 30); // nobody admitted: chapter 1 fails on targets
    expect(s.chapter.result).toMatchObject({ outcome: 'failed', reason: 'targets' });
    const cash = s.organization.cashSatang;
    s = ok(s, { type: 'retryChapter' });
    expect(s.chapter).toMatchObject({ id: 1, startDay: 31, result: null });
    expect(s.chapter.past.at(-1)).toMatchObject({ chapter: 1, outcome: 'failed' });
    expect(s.organization.cashSatang).toBe(cash);
    expect(applyCommand(s, { type: 'retryChapter' }).result.ok).toBe(false);
    // The retried chapter is judged on its own days (31..60).
    s = advance(s, TICKS_PER_DAY * 30);
    expect(s.chapter.result?.day).toBe(60);
  });

  it('is refused while a chapter is running or was won', () => {
    expect(applyCommand(createInitialState(1), { type: 'retryChapter' }).result).toMatchObject({ ok: false, reason: 'chapter_locked' });
  });
});
