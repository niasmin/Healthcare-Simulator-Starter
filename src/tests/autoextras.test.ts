import { applyCommand } from '../sim/engine';
import { buildSomewhere } from '../sim/autoBuild';
import { campaignTurn, dailyCare, OUTING_HAPPINESS, OUTING_MORALE } from '../sim/autoCampaign';
import { newGameState } from '../sim/modes';
import { summarize } from '../sim/selectors';
import { refreshCandidates } from '../sim/systems/staffing';
import { createInitialState } from '../sim/state';
import type { GameState } from '../domain/types';
import { admit, buildHome, hire, quietEvents } from './helpers';

const BUILD_ONLY = { chapters: false, build: true, estate: false, homecare: false, training: false, placements: false, branches: false, shop: false };
const at = (s: GameState, hour: number): GameState => ({ ...s, minute: Math.floor(s.minute / 1440) * 1440 + hour * 60 });

describe('autopilot and the new rooms and town', () => {
  it('builds an accounting office at 30 beds, then hires an accountant onto the morning shift', () => {
    let s = newGameState('starter', 'sandbox');
    for (let i = 0; i < 3; i++) s = buildSomewhere(s, applyCommand, 'ward10')!.state;
    expect(summarize(s).bedsOperational).toBeGreaterThanOrEqual(30);
    s = campaignTurn(s, applyCommand, BUILD_ONLY);
    expect(s.site.rooms.some((r) => r.type === 'accounting_office')).toBe(true);
    s = campaignTurn(refreshCandidates(s), applyCommand, BUILD_ONLY);
    const acct = s.employees.find((e) => e.role === 'accountant');
    expect(acct).toBeTruthy();
    expect(s.shifts.some((x) => x.employeeId === acct!.id && x.slot === 'morning')).toBe(true);
  });

  it('a small home gets no accounting office', () => {
    const s = quietEvents(buildHome(createInitialState(8)));
    const out = campaignTurn({ ...s, chapter: { id: 2, startDay: 1, result: null, past: [] } }, applyCommand, BUILD_ONLY);
    expect(out.site.rooms.some((r) => r.type === 'accounting_office')).toBe(false);
  });

  it('staff care takes low-morale staff for coffee and unhappy residents for cake and the park, at 10:00', () => {
    let s = quietEvents(buildHome(createInitialState(8)));
    [s] = hire(s, 'caregiver');
    [s] = admit(s, { needs: { physical: 80, mobility: 80, mental: 80, happiness: OUTING_HAPPINESS - 10, satisfaction: 60, nutrition: 80 } });
    s = { ...s, employees: s.employees.map((e) => ({ ...e, morale: OUTING_MORALE - 10 })) };
    expect(dailyCare(at(s, 9), applyCommand, { staffCare: true })).toEqual(at(s, 9));
    const out = dailyCare(at(s, 10), applyCommand, { staffCare: true });
    expect(Object.keys(out.city?.used ?? {}).sort()).toEqual(['cake', 'coffee', 'park']);
    // Content people stay home.
    const happy = { ...s, residents: s.residents.map((r) => ({ ...r, needs: { ...r.needs, happiness: 95 } })), employees: s.employees.map((e) => ({ ...e, morale: 90 })) };
    expect(dailyCare(at(happy, 10), applyCommand, { staffCare: true }).city).toBeUndefined();
  });
});
