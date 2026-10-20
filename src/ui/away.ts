import { step } from '../sim/engine';
import { AUTO_KEYS, autoSettings } from '../sim/autopilot';
import type { GameState } from '../domain/types';
import { MINUTES_PER_DAY } from '../sim/constants';
import { useGame } from './store';

/**
 * Away play: while the tab is hidden, the screen sleeps or the game is closed, an autopilot game
 * keeps running. When the player is back, the missed time is simulated in one-day chunks (so the
 * page stays responsive) and summed up. It stops early when the game pauses itself (an event the
 * autopilot leaves to the player, or the end of the campaign). Purely a UI feature: the simulation
 * is the same pure step() as normal play, so results are identical to leaving the tab open.
 */

/** At most this many game days are caught up at once. */
export const MAX_AWAY_DAYS = 30;
/** Gaps shorter than this (ms of real time) are ordinary frame hiccups, not time away. */
export const AWAY_GAP_MS = 3000;
const TICKS_PER_DAY = MINUTES_PER_DAY / 10;

export interface AwayReport {
  ticks: number;
  cashDelta: number;
  residentsDelta: number;
  fromDay: number;
  toDay: number;
  chaptersWon: number;
  chapter: number;
  stoppedEarly: boolean;
}

export function autopilotOn(game: GameState): boolean {
  const a = autoSettings(game);
  return AUTO_KEYS.some((k) => a[k]);
}

/** Ticks the game would have run in `ms` of real time at `speed`, capped. */
export function ticksFor(ms: number, speed: number, msPerTick: number): number {
  return Math.min(MAX_AWAY_DAYS * TICKS_PER_DAY, Math.floor((ms * speed) / msPerTick));
}

const wins = (g: GameState) => g.chapter.past.filter((v) => v.outcome === 'won').length + (g.chapter.result?.outcome === 'won' ? 1 : 0);

/** Simulate `total` ticks in the background, one game day per chunk, then show the summary. */
export function runAway(total: number): void {
  const st = useGame.getState();
  if (st.away || total <= 0) return;
  const before = st.game;
  let done = 0;
  useGame.setState({ away: { done: 0, total } });
  const chunk = () => {
    let s = useGame.getState().game;
    const n = Math.min(TICKS_PER_DAY, total - done);
    for (let i = 0; i < n && s.speed > 0; i++) {
      s = step(s);
      done++;
    }
    const finished = done >= total || s.speed === 0;
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
          stoppedEarly: done < total,
        },
      });
  };
  setTimeout(chunk, 0);
}
