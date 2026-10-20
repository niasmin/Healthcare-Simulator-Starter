import { useEffect } from 'react';
import { START_MINUTE } from '../sim/constants';
import { dayOf } from '../sim/systems/time';
import { connectCloud } from '../storage/cloudStore';
import { connectSupabase, type SupabaseAccount, type SupabaseConnection } from '../storage/supabaseStore';
import { LocalStore } from '../storage/localStore';
import { SaveManager, type CloudStatus } from '../storage/saves';
import type { GameState } from '../domain/types';
import { useGame } from './store';
import { create } from 'zustand';

/** One save manager per page: this browser's IndexedDB plus the player's cloud space when available. */
export const saves = new SaveManager(new LocalStore());

export const useSaveStatus = create<{ cloud: CloudStatus; lastAutoAt: number | null; version: number; provider: 'claude' | 'supabase' | null; account: SupabaseAccount | null; recovering: boolean }>(() => ({
  cloud: 'connecting',
  lastAutoAt: null,
  version: 0,
  provider: null,
  account: null,
  recovering: false,
}));

/** The Supabase connection on the deployed site (null inside the Claude artifact or without config). */
export let supabase: SupabaseConnection | null = null;

let cloudInit: Promise<void> | null = null;
export function initCloud(): Promise<void> {
  // Inside the Claude artifact its own per-person db; on the deployed site, Supabase.
  cloudInit ??= connectCloud().then(async (store) => {
    if (store) {
      saves.attachCloud(store);
      useSaveStatus.setState((s) => ({ cloud: saves.cloudStatus, version: s.version + 1, provider: 'claude' }));
      return;
    }
    supabase = await connectSupabase();
    saves.attachCloud(supabase?.store ?? null);
    useSaveStatus.setState((s) => ({ cloud: saves.cloudStatus, version: s.version + 1, provider: supabase ? 'supabase' : null, account: supabase?.account ?? null, recovering: !!supabase?.recovering }));
    supabase?.onChange((next, account) => {
      saves.attachCloud(next);
      useSaveStatus.setState((s) => ({ cloud: saves.cloudStatus, version: s.version + 1, account, recovering: !!supabase?.recovering }));
      // Bring this browser's newest game into the newly signed-in account.
      void autosave();
    });
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
