import { applyCommand, step } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { ACHIEVEMENTS, ALL_MISSIONS_BONUS, MISSIONS, MISSION_ORDER, MISSIONS_PER_DAY } from '../data/goals';
import { achievementMet, goalsDayEnd, goalsOf, goalsTick, missionMet, missionsFor, missionsToday } from '../sim/systems/goals';
import { centerScore, playerStats } from '../sim/rivals';
import { dayOf } from '../sim/systems/time';
import { DICTS } from '../ui/i18n';
import type { GameState, MissionId } from '../domain/types';
import { admit, buildHome, hire, ok, quietEvents } from './helpers';

const home = (): GameState => quietEvents(buildHome(createInitialState(8)));
/** A state whose day has exactly these missions (searching days for a seed that gives them). */
function dayWith(s: GameState, want: MissionId): GameState {
  for (let d = dayOf(s.minute); d < dayOf(s.minute) + 200; d++) if (missionsFor(s, d).includes(want)) return { ...s, minute: (d - 1) * 1440 + 8 * 60 };
  throw new Error(`no day with ${want}`);
}

describe('daily missions', () => {
  it('three different missions a day, the same for the same seed and day, varying across days', () => {
    const s = home();
    const days = Array.from({ length: 20 }, (_, i) => missionsFor(s, i + 1));
    for (const d of days) {
      expect(d).toHaveLength(MISSIONS_PER_DAY);
      expect(new Set(d).size).toBe(MISSIONS_PER_DAY);
    }
    expect(missionsFor(s, 5)).toEqual(days[4]);
    expect(new Set(days.map((d) => d.join())).size).toBeGreaterThan(5);
    expect(s.rngState).toBe(home().rngState);
  });

  it('a mission done during the day earns its stars once, on the next hourly check', () => {
    let s = dayWith(home(), 'hire_one');
    [s] = hire(s, 'caregiver');
    expect(missionMet(s, 'hire_one', dayOf(s.minute))).toBe(true);
    const a = goalsTick(s);
    expect(goalsOf(a).done).toContain('hire_one');
    expect(goalsOf(a).stars).toBeGreaterThanOrEqual(MISSIONS.hire_one.reward);
    const b = goalsTick(a);
    expect(goalsOf(b).total).toBe(goalsOf(a).total);
    expect(goalsOf(b).stars).toBe(goalsOf(a).stars);
    expect(missionsToday(b).find((m) => m.id === 'hire_one')?.done).toBe(true);
  });

  it('end-of-day missions are judged when the day closes; all three earn a bonus and a streak', () => {
    let s = home();
    [s] = admit(s);
    const day = dayOf(s.minute);
    const ids = missionsFor(s, day);
    // Pretend every mission of the day was done during the day.
    s = { ...s, goals: { day, done: [...ids], total: 3, streak: 2, stars: 10, achievements: {} } };
    const g = goalsOf(goalsDayEnd(s, day));
    expect(g).toMatchObject({ day: day + 1, done: [], streak: 3, stars: 10 + ALL_MISSIONS_BONUS });
    const missed = goalsOf(goalsDayEnd({ ...s, goals: { ...s.goals!, done: [] }, today: { done: 0, missed: 5 } }, day));
    expect(missed.streak).toBe(0);
  });

  it('missions and the ranking reward stars, never cash', () => {
    let s = dayWith(home(), 'admit_one');
    const cash = s.organization.cashSatang;
    const ledger = s.ledger.length;
    s = goalsTick(s);
    [s] = admit(s);
    const after = goalsTick(s);
    expect(after.organization.cashSatang).toBe(s.organization.cashSatang);
    expect(after.ledger).toHaveLength(s.ledger.length);
    expect(goalsOf(after).stars).toBeGreaterThan(0);
    expect(playerStats(after).score).toBe(centerScore(playerStats(after)));
    expect(playerStats(after).stars).toBe(goalsOf(after).stars);
    expect(cash).toBeGreaterThan(0);
    expect(ledger).toBeGreaterThan(0);
  });

  it('every mission and achievement has a label in both languages', () => {
    for (const lang of ['th', 'en'] as const) {
      for (const id of MISSION_ORDER) expect(DICTS[lang][`mission.${id}`]).toBeTruthy();
      for (const a of ACHIEVEMENTS) {
        expect(DICTS[lang][`ach.${a.id}`]).toBeTruthy();
        expect(DICTS[lang][`ach.${a.id}.desc`]).toBeTruthy();
      }
    }
  });

  it('stars stay within the server cap of the online ranking (7 a day + 150)', () => {
    const top = [...MISSION_ORDER].map((id) => MISSIONS[id].reward).sort((a, b) => b - a);
    expect(top.slice(0, MISSIONS_PER_DAY).reduce((a, b) => a + b, 0) + ALL_MISSIONS_BONUS).toBeLessThanOrEqual(7);
    expect(ACHIEVEMENTS.reduce((a, x) => a + x.reward, 0)).toBeLessThanOrEqual(150);
  });
});

describe('achievements', () => {
  it('unlock once, on the day they are reached, with their stars', () => {
    let s = home();
    expect(achievementMet(s, 'first_resident')).toBe(false);
    [s] = admit(s);
    const a = goalsTick(s);
    const first = ACHIEVEMENTS.find((x) => x.id === 'first_resident')!;
    expect(goalsOf(a).achievements.first_resident).toBe(dayOf(s.minute));
    expect(goalsOf(a).stars).toBeGreaterThanOrEqual(first.reward);
    expect(goalsOf(goalsTick(a)).stars).toBe(goalsOf(a).stars);
  });

  it('the town tour needs every place; shopping needs five upgrades', () => {
    let s = home();
    [s] = admit(s);
    [s] = hire(s, 'caregiver');
    for (const place of ['coffee', 'cake', 'restaurant', 'park'] as const) s = ok(s, { type: 'visitPlace', place });
    expect(achievementMet(s, 'town_tour')).toBe(false);
    s = ok(s, { type: 'visitPlace', place: 'mall' });
    expect(achievementMet(s, 'town_tour')).toBe(true);
    expect(achievementMet({ ...s, upgrades: ['online_marketing', 'staff_welfare', 'central_kitchen', 'family_lounge'] }, 'shopper')).toBe(false);
    expect(achievementMet({ ...s, upgrades: ['online_marketing', 'staff_welfare', 'central_kitchen', 'family_lounge', 'family_app'] }, 'shopper')).toBe(true);
  });

  it('run inside the game clock: a day of play keeps goals in the state and older saves without goals still play', () => {
    let s = home();
    [s] = admit(s);
    const legacy = { ...s };
    delete legacy.goals;
    for (let i = 0; i < 6 * 24 + 1; i++) s = step(s);
    expect(s.goals).toBeTruthy();
    expect(s.goals!.day).toBe(dayOf(s.minute));
    expect(() => step(legacy)).not.toThrow();
    expect(applyCommand(s, { type: 'setSpeed', speed: 2 }).result.ok).toBe(true);
  });
});
