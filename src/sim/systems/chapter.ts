import { STARTER_SCENARIO } from '../../data/scenarios';
import type { ChapterCheck, ChapterResult, GameState } from '../../domain/types';
import { log } from '../helpers';
import { summarizeBeds } from '../bedsSummary';
import { entryDay, totalsOf } from '../selectors';

/**
 * Chapter 1 story goal (CLAUDE.md "Initial user story"): build a 10-bed home, fill it, care well and
 * keep the business in the black for 30 days. The engine judges it exactly once, at a midnight:
 * - failed (bankrupt) as soon as a day closes with cash below zero,
 * - otherwise won or failed (targets) when the last challenge day closes.
 * The verdict is stored so it never changes afterwards; play continues either way.
 */

/** Operating result (revenue minus running costs, construction excluded) for days 1..lastDay. */
export function operatingNet(state: GameState, lastDay: number): number {
  return totalsOf(state.ledger.filter((e) => e.category !== 'capital' && entryDay(e) <= lastDay)).net;
}

/** Care quality of a closed day: 0.6 × well-being + 0.4 × task completion, as on the dashboard. */
function dayQuality(state: GameState): number {
  const d = state.history[state.history.length - 1];
  if (!d || d.wellbeing < 0) return 0;
  const completion = d.done + d.missed > 0 ? d.done / (d.done + d.missed) : 1;
  return Math.round(0.6 * d.wellbeing + 0.4 * completion * 100);
}

/** Live targets for the current state (the UI shows these as progress before the verdict). */
export function chapterChecks(state: GameState, scenario = STARTER_SCENARIO): ChapterCheck[] {
  const lowest = Math.min(state.organization.cashSatang, ...state.history.map((h) => h.cash));
  const beds = summarizeBeds(state);
  const net = operatingNet(state, scenario.targetDays);
  const quality = state.residents.length ? dayQuality(state) : 0;
  return [
    { id: 'solvent', have: lowest, need: 0, ok: lowest >= 0 },
    { id: 'beds', have: beds, need: scenario.targetBeds, ok: beds >= scenario.targetBeds },
    { id: 'residents', have: state.residents.length, need: scenario.targetResidents, ok: state.residents.length >= scenario.targetResidents },
    { id: 'cashflow', have: net, need: 1, ok: net > 0 },
    { id: 'quality', have: quality, need: scenario.targetQuality, ok: quality >= scenario.targetQuality },
  ];
}

/** Runs at each midnight after the day is closed. `closingDay` is the day that just ended. */
export function judgeChapter(state: GameState, closingDay: number, scenario = STARTER_SCENARIO): GameState {
  if (state.chapter.result) return state;
  let result: ChapterResult | null = null;
  if (state.organization.cashSatang < 0) {
    result = { outcome: 'failed', day: closingDay, reason: 'bankrupt', checks: chapterChecks(state, scenario) };
  } else if (closingDay >= scenario.targetDays) {
    const checks = chapterChecks(state, scenario);
    const won = checks.every((c) => c.ok);
    result = { outcome: won ? 'won' : 'failed', day: closingDay, reason: won ? 'complete' : 'targets', checks };
  }
  if (!result) return state;
  // Pause so the player sees the verdict; the UI resumes on request.
  const s: GameState = { ...state, speed: 0, chapter: { result } };
  return log(s, result.outcome === 'won' ? 'good' : 'warn', `chapter.log.${result.reason}`);
}
