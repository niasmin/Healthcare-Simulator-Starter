import { useEffect } from 'react';
import { dailyRunningCost } from '../sim/selectors';
import type { GameState } from '../domain/types';
import { translate } from './i18n';
import { useGame } from './store';

/**
 * Alerts: tell the player when something needs them. The cash runway falling under two weeks, or the
 * game pausing itself for a decision (an event, a chapter verdict). In-game as a toast; in another
 * tab as a mark on the tab title and, if the player allowed it, a browser notification.
 * Each alert fires once when its condition starts, not on every tick.
 */

export const LOW_CASH_DAYS = 14;

type AlertKind = 'cash' | 'paused';

export function alertsFor(game: GameState): { kind: AlertKind; days?: number } | null {
  if (game.speed === 0 && (game.events.active || game.chapter.result)) return { kind: 'paused' };
  const cost = dailyRunningCost(game);
  if (cost > 0 && game.organization.cashSatang < cost * LOW_CASH_DAYS) return { kind: 'cash', days: Math.max(0, Math.floor(game.organization.cashSatang / cost)) };
  return null;
}

/** Ask the browser for notification permission (call from a click). Quietly does nothing where unsupported. */
export function askNotifyPermission(): void {
  try {
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
  } catch {
    /* not available in this frame */
  }
}

function browserNotify(title: string, body: string): void {
  try {
    if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body });
  } catch {
    /* not available in this frame */
  }
}

export function useAlerts(): void {
  useEffect(() => {
    const baseTitle = document.title;
    let last: AlertKind | null = null;
    let lastHour = -1;
    const check = (game: GameState) => {
      const st = useGame.getState();
      if (!st.alertsOn || !st.started || st.away) return;
      const a = alertsFor(game);
      const kind = a?.kind ?? null;
      if (kind === last) return;
      last = kind;
      if (!a) {
        document.title = baseTitle;
        return;
      }
      const params = a.days !== undefined ? { days: a.days } : undefined;
      // On screen, a paused game already shows its own card; only low cash needs a toast.
      if (a.kind === 'cash') st.notify(`alert.${a.kind}`, 'error', params);
      if (document.visibilityState === 'hidden') {
        const title = translate(st.lang, `alert.title_${a.kind}`);
        document.title = `${title} · ${baseTitle}`;
        browserNotify(title, translate(st.lang, `alert.${a.kind}`, params));
      }
    };
    const unsub = useGame.subscribe((s, prev) => {
      if (s.game === prev.game) return;
      // Pauses are checked at once; cash once a game hour (it only moves in steps).
      const hour = Math.floor(s.game.minute / 60);
      if (s.game.speed !== prev.game.speed || hour !== lastHour) {
        lastHour = hour;
        check(s.game);
      }
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') document.title = baseTitle;
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsub();
      document.removeEventListener('visibilitychange', onVisible);
      document.title = baseTitle;
    };
  }, []);
}
