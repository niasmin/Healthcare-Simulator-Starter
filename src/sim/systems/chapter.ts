import { CHAPTERS, chapterDef, type ChapterDef } from '../../data/chapters';
import type { ChapterCheck, ChapterResult, GameState } from '../../domain/types';
import { log } from '../helpers';
import { summarizeBeds } from '../bedsSummary';
import { entryDay, totalsOf } from '../selectors';
import { makeResidentCandidate } from './staffing';
import { dayOf } from './time';

/**
 * Campaign chapters (CLAUDE.md user story, then the concept-art road map). The engine judges the
 * running chapter exactly once, at a midnight:
 * - failed (bankrupt) as soon as a day closes with cash below zero,
 * - otherwise won or failed (targets) when the chapter's last day closes.
 * The verdict is stored so it never changes afterwards; play continues either way, and a won
 * chapter lets the player start the next one with the same business.
 */

/** Last day of the running chapter. */
export function chapterEndDay(state: GameState): number {
  return state.chapter.startDay + chapterDef(state.chapter.id).days - 1;
}

/** Operating result (revenue minus running costs, construction excluded) over days first..last. */
export function operatingNet(state: GameState, lastDay: number, firstDay = 1): number {
  return totalsOf(state.ledger.filter((e) => e.category !== 'capital' && entryDay(e) >= firstDay && entryDay(e) <= lastDay)).net;
}

/** Care quality of a closed day: 0.6 × well-being + 0.4 × task completion, as on the dashboard. */
function dayQuality(state: GameState): number {
  const d = state.history[state.history.length - 1];
  if (!d || d.wellbeing < 0) return 0;
  const completion = d.done + d.missed > 0 ? d.done / (d.done + d.missed) : 1;
  return Math.round(0.6 * d.wellbeing + 0.4 * completion * 100);
}

/** Live targets of the running chapter (the UI shows these as progress before the verdict). */
export function chapterChecks(state: GameState, def: ChapterDef = chapterDef(state.chapter.id)): ChapterCheck[] {
  const start = state.chapter.startDay;
  const lowest = Math.min(state.organization.cashSatang, ...state.history.filter((h) => h.day >= start).map((h) => h.cash));
  const beds = summarizeBeds(state);
  const net = operatingNet(state, start + def.days - 1, start);
  const quality = state.residents.length ? dayQuality(state) : 0;
  const checks: ChapterCheck[] = [
    { id: 'solvent', have: lowest, need: 0, ok: lowest >= 0 },
    { id: 'beds', have: beds, need: def.targetBeds, ok: beds >= def.targetBeds },
    { id: 'residents', have: state.residents.length, need: def.targetResidents, ok: state.residents.length >= def.targetResidents },
  ];
  if (def.targetRn) {
    const rn = state.employees.filter((e) => e.role === 'rn').length;
    checks.push({ id: 'rn', have: rn, need: def.targetRn, ok: rn >= def.targetRn });
  }
  if (def.programmes) {
    const have = def.programmes.filter((g) => state.residents.some((r) => r.group === g)).length;
    checks.push({ id: 'programmes', have, need: def.programmes.length, ok: have >= def.programmes.length });
  }
  checks.push({ id: 'cashflow', have: net, need: 1, ok: net > 0 }, { id: 'quality', have: quality, need: def.targetQuality, ok: quality >= def.targetQuality });
  return checks;
}

/** Runs at each midnight after the day is closed. `closingDay` is the day that just ended. */
export function judgeChapter(state: GameState, closingDay: number): GameState {
  if (state.chapter.result) return state;
  const chapter = state.chapter.id;
  let result: ChapterResult | null = null;
  if (state.organization.cashSatang < 0) {
    result = { chapter, outcome: 'failed', day: closingDay, reason: 'bankrupt', checks: chapterChecks(state) };
  } else if (closingDay >= chapterEndDay(state)) {
    const checks = chapterChecks(state);
    const won = checks.every((c) => c.ok);
    result = { chapter, outcome: won ? 'won' : 'failed', day: closingDay, reason: won ? 'complete' : 'targets', checks };
  }
  if (!result) return state;
  // Pause so the player sees the verdict; the UI resumes on request.
  const s: GameState = { ...state, speed: 0, chapter: { ...state.chapter, result } };
  return log(s, result.outcome === 'won' ? 'good' : 'warn', `chapter.log.${result.reason}`, { c: chapter });
}

/** The chapter after a won one, if it is playable in this version. */
export function nextChapterAvailable(state: GameState): number | null {
  const { result, id } = state.chapter;
  return result?.outcome === 'won' && id < CHAPTERS.length ? id + 1 : null;
}

/** Start the next chapter today with the same business. Null when it isn't available. */
export function startNextChapter(state: GameState): GameState | null {
  const next = nextChapterAvailable(state);
  if (!next) return null;
  let s: GameState = {
    ...state,
    chapter: { id: next, startDay: dayOf(state.minute), result: null, past: [...state.chapter.past, state.chapter.result!] },
  };
  // New programmes arrive on the waiting list right away, one of each.
  for (const group of chapterDef(next).programmes ?? []) s = makeResidentCandidate(s, { group });
  return log(s, 'good', 'chapter.log.started', { c: next });
}
