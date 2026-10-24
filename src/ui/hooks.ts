import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatTHB } from '../domain/money';
import { roomNumber, summarize } from '../sim/selectors';
import type { Room } from '../domain/types';
import { localeOf, translate } from './i18n';
import { useGame } from './store';
import { MS_PER_TICK_1X } from './constants';
import { AWAY_GAP_MS, autopilotOn, offerAway } from './away';

export function useT() {
  const lang = useGame((s) => s.lang);
  return useCallback((key: string, params?: Record<string, string | number>) => translate(lang, key, params), [lang]);
}

export function useMoney() {
  const lang = useGame((s) => s.lang);
  return useCallback((satang: number) => formatTHB(satang, localeOf(lang)), [lang]);
}

export function useSummary() {
  const game = useGame((s) => s.game);
  return useMemo(() => summarize(game), [game]);
}

export { MS_PER_TICK_1X };

/** Fixed-step game loop: the simulation advances in whole ticks independent of frame rate. */
export function useGameLoop() {
  const acc = useRef(0);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastWall = Date.now();
    const frame = (now: number) => {
      const dt = Math.min(250, now - last);
      last = now;
      const wall = Date.now();
      const gap = wall - lastWall;
      lastWall = wall;
      const { game, tick, away, awayOffer, awayPlay, started } = useGame.getState();
      // Back after the tab was hidden or the screen slept: an autopilot game catches up the time away.
      if (gap > AWAY_GAP_MS && awayPlay && started && game.speed > 0 && autopilotOn(game) && !away && !awayOffer) offerAway(gap, game.speed, MS_PER_TICK_1X);
      // The clock waits while the time away is being played out or the player is choosing.
      if (away || useGame.getState().awayOffer) acc.current = 0;
      else if (game.speed > 0) {
        acc.current += dt * game.speed;
        const n = Math.min(32, Math.floor(acc.current / MS_PER_TICK_1X));
        if (n > 0) {
          acc.current -= n * MS_PER_TICK_1X;
          tick(n);
        }
      } else acc.current = 0;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
}

export function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const st = useGame.getState();
      if (e.code === 'Space') {
        e.preventDefault();
        st.togglePause();
      } else if (e.key === '1') st.dispatch({ type: 'setSpeed', speed: 0 });
      else if (e.key === '2') st.dispatch({ type: 'setSpeed', speed: 1 });
      else if (e.key === '3') st.dispatch({ type: 'setSpeed', speed: 2 });
      else if (e.key === '4') st.dispatch({ type: 'setSpeed', speed: 4 });
      else if ((e.key === 'r' || e.key === 'R') && (st.tool.kind === 'prefab' || st.tool.kind === 'move')) st.setTool({ ...st.tool, rotated: !st.tool.rotated });
      else if (e.key === 'Escape') {
        if (st.chaptersOpen) return st.setChaptersOpen(false);
        if (st.saveOpen) return st.setSaveOpen(false);
        st.setTool({ kind: 'select' });
        st.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export const MOBILE_QUERY = '(max-width: 1023px)';

export function isMobileNow(): boolean {
  try {
    return window.matchMedia(MOBILE_QUERY).matches;
  } catch {
    return false;
  }
}

/** True on phones and small tablets (below the desktop three-column layout). */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(isMobileNow);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const on = () => setMobile(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return mobile;
}

/** A building's label: the player's name for it, or the default "Ward 1", "Villa 2", "Nursing station". */
export function useRoomLabel() {
  const t = useT();
  const site = useGame((s) => s.game.site);
  return useCallback(
    (room: Room) => {
      if (room.name) return room.name;
      const n = roomNumber(site, room);
      return n === null ? t(`room.${room.type}`) : `${t(`room.${room.type}`)} ${n}`;
    },
    [t, site],
  );
}
