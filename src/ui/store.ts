import { create } from 'zustand';
import { applyCommand, step, type Command } from '../sim/engine';
import { createInitialState } from '../sim/state';
import type { Cell, CommandResult, GameState, RoomType } from '../domain/types';
import type { Lang } from './i18n';

export type Tool = { kind: 'select' } | { kind: 'corridor' } | { kind: 'bulldoze' } | { kind: 'room'; roomType: RoomType };

export type View = 'map' | 'residents' | 'roster';
export type LeftTab = 'build' | 'hire' | 'admit';

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

  dispatch: (cmd: Command) => CommandResult;
  tick: (n: number) => void;
  setTool: (tool: Tool) => void;
  select: (roomId: string | null) => void;
  setHover: (cell: Cell | null) => void;
  setDrag: (drag: { start: Cell; end: Cell } | null) => void;
  setLang: (lang: Lang) => void;
  togglePause: () => void;
  newGame: () => void;
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
    set({ game: createInitialState(), selectedRoomId: null, drag: null, tool: { kind: 'select' }, toast: null, view: 'map', leftTab: 'build' }),
  dismissToast: () => set({ toast: null }),
}));
