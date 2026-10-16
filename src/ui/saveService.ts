import { useEffect } from 'react';
import { START_MINUTE } from '../sim/constants';
import { dayOf } from '../sim/systems/time';
import { connectCloud } from '../storage/cloudStore';
import { LocalStore } from '../storage/localStore';
import { SaveManager, type CloudStatus } from '../storage/saves';
import type { GameState } from '../domain/types';
import { useGame } from './store';
import { create } from 'zustand';

/** One save manager per page: this browser's IndexedDB plus the player's cloud space when available. */
export const saves = new SaveManager(new LocalStore());

export const useSaveStatus = create<{ cloud: CloudStatus; lastAutoAt: number | null; version: number }>(() => ({
  cloud: 'connecting',
  lastAutoAt: null,
  version: 0,
}));

let cloudInit: Promise<void> | null = null;
export function initCloud(): Promise<void> {
  cloudInit ??= connectCloud().then((store) => {
    saves.attachCloud(store);
    useSaveStatus.setState((s) => ({ cloud: saves.cloudStatus, version: s.version + 1 }));
  });
  return cloudInit;
}

function bump() {
  useSaveStatus.setState((s) => ({ cloud: saves.cloudStatus, version: s.version + 1 }));
}

/** A fresh, untouched game is never autosaved (it would overwrite a real save with nothing). */
function worthSaving(g: GameState): boolean {
  return g.minute > START_MINUTE || g.ledger.length > 1 || g.employees.length > 0;
}

export async function saveTo(slot: 'auto' | 'slot1' | 'slot2' | 'slot3', game = useGame.getState().game) {
  await initCloud();
  const res = await saves.save(game, slot);
  if (slot === 'auto') useSaveStatus.setState({ lastAutoAt: Date.now() });
  bump();
  return res;
}

let saving = false;
async function autosave() {
  const { game, started } = useGame.getState();
  if (!started || !worthSaving(game) || saving) return;
  saving = true;
  try {
    await saveTo('auto', game);
  } finally {
    saving = false;
  }
}

/**
 * Autosave: at the start of every game day, every 60 s of real time while
 * something changed, and whenever the tab is hidden or closed (phones kill
 * background tabs without warning).
 */
export function useAutosave() {
  useEffect(() => {
    void initCloud();
    let lastDay = dayOf(useGame.getState().game.minute);
    let dirty = false;
    const unsub = useGame.subscribe((s, prev) => {
      if (s.game === prev.game) return;
      dirty = true;
      const d = dayOf(s.game.minute);
      if (d !== lastDay) {
        lastDay = d;
        dirty = false;
        void autosave();
      }
    });
    const timer = setInterval(() => {
      if (dirty) {
        dirty = false;
        void autosave();
      }
    }, 60_000);
    const onHide = () => {
      if (document.visibilityState === 'hidden') void autosave();
    };
    const onPageHide = () => void autosave();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      unsub();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);
}
