import { advance, step } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { reconcile } from '../domain/rules/ledger';
import { windowsOverlap } from '../domain/rules/shifts';
import { judgeChapter } from '../sim/systems/chapter';
import { buildObjectives, roleNeeds, rosterView, slotDemand } from '../sim/selectors';
import { SCRIPTED_EVENTS } from '../data/events';
import { STARTER_SCENARIO } from '../data/scenarios';
import { TICKS_PER_DAY } from '../sim/constants';
import { post } from '../sim/helpers';
import { encodeSave, decodeSave } from '../storage/format';
import { DICTS } from '../ui/i18n';
import type { GameState } from '../domain/types';
import { botTurn, playthrough } from './bot';
import { admit, buildHome, hire, ok, quietEvents } from './helpers';

/** Every invariant from CLAUDE.md, checked on a live state. */
function expectInvariants(s: GameState) {
  expect(reconcile(s).ok).toBe(true);
  const beds = s.residents.map((r) => r.bedId);
  expect(new Set(beds).size).toBe(beds.length); // unique bed assignment
  for (const e of s.employees) {
    const mine = s.shifts.filter((x) => x.employeeId === e.id);
    for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) expect(windowsOverlap(mine[i], mine[j])).toBe(false);
  }
  for (const t of s.tasks) {
    if (!t.assigneeId) continue;
    const e = s.employees.find((x) => x.id === t.assigneeId);
    if (e) expect(e.skills).toContain(t.skill); // no care without the required qualification
  }
}

describe('30-day chapter playthrough (scripted sensible player, real applicant and waiting-list pools)', () => {
  const run = playthrough(createInitialState(STARTER_SCENARIO.defaultSeed), 31);

  it('wins chapter 1: solvent every day, 10 beds, full home, operating profit, good care', () => {
    const r = run.state.chapter.result!;
    expect(r).toMatchObject({ outcome: 'won', reason: 'complete', day: 30 });
    expect(r.checks.every((c) => c.ok)).toBe(true);
    expect(run.cashByDay.slice(0, 30).every((c) => c > 0)).toBe(true);
    expect(run.minCash).toBeGreaterThan(0);
    expect(buildObjectives(run.state).every((g) => g.done)).toBe(true);
  });

  it('keeps every invariant, follows the roster advice and completes 95%+ of care tasks', () => {
    expectInvariants(run.state);
    expect(rosterView(run.state).slots.every((x) => x.ready)).toBe(true);
    const days = run.state.history.slice(1, 30);
    const done = days.reduce((a, d) => a + d.done, 0);
    const missed = days.reduce((a, d) => a + d.missed, 0);
    expect(done / (done + missed)).toBeGreaterThan(0.95);
  });

  it('runs the three scripted chapter events on their days', () => {
    for (const x of SCRIPTED_EVENTS) {
      const fired = run.state.events.history.find((h) => h.defId === x.defId && h.day >= x.day);
      expect(fired, x.defId).toBeTruthy();
      expect(fired!.day - x.day).toBeLessThanOrEqual(5);
    }
    expect(run.state.events.history.find((h) => h.defId === 'family_visit')!.day).toBe(3);
  });

  it('is deterministic: the same seed plays the same 30 days', () => {
    const again = playthrough(createInitialState(STARTER_SCENARIO.defaultSeed), 31);
    expect(JSON.stringify(again.state)).toBe(JSON.stringify(run.state));
  });

  it('pauses on the verdict and survives a save round-trip', async () => {
    expect(run.state.speed).toBe(0);
    const loaded = await decodeSave(await encodeSave(run.state, 'slot1'));
    expect(loaded.ok && loaded.state.chapter.result).toEqual(run.state.chapter.result);
  });
});

describe('chapter balance', () => {
  it('a full home that follows the advice wins on other seeds too', () => {
    for (const seed of [1, 2, 3]) expect(playthrough(createInitialState(seed), 31).state.chapter.result?.outcome, `seed ${seed}`).toBe('won');
  });

  it('a home left 40% empty loses money and fails on targets', () => {
    const r = playthrough(createInitialState(STARTER_SCENARIO.defaultSeed), 31, { maxResidents: 6 }).state.chapter.result!;
    expect(r).toMatchObject({ outcome: 'failed', reason: 'targets' });
    expect(r.checks.find((c) => c.id === 'cashflow')!.ok).toBe(false);
    expect(r.checks.find((c) => c.id === 'residents')!.ok).toBe(false);
  });

  it('overstaffing (a second full team) turns the month into a loss', () => {
    let s = buildHome(quietEvents(createInitialState(3)));
    s = botTurn(s);
    for (const role of ['rn', 'pn', 'caregiver', 'caregiver', 'pt', 'ot'] as const) [s] = hire(s, role, ['afternoon']);
    s = advance(s, 1);
    const end = 30 * 1440 + 10;
    while (s.minute < end) {
      s = step(s);
      if (s.minute % 1440 === 420) s = botTurn(s);
    }
    expect(s.chapter.result).toMatchObject({ outcome: 'failed', reason: 'targets' });
  });
});

describe('chapter verdict rules', () => {
  it('goes bankrupt at the first midnight that closes below zero, once, and never changes', () => {
    let s = buildHome(quietEvents(createInitialState(9)));
    [s] = hire(s, 'rn', ['morning']);
    s = post(s, -(s.organization.cashSatang - 100), 'construction', 'test.spend'); // ฿1 left
    s = advance(s, TICKS_PER_DAY);
    expect(s.chapter.result).toMatchObject({ outcome: 'failed', reason: 'bankrupt', day: 1 });
    expect(s.speed).toBe(0);
    const verdict = s.chapter.result;
    s = advance(s, TICKS_PER_DAY * 3);
    expect(s.chapter.result).toBe(verdict);
    expect(s.log.filter((l) => l.key === 'chapter.log.bankrupt')).toHaveLength(1);
  });

  it('is not decided before day 30 closes, and judging again is a no-op', () => {
    let s = buildHome(quietEvents(createInitialState(9)));
    [s] = admit(s);
    s = advance(s, TICKS_PER_DAY * 29);
    expect(s.chapter.result).toBeNull();
    expect(judgeChapter(s, 29)).toBe(s);
    s = advance(s, TICKS_PER_DAY);
    expect(s.chapter.result?.day).toBe(30);
    expect(judgeChapter(s, 31)).toBe(s);
  });

  it('an older save already past day 30 is judged at its next midnight', () => {
    let s = buildHome(quietEvents(createInitialState(9)));
    s = advance(s, TICKS_PER_DAY * 31);
    const legacy = { ...s, chapter: { result: null } };
    expect(advance(legacy, TICKS_PER_DAY).chapter.result?.day).toBe(32);
  });
});

describe('tutorial', () => {
  it('starts at the corridor and walks the chapter in order', () => {
    const fresh = createInitialState(1);
    const goals = buildObjectives(fresh);
    expect(goals.find((g) => !g.done)!.id).toBe('corridor');
    expect(goals.map((g) => g.id)).toEqual(['corridor', 'ward', 'beds', 'station', 'therapy', 'staff_room', 'hire_rn', 'admit', 'care_plan', 'roster', 'run', 'fill', 'first_revenue', 'chapter']);
    const built = buildHome(fresh);
    expect(buildObjectives(built).find((g) => !g.done)!.id).toBe('hire_rn');
    // Steps are derived from state: starting the clock early completes "run" whenever it happens.
    expect(buildObjectives(step(built)).find((g) => g.id === 'run')!.done).toBe(true);
  });

  it('every step has a goal and a how-to hint in Thai and English', () => {
    for (const g of buildObjectives(createInitialState(1)))
      for (const lang of ['th', 'en'] as const) {
        expect(DICTS[lang][g.key], `${lang} ${g.key}`).toBeTruthy();
        expect(DICTS[lang][`tut.${g.id}`], `${lang} tut.${g.id}`).toBeTruthy();
      }
  });
});

describe('staffing advice', () => {
  it('counts rush hours and lets the RN cover PN work', () => {
    let s = buildHome(quietEvents(createInitialState(2)));
    [s] = hire(s, 'rn', ['morning', 'afternoon']);
    for (let i = 0; i < 10; i++) {
      let id: string;
      [s, id] = admit(s, { group: 'active_aging', careLevel: 1 });
      s = ok(s, { type: 'createCarePlan', residentId: id });
    }
    const d = slotDemand(s);
    // Afternoon: 10 medication rounds at 21:00 fit in the RN's 90-minute window → no PN needed.
    expect(roleNeeds(d.afternoon, 480, true)).toMatchObject({ rn: 1, pn: 0 });
    // Morning: 10 vital-sign checks at 08:00 plus 10 rounds at 09:00 are too much for one RN.
    expect(roleNeeds(d.morning, 480, true).pn).toBe(1);
    // Ten 20-minute activity sessions fit one OT between 10:00 and 14:00.
    expect(roleNeeds(d.morning, 480, true).ot).toBe(1);
  });
});
