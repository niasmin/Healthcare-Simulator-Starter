import { applyCommand, step } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { reconcile } from '../domain/rules/ledger';
import { parseBedId } from '../domain/rules/beds';
import { roleNeeds, rosterView, slotDemand, buildObjectives } from '../sim/selectors';
import { STARTER_SCENARIO } from '../data/scenarios';
import { CHAPTERS, PROGRAMMES } from '../data/chapters';
import { monthlyFee } from '../data/finance';
import { validate } from '../storage/format';
import { DICTS } from '../ui/i18n';
import type { GameState } from '../domain/types';
import { botTurn, playthrough } from './bot';
import { admit, buildHome, hire, ok, quietEvents } from './helpers';

const ward = (s: GameState) => s.site.rooms.find((r) => r.type === 'ward')!;

describe('chapter 2: Professional Nursing Center (campaign playthrough)', () => {
  const run = playthrough(createInitialState(STARTER_SCENARIO.defaultSeed), 91, { campaign: true });
  const s = run.state;

  it('wins chapter 1, starts chapter 2 the next day and wins it on day 90', () => {
    // The day-91 turn already starts chapter 3, so chapter 2's verdict is the latest one in `past`.
    expect(s.chapter.past[0]).toMatchObject({ chapter: 1, outcome: 'won', day: 30 });
    const ch2 = s.chapter.past[1];
    expect(ch2).toMatchObject({ chapter: 2, outcome: 'won', reason: 'complete', day: 90 });
    expect(s.chapter).toMatchObject({ id: 3, startDay: 91 });
    expect(ch2.checks.map((c) => c.id)).toEqual(['solvent', 'beds', 'residents', 'rn', 'programmes', 'cashflow', 'quality']);
    expect(run.minCash).toBeGreaterThan(0);
    expect(buildObjectives({ ...s, chapter: { id: 2, startDay: 31, result: ch2, past: [] } }).every((g) => g.done)).toBe(true);
  });

  it('keeps the programme rules: secured beds for dementia, airway care only by RNs, an RN at night', () => {
    expect(reconcile(s).ok).toBe(true);
    for (const r of s.residents.filter((x) => x.group === 'dementia')) {
      const room = s.site.rooms.find((x) => x.id === parseBedId(r.bedId).roomId)!;
      expect(room.equipment.door_sensor).toBe(1);
    }
    for (const r of s.residents.filter((x) => x.group === 'airway' || x.group === 'tube_feeding')) {
      const room = s.site.rooms.find((x) => x.id === parseBedId(r.bedId).roomId)!;
      expect(room.equipment.feeding_pump).toBe(1);
      if (r.group === 'airway') expect(room.equipment.suction_unit).toBe(1);
    }
    for (const t of s.tasks.filter((x) => x.kind === 'airway_care' && x.assigneeId)) expect(s.employees.find((e) => e.id === t.assigneeId)?.role ?? 'rn').toBe('rn');
    for (const t of s.tasks.filter((x) => x.kind === 'tube_feed' && x.assigneeId)) expect(['rn', 'pn']).toContain(s.employees.find((e) => e.id === t.assigneeId)?.role ?? 'rn');
    if (s.residents.some((r) => r.group === 'airway')) {
      const night = rosterView(s).cells.find((c) => c.slot === 'night' && c.role === 'rn')!;
      expect(night.need).toBeGreaterThanOrEqual(1);
      expect(night.staff.length).toBeGreaterThanOrEqual(1);
    }
    const days = s.history.filter((h) => h.day > 31 && h.day <= 90);
    const done = days.reduce((a, d) => a + d.done, 0);
    const missed = days.reduce((a, d) => a + d.missed, 0);
    expect(done / (done + missed)).toBeGreaterThan(0.93);
  });

  it('is deterministic over the whole 90-day campaign', () => {
    expect(JSON.stringify(playthrough(createInitialState(STARTER_SCENARIO.defaultSeed), 91, { campaign: true }).state)).toBe(JSON.stringify(s));
  });

  it('building every ward the moment it is affordable skates on the edge of bankruptcy', () => {
    const runs = [STARTER_SCENARIO.defaultSeed, 1, 3].map((seed) => playthrough(createInitialState(seed), 91, { campaign: true, eager: true }));
    for (const r of runs) expect(r.minCash).toBeLessThan(run.minCash / 4);
    expect(runs.some((r) => r.state.chapter.result?.reason === 'bankrupt')).toBe(true);
  }, 30_000);

  it('a second full team hired at expansion time fails the chapter', () => {
    let g = playthrough(createInitialState(STARTER_SCENARIO.defaultSeed), 30).state;
    g = step(step(g)); // past the verdict midnight
    g = botTurn(g, { campaign: true });
    for (const role of ['rn', 'rn', 'pn', 'pn', 'caregiver', 'caregiver', 'caregiver', 'pt', 'ot'] as const) [g] = hire(g, role);
    while (g.minute < 90 * 1440 + 10 && !g.chapter.result) {
      g = step(g);
      if (g.minute % 1440 === 420) g = botTurn(g, { campaign: true });
    }
    expect(g.chapter.result).toMatchObject({ chapter: 2, outcome: 'failed' });
  });
});

describe('chapter rules', () => {
  it('the next chapter starts only after a win, with one candidate per new programme', () => {
    const fresh = createInitialState(3);
    expect(applyCommand(fresh, { type: 'startChapter' }).result).toMatchObject({ ok: false, reason: 'chapter_locked' });
    const won = { ...fresh, minute: 31 * 1440 - 1440, chapter: { ...fresh.chapter, result: { chapter: 1, outcome: 'won' as const, day: 30, reason: 'complete' as const, checks: [] } } };
    const next = ok(won, { type: 'startChapter' });
    expect(next.chapter).toMatchObject({ id: 2, startDay: 31, result: null });
    expect(next.chapter.past).toHaveLength(1);
    for (const g of PROGRAMMES) expect(next.waitlist.some((c) => c.group === g)).toBe(true);
    expect(applyCommand(next, { type: 'startChapter' }).result.ok).toBe(false);
    expect(CHAPTERS).toHaveLength(6);
  });

  it('dementia needs a secured ward; others fill ordinary wards first', () => {
    let s = quietEvents(buildHome(createInitialState(4)));
    const out = applyCommand({ ...s, waitlist: [{ id: 'c1', name: { th: 'ก', en: 'A' }, age: 80, group: 'dementia', careLevel: 2, needs: { physical: 70, mobility: 60, mental: 50, happiness: 60, satisfaction: 70, nutrition: 70 } }] }, { type: 'admitResident', candidateId: 'c1' });
    expect(out.result).toMatchObject({ ok: false, reason: 'needs_ward_equipment', params: { equipment: 'door_sensor' } });
    s = ok(s, { type: 'installEquipment', roomId: ward(s).id, equipment: 'door_sensor' });
    let id: string;
    [s, id] = admit(s, { group: 'dementia', careLevel: 2 });
    expect(parseBedId(s.residents.find((r) => r.id === id)!.bedId).roomId).toBe(ward(s).id);
  });

  it('airway care is RN-only and puts an RN on the night roster', () => {
    let s = quietEvents(buildHome(createInitialState(5)));
    for (const k of ['feeding_pump', 'suction_unit'] as const) s = ok(s, { type: 'installEquipment', roomId: ward(s).id, equipment: k });
    [s] = hire(s, 'rn', ['morning']);
    [s] = hire(s, 'pn', ['night']);
    let id: string;
    [s, id] = admit(s, { group: 'airway', careLevel: 4 });
    s = ok(s, { type: 'createCarePlan', residentId: id });
    const night = slotDemand(s).night;
    expect(roleNeeds(night, 480, false).rn).toBe(1);
    expect(rosterView(s).slots.find((x) => x.slot === 'night')!.missingSkills).toContain('airway_care');
    // 03:00 airway care with only a PN on nights is missed.
    while (s.minute < 2 * 1440 + 5 * 60) s = step(s);
    expect(s.tasks.some((t) => t.kind === 'airway_care' && t.dueAt === 1440 + 180 && t.status === 'missed')).toBe(true);
  });

  it('programme fees are added to the monthly fee', () => {
    expect(monthlyFee(4, 'standard', 'airway')).toBe(monthlyFee(4, 'standard') + 1_200_000);
    expect(monthlyFee(2, 'premium', 'dementia')).toBe(Math.floor(((3_300_000 + 400_000) * 1.2) / 100) * 100);
  });

  it('schema-5 saves migrate: chapter 1 keeps its verdict and staff learn the new skills', () => {
    let s = quietEvents(buildHome(createInitialState(6)));
    [s] = hire(s, 'rn');
    const v5 = {
      ...s,
      schemaVersion: 5,
      chapter: { result: { outcome: 'won', day: 30, reason: 'complete', checks: [] } },
      employees: s.employees.map((e) => ({ ...e, skills: e.skills.filter((k) => k !== 'airway_care' && k !== 'tube_feeding') })),
    } as unknown as GameState;
    const res = validate(v5);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.chapter).toEqual({ id: 1, startDay: 1, past: [], result: { chapter: 1, outcome: 'won', day: 30, reason: 'complete', checks: [] } });
    expect(res.state.employees[0].skills).toEqual(expect.arrayContaining(['airway_care', 'tube_feeding']));
  });

  it('every chapter 2 step has text in Thai and English', () => {
    const s = { ...createInitialState(1), chapter: { id: 2, startDay: 31, result: null, past: [] } };
    for (const g of buildObjectives(s))
      for (const lang of ['th', 'en'] as const) {
        expect(DICTS[lang][g.key], g.key).toBeTruthy();
        expect(DICTS[lang][g.hint], g.hint).toBeTruthy();
      }
  });
});
