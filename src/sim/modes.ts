import { thb } from '../domain/money';
import { STARTER_SCENARIO } from '../data/scenarios';
import { PROGRAMMES } from '../data/chapters';
import type { ChallengeId, GameMode, GameState } from '../domain/types';
import { createInitialState } from './state';
import { openInventory } from './systems/inventory';
import { applyTemplate, type GameTemplate } from './templates';
import { makeApplicant, makeResidentCandidate } from './systems/staffing';

/**
 * Game modes from the title screen. Every mode uses the same engine and rules; only the opening
 * differs. All amounts are fictional game balancing.
 * - campaign: the 7-chapter story from Chapter 1.
 * - sandbox: free play with a large budget and every room unlocked; no verdicts, no tutorial steps.
 * - challenge: one judged chapter under harder opening conditions; no follow-on chapter.
 */

export const SANDBOX_CASH = thb(50_000_000);

export interface ChallengeDef {
  id: ChallengeId;
  /** Chapter whose targets and days judge the challenge. */
  chapter: number;
  cashSatang: number;
  /** Starting reputation (default 50). */
  reputation?: number;
}

export const CHALLENGES: Record<ChallengeId, ChallengeDef> = {
  // Chapter 1 with little over half the money: every baht of the build must earn its place.
  tight_budget: { id: 'tight_budget', chapter: 1, cashSatang: thb(1_150_000) },
  // Chapter 1 after a bad review: few families enquire until the care wins the name back.
  bad_name: { id: 'bad_name', chapter: 1, cashSatang: thb(2_000_000), reputation: 18 },
  // Chapter 2 from day one: build a 30-bed professional nursing centre straight away.
  big_start: { id: 'big_start', chapter: 2, cashSatang: thb(4_000_000) },
};
export const CHALLENGE_ORDER: ChallengeId[] = ['tight_budget', 'bad_name', 'big_start'];

export function modeOf(state: GameState): GameMode {
  return state.mode ?? 'campaign';
}

/** A new game from the title screen: the chosen mode, with the stock room open. */
export function newGameState(template: GameTemplate = 'starter', mode: GameMode = 'campaign', challenge?: ChallengeId, seed = STARTER_SCENARIO.defaultSeed): GameState {
  return openInventory(modeState(template, mode, challenge, seed));
}

function modeState(template: GameTemplate, mode: GameMode, challenge: ChallengeId | undefined, seed: number): GameState {
  if (mode === 'sandbox') {
    const s = applyTemplate(createInitialState(seed, { ...STARTER_SCENARIO, startingCashSatang: SANDBOX_CASH }), template);
    // Chapter 7 unlocks every room and service; sandbox games are never judged.
    let out: GameState = { ...s, mode, chapter: { id: 7, startDay: 1, result: null, past: [] } };
    for (let i = 0; i < 2; i++) out = makeApplicant(out, 'doctor');
    return out;
  }
  if (mode === 'challenge' && challenge) {
    const def = CHALLENGES[challenge];
    let s = applyTemplate(createInitialState(seed, { ...STARTER_SCENARIO, startingCashSatang: def.cashSatang }), template);
    s = { ...s, mode, challenge, chapter: { id: def.chapter, startDay: 1, result: null, past: [] } };
    if (def.reputation !== undefined) s = { ...s, organization: { ...s.organization, reputation: def.reputation } };
    // A Chapter 2 start gets the programme candidates the campaign hands out when the chapter opens.
    if (def.chapter === 2) for (const group of PROGRAMMES) s = makeResidentCandidate(s, { group });
    return s;
  }
  return applyTemplate(createInitialState(seed), template);
}
