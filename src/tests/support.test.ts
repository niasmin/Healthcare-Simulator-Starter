import { applyCommand, step } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { reconcile } from '../domain/rules/ledger';
import { pctOf } from '../domain/money';
import { MEAL_TIMES, SELF_MEAL_NUTRITION } from '../data/patients';
import { dailyResidentCosts } from '../sim/systems/billing';
import { dailyUpkeep } from '../sim/systems/finance';
import { refreshCandidates } from '../sim/systems/staffing';
import { DINING_MEAL_HAPPINESS, DINING_MEAL_NUTRITION, LAUNDRY_UPKEEP_PERCENT, NUTRITIONIST_SATISFACTION_PER_DAY, PHARMACY_SUPPLIES_PERCENT, supportDayEnd } from '../sim/systems/support';
import { needsTick } from '../sim/systems/needs';
import type { GameState } from '../domain/types';
import { admit, buildHome, hire, ok, quietEvents } from './helpers';

const SPOT = { pharmacy: { x: 14, y: 11 }, laundry: { x: 16, y: 11 }, dining: { x: 10, y: 13 } };
const home = (): GameState => {
  const s = quietEvents(buildHome(createInitialState(8)));
  return { ...s, chapter: { id: 2, startDay: 1, result: null, past: [] } };
};
const withRoom = (s: GameState, prefab: 'pharmacy' | 'laundry' | 'dining') => ok(s, { type: 'placePrefab', prefab, origin: SPOT[prefab] });

describe('support rooms and staff', () => {
  it('support applicants only appear once their room exists (so the campaign is unchanged)', () => {
    const plain = refreshCandidates(home());
    expect(plain.applicants.some((a) => ['pharmacist', 'nutritionist', 'cleaner'].includes(a.role))).toBe(false);
    const s = refreshCandidates(withRoom(withRoom(withRoom(home(), 'pharmacy'), 'laundry'), 'dining'));
    for (const role of ['pharmacist', 'nutritionist', 'cleaner']) expect(s.applicants.some((a) => a.role === role)).toBe(true);
  });

  it('a pharmacy with a pharmacist on the roster cuts daily supplies', () => {
    let s = withRoom(home(), 'pharmacy');
    [s] = admit(s);
    const before = dailyResidentCosts(s).supplies;
    let unrostered: GameState;
    [unrostered] = hire(s, 'pharmacist');
    expect(dailyResidentCosts(unrostered).supplies).toBe(before);
    [s] = hire(s, 'pharmacist', ['morning']);
    expect(dailyResidentCosts(s).supplies).toBe(pctOf(before, PHARMACY_SUPPLIES_PERCENT));
  });

  it('a dining room makes each meal better for residents who eat on their own', () => {
    let s = home();
    [s] = admit(s, { group: 'active_aging', careLevel: 1, needs: { physical: 80, mobility: 80, mental: 80, happiness: 50, satisfaction: 70, nutrition: 40 } });
    const meal = { ...s, minute: Math.floor(s.minute / 1440) * 1440 + MEAL_TIMES[1] };
    const without = needsTick(meal).residents[0].needs;
    const withDining = needsTick(withRoom(meal, 'dining')).residents[0].needs;
    expect(withDining.nutrition - without.nutrition).toBeCloseTo(DINING_MEAL_NUTRITION, 1);
    expect(withDining.happiness - without.happiness).toBeCloseTo(DINING_MEAL_HAPPINESS, 1);
    expect(without.nutrition).toBeGreaterThan(40 + SELF_MEAL_NUTRITION - 1);
  });

  it('a nutritionist (with a dining room) and a cleaner (with a laundry) lift residents every day', () => {
    let s = withRoom(withRoom(home(), 'dining'), 'laundry');
    [s] = admit(s);
    const r0 = s.residents[0].needs;
    expect(supportDayEnd(s).residents[0].needs).toEqual(r0);
    [s] = hire(s, 'nutritionist', ['morning']);
    [s] = hire(s, 'cleaner', ['morning']);
    const r1 = supportDayEnd(s).residents[0].needs;
    expect(r1.satisfaction).toBeCloseTo(r0.satisfaction + NUTRITIONIST_SATISFACTION_PER_DAY, 2);
    expect(r1.happiness).toBeGreaterThan(r0.happiness);
  });

  it('a laundry room with a cleaner on the roster cuts building upkeep', () => {
    let s = withRoom(home(), 'laundry');
    const before = dailyUpkeep(s);
    [s] = hire(s, 'cleaner', ['morning']);
    expect(dailyUpkeep(s)).toBe(pctOf(before, LAUNDRY_UPKEEP_PERCENT));
    expect(reconcile(s).ok).toBe(true);
  });

  it('pharmacists do medication rounds and nutritionists help at meals, without holding caregivers back', () => {
    let s = home();
    for (let i = 0; i < 3; i++) [s] = admit(s, { group: 'bedridden', careLevel: 4 });
    [s] = hire(s, 'rn', ['morning']);
    for (const r of s.residents) s = ok(s, { type: 'createCarePlan', residentId: r.id });
    let ph: string, nu: string;
    [s, ph] = hire(s, 'pharmacist', ['morning']);
    [s, nu] = hire(s, 'nutritionist', ['morning']);
    // Three caregivers finish the 07:30 personal care by 08:00, when three meals fall due.
    const cgs: string[] = [];
    for (let i = 0; i < 3; i++) {
      let id: string;
      [s, id] = hire(s, 'caregiver', ['morning']);
      cgs.push(id);
    }
    const seen = { ph: false, nu: false, cg: false };
    for (let i = 0; i < 18; i++) {
      s = step(s);
      const kind = (id: string) => s.tasks.find((t) => t.id === s.employees.find((e) => e.id === id)?.taskId)?.kind;
      if (kind(ph) === 'med_round') seen.ph = true;
      if (kind(nu) === 'meal_assist') seen.nu = true;
      if (cgs.some((id) => kind(id) === 'meal_assist')) seen.cg = true;
    }
    expect(seen).toEqual({ ph: true, nu: true, cg: true });
    // Every meal was served.
    expect(s.tasks.filter((t) => t.kind === 'meal_assist' && t.status === 'missed')).toHaveLength(0);
  });

  it('support rooms are optional: nothing in a campaign chapter requires them', () => {
    expect(applyCommand(home(), { type: 'placePrefab', prefab: 'pharmacy', origin: SPOT.pharmacy }).result.ok).toBe(true);
  });
});
