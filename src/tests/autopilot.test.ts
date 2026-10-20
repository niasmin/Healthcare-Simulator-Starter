import { applyCommand, step } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { reconcile } from '../domain/rules/ledger';
import { fireEvent } from '../sim/systems/events';
import { AUTO_CHOICES, autoSettings } from '../sim/autopilot';
import { MINUTES_PER_DAY } from '../sim/constants';
import type { GameState } from '../domain/types';
import { buildHome, hire, ok, quietEvents } from './helpers';

const ALL_ON = { events: true, admit: true, carePlan: true, staff: true };
const days = (s: GameState, n: number) => {
  for (let i = 0; i < n * (MINUTES_PER_DAY / 10); i++) s = step(s);
  return s;
};

describe('autopilot', () => {
  it('is off by default and is switched with a command', () => {
    const s = createInitialState(8);
    expect(autoSettings(s)).toEqual({ events: false, admit: false, carePlan: false, staff: false });
    const on = ok(s, { type: 'setAuto', settings: { admit: true } });
    expect(autoSettings(on)).toMatchObject({ admit: true, events: false });
  });

  it('runs a built home on its own for 30 days: admits, plans, hires and rosters, solvent and ledger intact', () => {
    let s = ok(quietEvents(buildHome(createInitialState(8))), { type: 'setAuto', settings: ALL_ON });
    s = days(s, 30);
    expect(s.residents.length).toBeGreaterThanOrEqual(8);
    expect(s.residents.every((r) => r.carePlan)).toBe(true);
    expect(s.employees.some((e) => e.role === 'rn')).toBe(true);
    expect(s.organization.cashSatang).toBeGreaterThan(0);
    const last = s.history.slice(-7);
    const done = last.reduce((a, d) => a + d.done, 0);
    const missed = last.reduce((a, d) => a + d.missed, 0);
    expect(done / (done + missed)).toBeGreaterThan(0.9);
    expect(reconcile(s).ok).toBe(true);
    // Unique beds and no overlapping shifts still hold.
    expect(new Set(s.residents.map((r) => r.bedId)).size).toBe(s.residents.length);
  });

  it('answers events at once without pausing, accepting a staff request', () => {
    let s = buildHome(createInitialState(8));
    [s] = hire(s, 'rn', ['morning']);
    [s] = hire(s, 'pn', ['afternoon']);
    s = ok({ ...s, speed: 2 }, { type: 'setAuto', settings: { events: true } });
    s = fireEvent(s, 'staff_resign');
    expect(s.speed).toBe(0);
    const wages = s.employees.map((e) => e.wageMonthlySatang);
    s = step(s);
    expect(s.events.active).toBeNull();
    expect(s.speed).toBe(2);
    expect(s.events.history[s.events.history.length - 1].choiceId).toBe(AUTO_CHOICES.staff_resign[0]);
    expect(s.employees.map((e) => e.wageMonthlySatang).some((w, i) => w > wages[i])).toBe(true);
  });

  it('with autopilot off nothing happens by itself', () => {
    let s = quietEvents(buildHome(createInitialState(8)));
    s = days(s, 2);
    expect(s.residents).toHaveLength(0);
    expect(s.employees).toHaveLength(0);
    expect(applyCommand(s, { type: 'setAuto', settings: {} }).result.ok).toBe(true);
  });
});
