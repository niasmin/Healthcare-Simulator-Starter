import { step } from '../sim/engine';
import { AUTO_KEYS, autoSettings } from '../sim/autopilot';
import type { GameState } from '../domain/types';
import { MINUTES_PER_DAY } from '../sim/constants';
import { useGame } from './store';

/**
 * Away play: while the tab is hidden, the screen sleeps or the game is closed, an autopilot game
 * keeps running. When the player is back, a short absence (up to a game day) is caught up at once;
 * a longer one is offered first ("play out the time away" or "carry on from now"), since playing
 * out many days takes a while on a slow phone. The missed time is simulated in small slices (so
 * the page stays responsive), can be stopped part way, and is summed up. It stops early when the game pauses itself (an event the
 * autopilot leaves to the player, or the end of the campaign). Purely a UI feature: the simulation
 * is the same pure step() as normal play, so results are identical to leaving the tab open.
 */

/** At most this many game days are caught up at once. */
export const MAX_AWAY_DAYS = 30;
/** Up to this many ticks (one game day) are caught up without asking. */
export const AUTO_CATCH_UP_TICKS = MINUTES_PER_DAY / 10;
/** Each slice of catch-up runs for about this long before letting the page draw. */
const SLICE_MS = 40;
/** Gaps shorter than this (ms of real time) are ordinary frame hiccups, not time away. */
export const AWAY_GAP_MS = 3000;

export interface AwayReport {
  ticks: number;
  cashDelta: number;
  residentsDelta: number;
  fromDay: number;
  toDay: number;
  chaptersWon: number;
  chapter: number;
  stoppedEarly: boolean;
  /** The player pressed stop part way. */
  stoppedByPlayer?: boolean;
}

export function autopilotOn(game: GameState): boolean {
  const a = autoSettings(game);
  return AUTO_KEYS.some((k) => a[k]);
}

/** Ticks the game would have run in `ms` of real time at `speed`, capped. */
export function ticksFor(ms: number, speed: number, msPerTick: number): number {
  return Math.min(MAX_AWAY_DAYS * AUTO_CATCH_UP_TICKS, Math.floor((ms * speed) / msPerTick));
}

const wins = (g: GameState) => g.chapter.past.filter((v) => v.outcome === 'won').length + (g.chapter.result?.outcome === 'won' ? 1 : 0);

let stopRequested = false;

/** Stop a catch-up part way: what has been played so far is kept and summed up. */
export function stopAway(): void {
  stopRequested = true;
}

/**
 * Back after `ms` of real time away: catch up a short absence at once, or ask first when it is
 * longer than a game day (the player chooses in AwayOfferModal).
 */
export function offerAway(ms: number, speed: number, msPerTick: number): void {
  const st = useGame.getState();
  if (st.away || st.awayOffer) return;
  const ticks = ticksFor(ms, speed, msPerTick);
  if (ticks <= 0) return;
  if (ticks <= AUTO_CATCH_UP_TICKS) runAway(ticks);
  else useGame.setState({ awayOffer: { ticks, ms } });
}

/** Simulate `total` ticks in the background, in short slices, then show the summary. */
export function runAway(total: number): void {
  const st = useGame.getState();
  if (st.away || total <= 0) return;
  const before = st.game;
  let done = 0;
  stopRequested = false;
  useGame.setState({ away: { done: 0, total }, awayOffer: null });
  const chunk = () => {
    let s = useGame.getState().game;
    const until = performance.now() + SLICE_MS;
    while (done < total && s.speed > 0 && !stopRequested) {
      s = step(s);
      done++;
      if (done % 12 === 0 && performance.now() >= until) break;
    }
    const finished = done >= total || s.speed === 0 || stopRequested;
    useGame.setState({ game: s, away: finished ? null : { done, total } });
    if (!finished) {
      setTimeout(chunk, 0);
      return;
    }
    // Only worth a summary after at least a few game hours.
    if (done >= 18)
      useGame.setState({
        awayReport: {
          ticks: done,
          cashDelta: s.organization.cashSatang - before.organization.cashSatang,
          residentsDelta: s.residents.length - before.residents.length,
          fromDay: Math.floor(before.minute / MINUTES_PER_DAY) + 1,
          toDay: Math.floor(s.minute / MINUTES_PER_DAY) + 1,
          chaptersWon: wins(s) - wins(before),
          chapter: s.chapter.id,
          stoppedEarly: done < total && !stopRequested,
          stoppedByPlayer: stopRequested,
        },
      });
  };
  setTimeout(chunk, 0);
}
