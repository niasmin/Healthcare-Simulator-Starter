import { applyCommand, step } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { newGameState } from '../sim/modes';
import { reconcile } from '../domain/rules/ledger';
import { ALL_PERKS, PATHS, PATH_GROUPS, perkDef, withFeeBonus } from '../data/paths';
import { CHAPTERS } from '../data/chapters';
import { billAdmission } from '../sim/systems/billing';
import { refreshCandidates, staffMoraleDaily } from '../sim/systems/staffing';
import { YEAR_DAYS, YEAR_STARS, empireActive, empireDayEnd, yearTargets } from '../sim/systems/empire';
import { DICTS } from '../ui/i18n';
import type { GameState } from '../domain/types';
import { admit, buildHome, hire, ok, quietEvents } from './helpers';

const home = (): GameState => quietEvents(buildHome(createInitialState(8)));
const own = (s: GameState, ...ids: string[]): GameState => ({ ...s, perks: [...(s.perks ?? []), ...ids] });

describe('business paths', () => {
  it('has twelve paths in four groups, six open with four upgrades each', () => {
    expect(Object.keys(PATHS)).toHaveLength(12);
    expect(PATH_GROUPS.flatMap((g) => g.paths).sort()).toEqual(Object.keys(PATHS).sort());
    const open = Object.values(PATHS).filter((p) => p.open);
    expect(open).toHaveLength(6);
    for (const p of open) expect(p.perks.map((k) => k.tier)).toEqual([1, 2, 3, 4]);
    expect(new Set(ALL_PERKS.map((p) => p.id)).size).toBe(ALL_PERKS.length);
  });

  it('every path and upgrade has Thai and English text', () => {
    for (const d of [DICTS.th, DICTS.en]) {
      for (const id of Object.keys(PATHS)) expect(d[`path.${id}`] && d[`path.${id}.desc`]).toBeTruthy();
      for (const p of ALL_PERKS) expect(d[`perk.${p.id}`]).toBeTruthy();
    }
  });

  it('upgrades are bought in order, once, when the need is met and cash allows', () => {
    let s = home();
    expect(applyCommand(s, { type: 'buyPerk', perk: 'nursing_2' }).result).toMatchObject({ ok: false, reason: 'needs_previous' });
    expect(applyCommand(s, { type: 'buyPerk', perk: 'villa_1' }).result).toMatchObject({ ok: false, reason: 'needs_unmet' });
    expect(applyCommand(s, { type: 'buyPerk', perk: 'nope' }).result).toMatchObject({ ok: false, reason: 'not_found' });
    const cash = s.organization.cashSatang;
    s = ok(s, { type: 'buyPerk', perk: 'nursing_1' });
    expect(s.organization.cashSatang).toBe(cash - perkDef('nursing_1')!.costSatang);
    expect(s.perks).toEqual(['nursing_1']);
    expect(applyCommand(s, { type: 'buyPerk', perk: 'nursing_1' }).result).toMatchObject({ reason: 'already_owned' });
    // Tier 2 needs ten residents.
    expect(applyCommand(s, { type: 'buyPerk', perk: 'nursing_2' }).result).toMatchObject({ reason: 'needs_unmet' });
    expect(reconcile(s).ok).toBe(true);
    const poor = { ...home(), organization: { ...home().organization, cashSatang: 0 } };
    expect(applyCommand(poor, { type: 'buyPerk', perk: 'nursing_1' }).result).toMatchObject({ reason: 'insufficient_funds' });
  });

  it('fee upgrades raise what the matching invoice charges', () => {
    let s = home();
    [s] = admit(s);
    const r = s.residents[0];
    const total = (g: GameState) => {
      // Bill afresh (the admission invoice was already issued once).
      const inv = billAdmission({ ...g, invoices: [] }, r).invoices.at(-1)!;
      return inv.lines.reduce((a, l) => a + l.amountSatang, 0);
    };
    const base = total(s);
    const lifted = total(own(s, 'nursing_1'));
    expect(lifted).toBeGreaterThan(base);
    expect(withFeeBonus(own(s, 'nursing_1', 'nursing_3'), 'ward', 10_000)).toBe(11_500);
    expect(withFeeBonus(s, 'ward', 10_000)).toBe(10_000);
    // A villa bonus does not touch a ward resident.
    expect(total(own(s, 'villa_1'))).toBe(base);
  });

  it('daily upgrades lift morale and bring enquiries', () => {
    let s = home();
    [s] = hire(s, 'caregiver', ['morning']);
    s = { ...s, employees: s.employees.map((e) => ({ ...e, morale: 60 })) };
    expect(staffMoraleDaily(own(s, 'neuro_3')).employees[0].morale).toBeCloseTo(staffMoraleDaily(s).employees[0].morale + 0.5, 5);
    const w = { ...s, waitlist: [] };
    expect(refreshCandidates(own(w, 'villa_4')).waitlist.length).toBe(refreshCandidates(w).waitlist.length + 1);
  });

  it('reputation upgrades lift reputation at midnight', () => {
    let s = home();
    [s] = admit(s);
    const run = (g: GameState) => {
      while (g.minute % 1440 !== 0) g = step(g);
      return g.organization.reputation;
    };
    expect(run(own(s, 'nursing_4'))).toBeGreaterThan(run(s));
  });
});

describe('empire years', () => {
  it('run in free play, and in the campaign only after the last chapter is won', () => {
    const sb = newGameState('starter', 'sandbox');
    expect(empireActive(sb)).toBe(true);
    const c = home();
    expect(empireActive(c)).toBe(false);
    const done = { ...c, chapter: { ...c.chapter, id: CHAPTERS.length, result: { outcome: 'won' } } } as unknown as GameState;
    expect(empireActive(done)).toBe(true);
    expect(empireDayEnd(c, 1)).toBe(c);
  });

  it('start, are judged after YEAR_DAYS, pay stars when won and roll on', () => {
    let s: GameState = { ...home(), mode: 'sandbox' };
    s = empireDayEnd(s, 1);
    expect(s.empire).toMatchObject({ year: 1, startDay: 2, past: [] });
    // Nothing happens mid-year.
    expect(empireDayEnd(s, 30)).toBe(s);
    const last = 2 + YEAR_DAYS - 1;
    const missed = empireDayEnd(s, last);
    expect(missed.empire).toMatchObject({ year: 2, startDay: last + 1 });
    expect(missed.empire!.past).toEqual([{ year: 1, won: false, day: last, stars: 0 }]);
    // Meet every target: residents, reputation, cash, an upgrade, and a profit on the year.
    let w: GameState = { ...s, organization: { ...s.organization, reputation: 80, cashSatang: 5_000_000_00 }, perks: ['nursing_1'] };
    [w] = admit(w);
    w = { ...w, residents: Array.from({ length: 12 }, (_, i) => ({ ...w.residents[0], id: `r${i}` })) };
    w = { ...w, ledger: [...w.ledger, { ...w.ledger[0], id: 'x', at: (last - 1) * 1440 + 600, amountSatang: 100_00, category: 'revenue' as const }] };
    expect(yearTargets(w, 1, 2, last).every((t) => t.ok)).toBe(true);
    const stars = w.goals?.stars ?? 0;
    const won = empireDayEnd(w, last);
    expect(won.empire!.past[0]).toMatchObject({ year: 1, won: true, stars: YEAR_STARS + 1 });
    if (w.goals) expect(won.goals!.stars).toBe(stars + YEAR_STARS + 1);
  });

  it('later years ask for more', () => {
    const s = newGameState('starter', 'sandbox');
    const need = (y: number) => yearTargets(s, y, 1).map((t) => t.need);
    const [a, b] = [need(1), need(3)];
    for (let i = 0; i < a.length; i++) expect(b[i]).toBeGreaterThanOrEqual(a[i]);
    expect(b[0]).toBeGreaterThan(a[0]);
  });

  it('a sandbox game starts its first year at the first midnight, deterministically', () => {
    const play = () => {
      let g = newGameState('starter', 'sandbox');
      for (let i = 0; i < 1440; i++) g = step(g);
      return g;
    };
    const a = play();
    expect(a.empire?.year).toBe(1);
    expect(JSON.stringify(play())).toBe(JSON.stringify(a));
  });
});
