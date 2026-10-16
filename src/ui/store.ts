import { create } from 'zustand';
import { applyCommand, step, type Command } from '../sim/engine';
import { createInitialState } from '../sim/state';
import type { Cell, CommandResult, DecorType, GameState, RoomType } from '../domain/types';
import type { Lang } from './i18n';

export type Tool = { kind: 'select' } | { kind: 'corridor' } | { kind: 'bulldoze' } | { kind: 'room'; roomType: RoomType } | { kind: 'decor'; decor: DecorType };

export type View = 'map' | 'residents' | 'roster' | 'finance';
export type LeftTab = 'build' | 'hire' | 'admit';
/** Phone layout: which bottom sheet is open. */
export type Sheet = 'tools' | 'info' | 'menu' | null;

export interface Toast {
  id: number;
  key: string;
  params?: Record<string, string | number>;
  level: 'error' | 'ok';
}

interface UIStore {
  game: GameState;
  lang: Lang;
  tool: Tool;
  selectedRoomId: string | null;
  hover: Cell | null;
  drag: { start: Cell; end: Cell } | null;
  toast: Toast | null;
  /** Speed to restore when un-pausing with Space. */
  lastSpeed: 1 | 2 | 4;
  view: View;
  leftTab: LeftTab;
  setView: (view: View) => void;
  setLeftTab: (tab: LeftTab) => void;
  sheet: Sheet;
  setSheet: (sheet: Sheet) => void;

  dispatch: (cmd: Command) => CommandResult;
  tick: (n: number) => void;
  setTool: (tool: Tool) => void;
  select: (roomId: string | null) => void;
  setHover: (cell: Cell | null) => void;
  setDrag: (drag: { start: Cell; end: Cell } | null) => void;
  setLang: (lang: Lang) => void;
  togglePause: () => void;
  newGame: () => void;
  /** Replace the running game with a loaded save (paused, UI reset). */
  loadGame: (game: GameState) => void;
  /** True once the player pressed Start or Continue; autosave waits for it. */
  started: boolean;
  setStarted: (v: boolean) => void;
  notify: (key: string, level?: Toast['level'], params?: Toast['params']) => void;
  saveOpen: boolean;
  setSaveOpen: (v: boolean) => void;
  chaptersOpen: boolean;
  setChaptersOpen: (v: boolean) => void;
  dismissToast: () => void;
}

function initialLang(): Lang {
  try {
    const v = localStorage.getItem('he.lang');
    if (v === 'th' || v === 'en') return v;
  } catch {
    /* storage unavailable */
  }
  return 'th';
}

let toastSeq = 0;

export const useGame = create<UIStore>((set, get) => ({
  game: createInitialState(),
  lang: initialLang(),
  tool: { kind: 'select' },
  selectedRoomId: null,
  hover: null,
  drag: null,
  toast: null,
  lastSpeed: 1,
  view: 'map',
  leftTab: 'build',
  setView: (view) => set({ view }),
  setLeftTab: (leftTab) => set({ leftTab }),
  sheet: null,
  setSheet: (sheet) => set({ sheet }),

  dispatch: (cmd) => {
    const { state, result } = applyCommand(get().game, cmd);
    const patch: Partial<UIStore> = { game: state };
    if (!result.ok) patch.toast = { id: ++toastSeq, key: `reason.${result.reason}`, params: result.params, level: 'error' };
    if (cmd.type === 'setSpeed' && cmd.speed !== 0) patch.lastSpeed = cmd.speed;
    // Drop selection if the selected room no longer exists
    const sel = get().selectedRoomId;
    if (sel && !state.site.rooms.some((r) => r.id === sel)) patch.selectedRoomId = null;
    set(patch);
    return result;
  },

  tick: (n) => {
    let s = get().game;
    for (let i = 0; i < n; i++) s = step(s);
    set({ game: s });
  },

  setTool: (tool) => set({ tool, drag: null }),
  select: (selectedRoomId) => set({ selectedRoomId }),
  setHover: (hover) => set({ hover }),
  setDrag: (drag) => set({ drag }),
  setLang: (lang) => {
    try {
      localStorage.setItem('he.lang', lang);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = lang;
    set({ lang });
  },
  togglePause: () => {
    const { game, lastSpeed, dispatch } = get();
    dispatch({ type: 'setSpeed', speed: game.speed === 0 ? lastSpeed : 0 });
  },
  newGame: () =>
    set({ game: createInitialState(), selectedRoomId: null, drag: null, tool: { kind: 'select' }, toast: null, view: 'map', leftTab: 'build', sheet: null }),
  dismissToast: () => set({ toast: null }),
  loadGame: (game) =>
    set({ game: { ...game, speed: 0 }, selectedRoomId: null, drag: null, tool: { kind: 'select' }, view: 'map', sheet: null, started: true, saveOpen: false }),
  started: false,
  setStarted: (started) => set({ started }),
  notify: (key, level = 'ok', params) => set({ toast: { id: ++toastSeq, key, level, ...(params ? { params } : {}) } }),
  saveOpen: false,
  setSaveOpen: (saveOpen) => set({ saveOpen }),
  chaptersOpen: false,
  setChaptersOpen: (chaptersOpen) => set({ chaptersOpen }),
}));
