import { create } from 'zustand';
import { applyCommand, step, type Command } from '../sim/engine';
import { createInitialState } from '../sim/state';
import type { Cell, CommandResult, DecorType, GameState, RoomType } from '../domain/types';
import type { Lang } from './i18n';
import { currentStep, STEPS, tutorialCtx } from './tutorial';

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
  /** Guided Chapter-1 tutorial: acknowledged info steps and whether it is switched off. */
  tutorial: TutorialState;
  ackTutorial: (stepId: string) => void;
  setTutorialOff: (off: boolean) => void;
  restartTutorial: () => void;
}

export interface TutorialState {
  ack: string[];
  off: boolean;
}

const TUTORIAL_KEY = 'he.tutorial';

function loadTutorial(): TutorialState {
  try {
    const v = JSON.parse(localStorage.getItem(TUTORIAL_KEY) ?? 'null');
    if (v && Array.isArray(v.ack) && typeof v.off === 'boolean') return { ack: v.ack.filter((x: unknown) => typeof x === 'string'), off: v.off };
  } catch {
    /* storage unavailable or corrupt */
  }
  return { ack: [], off: false };
}

/** Per-viewer convenience only: losing it just shows the tutorial again. */
function saveTutorial(t: TutorialState): TutorialState {
  try {
    localStorage.setItem(TUTORIAL_KEY, JSON.stringify(t));
  } catch {
    /* ignore */
  }
  return t;
}

/** A loaded save that is already past the build-up does not need the tutorial. */
function tutorialForLoaded(game: GameState, prev: TutorialState): TutorialState {
  const ack = new Set([...prev.ack, 'welcome']);
  const i = currentStep(tutorialCtx(game, { tool: { kind: 'select' }, selectedRoomId: null, ack }));
  const late = i < 0 || STEPS[i].id === 'play' || STEPS[i].id === 'finish';
  return { ack: [...ack], off: prev.off || late };
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
    set({
      game: createInitialState(),
      selectedRoomId: null,
      drag: null,
      tool: { kind: 'select' },
      toast: null,
      view: 'map',
      leftTab: 'build',
      sheet: null,
      tutorial: saveTutorial({ ack: [], off: false }),
    }),
  dismissToast: () => set({ toast: null }),
  loadGame: (game) =>
    set({
      game: { ...game, speed: 0 },
      selectedRoomId: null,
      drag: null,
      tool: { kind: 'select' },
      view: 'map',
      sheet: null,
      started: true,
      saveOpen: false,
      tutorial: saveTutorial(tutorialForLoaded(game, get().tutorial)),
    }),
  started: false,
  setStarted: (started) => set({ started }),
  notify: (key, level = 'ok', params) => set({ toast: { id: ++toastSeq, key, level, ...(params ? { params } : {}) } }),
  saveOpen: false,
  setSaveOpen: (saveOpen) => set({ saveOpen }),
  chaptersOpen: false,
  setChaptersOpen: (chaptersOpen) => set({ chaptersOpen }),
  tutorial: loadTutorial(),
  ackTutorial: (id) => {
    const t = get().tutorial;
    if (!t.ack.includes(id)) set({ tutorial: saveTutorial({ ...t, ack: [...t.ack, id] }) });
  },
  setTutorialOff: (off) => set({ tutorial: saveTutorial({ ...get().tutorial, off }) }),
  restartTutorial: () => set({ tutorial: saveTutorial({ ack: [], off: false }) }),
}));
