import { useEffect } from 'react';
import { AUTO_KEYS, autoSettings } from '../sim/autopilot';
import { buildObjectives } from '../sim/selectors';
import { MINUTES_PER_DAY } from '../sim/constants';
import type { GameEventRow } from '../storage/supabaseStore';
import type { GameState } from '../domain/types';
import { supabase } from './saveService';
import { useGame } from './store';

/**
 * Anonymous play statistics for the deployed site, to see where players get stuck: games started,
 * tutorial steps reached, chapter verdicts (with the targets missed), autopilot switches, and a ping
 * every 5 minutes of play (chapter and day). No names, emails or game content beyond these numbers.
 * Sent in small batches to Supabase's insert-only `game_events` table, only when the player has
 * statistics on (Settings) and the site is connected to Supabase. Never inside the Claude artifact.
 */

const FLUSH_MS = 10_000;
const PING_MS = 5 * 60_000;

const dayOf = (g: GameState) => Math.floor(g.minute / MINUTES_PER_DAY) + 1;

export function useTelemetry(): void {
  useEffect(() => {
    const session = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    let queue: GameEventRow[] = [];
    const goals = new Set<string>();
    let lastHour = -1;
    let autoTimer: number | null = null;

    const push = (row: Omit<GameEventRow, 'session'>) => {
      const st = useGame.getState();
      if (!st.statsOn || !supabase) return;
      queue.push({ session, ...row });
    };
    const flush = async () => {
      if (!queue.length || !supabase) return;
      const rows = queue;
      queue = [];
      const ok = await supabase.logEvents(rows).catch(() => false);
      // Keep a few for the next try if the network blinked; drop the rest rather than grow forever.
      if (!ok) queue = [...rows.slice(-20), ...queue].slice(-50);
    };

    const unsub = useGame.subscribe((s, prev) => {
      if (!s.started || s.away) return;
      const g = s.game;
      const p = prev.game;
      const fresh = (s.started && !prev.started) || g.seed !== p.seed || g.minute < p.minute;
      if (fresh) {
        goals.clear();
        push({ kind: 'game_start', chapter: g.chapter.id, day: dayOf(g), data: { mode: g.mode ?? 'campaign', challenge: g.challenge ?? null, resumed: g.minute > 8 * 60 } });
      }
      if (g.chapter.result && g.chapter.result !== p.chapter.result) {
        const r = g.chapter.result;
        push({ kind: 'chapter_result', chapter: r.chapter, day: r.day, data: { outcome: r.outcome, missed: r.checks.filter((c) => !c.ok).map((c) => c.id) } });
      }
      if (g.auto !== p.auto) {
        if (autoTimer !== null) window.clearTimeout(autoTimer);
        autoTimer = window.setTimeout(() => {
          const a = autoSettings(useGame.getState().game);
          push({ kind: 'autopilot', chapter: g.chapter.id, day: dayOf(g), data: { on: AUTO_KEYS.filter((k) => a[k]) } });
        }, 2000);
      }
      // Tutorial steps, checked once a game hour.
      const hour = Math.floor(g.minute / 60);
      if (hour !== lastHour) {
        lastHour = hour;
        for (const o of buildObjectives(g))
          if (o.done && o.id !== 'chapter' && !goals.has(`${g.chapter.id}:${o.id}`)) {
            goals.add(`${g.chapter.id}:${o.id}`);
            push({ kind: 'goal_done', chapter: g.chapter.id, day: dayOf(g), data: { goal: o.id } });
          }
      }
    });
    const ping = window.setInterval(() => {
      const { game, started } = useGame.getState();
      if (started) push({ kind: 'session_ping', chapter: game.chapter.id, day: dayOf(game), data: { residents: game.residents.length, speed: game.speed } });
    }, PING_MS);
    const timer = window.setInterval(() => void flush(), FLUSH_MS);
    const onHide = () => document.visibilityState === 'hidden' && void flush();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      unsub();
      window.clearInterval(ping);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);
}
