import { advance, applyCommand } from '../sim/engine';
import { reconcile } from '../domain/rules/ledger';
import { chapterDef, PROGRAMMES } from '../data/chapters';
import { buildObjectives } from '../sim/selectors';
import { nextChapterAvailable } from '../sim/systems/chapter';
import { CHALLENGES, CHALLENGE_ORDER, SANDBOX_CASH, modeOf, newGameState } from '../sim/modes';
import { TICKS_PER_DAY } from '../sim/constants';
import { playthrough } from './bot';

describe('game modes', () => {
  it('a campaign game is unchanged: chapter 1, standard capital, no mode recorded', () => {
    const s = newGameState('starter');
    expect(modeOf(s)).toBe('campaign');
    expect(s.mode).toBeUndefined();
    expect(s.chapter.id).toBe(1);
  });

  it('sandbox: a large budget booked as capital, every room unlocked, no steps and never judged', () => {
    let s = newGameState('starter', 'sandbox');
    expect(s.mode).toBe('sandbox');
    expect(s.ledger.find((e) => e.category === 'capital')!.amountSatang).toBe(SANDBOX_CASH);
    expect(reconcile(s).ok).toBe(true);
    expect(buildObjectives(s)).toEqual([]);
    expect(s.applicants.some((a) => a.role === 'doctor')).toBe(true);
    // Rooms from the last chapters can be built straight away.
    expect(applyCommand(s, { type: 'placePrefab', prefab: 'clinic', origin: { x: 14, y: 11 } }).result.ok).toBe(true);
    s = advance(s, TICKS_PER_DAY * 70);
    expect(s.chapter.result).toBeNull();
  });

  it('each challenge opens with its own conditions', () => {
    const budget = newGameState('starter', 'challenge', 'tight_budget');
    expect(budget.ledger.find((e) => e.category === 'capital')!.amountSatang).toBe(CHALLENGES.tight_budget.cashSatang);
    expect(newGameState('starter', 'challenge', 'bad_name').organization.reputation).toBe(18);
    const big = newGameState('starter', 'challenge', 'big_start');
    expect(big.chapter.id).toBe(2);
    for (const g of PROGRAMMES) expect(big.waitlist.some((c) => c.group === g)).toBe(true);
  });

  for (const id of CHALLENGE_ORDER)
    it(`challenge ${id} can be won by a careful player, and winning ends it`, () => {
      const def = CHALLENGES[id];
      const run = playthrough(newGameState('empty', 'challenge', id), chapterDef(def.chapter).days + 1);
      expect(run.state.chapter.result?.outcome).toBe('won');
      expect(run.minCash).toBeGreaterThan(0);
      expect(nextChapterAvailable(run.state)).toBeNull();
      expect(applyCommand(run.state, { type: 'startChapter' }).result.ok).toBe(false);
      expect(reconcile(run.state).ok).toBe(true);
    }, 60000);
});
