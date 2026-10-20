import { create } from 'zustand';
import { applyCommand, step, type Command } from '../sim/engine';
import { createInitialState } from '../sim/state';
import type { Cell, ChallengeId, CommandResult, DecorType, GameMode, GameState, RoomType } from '../domain/types';
import type { Lang } from './i18n';
import type { GameTemplate } from '../sim/templates';
import type { AwayReport } from './away';
import { newGameState } from '../sim/modes';
import { autopilotOn, runAway, ticksFor } from './away';
import { MS_PER_TICK_1X } from './constants';

export type Tool = { kind: 'select' } | { kind: 'corridor' } | { kind: 'bulldoze' } | { kind: 'room'; roomType: RoomType } | { kind: 'decor'; decor: DecorType } | { kind: 'prefab'; prefab: string; rotated: boolean };

export type View = 'map' | 'residents' | 'roster' | 'finance';
export type LeftTab = 'build' | 'hire' | 'admit' | 'network';
/** Phone layout: which bottom sheet is open. */
export type Sheet = 'tools' | 'info' | 'menu' | 'missions' | 'events' | 'report' | null;

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
  newGame: (template?: GameTemplate, mode?: GameMode, challenge?: ChallengeId) => void;
  /** Replace the running game with a loaded save (paused, UI reset). */
  loadGame: (game: GameState, savedAt?: number) => void;
  /** True once the player pressed Start or Continue; autosave waits for it. */
  started: boolean;
  setStarted: (v: boolean) => void;
  notify: (key: string, level?: Toast['level'], params?: Toast['params']) => void;
  saveOpen: boolean;
  setSaveOpen: (v: boolean) => void;
  chaptersOpen: boolean;
  shopOpen: boolean;
  setShopOpen: (v: boolean) => void;
  /** The town window (city map or ranking tab), or null. */
  cityOpen: 'city' | 'ranking' | null;
  setCityOpen: (v: 'city' | 'ranking' | null) => void;
  setChaptersOpen: (v: boolean) => void;
  /** Room name pills on the map (toggled by the layers button). */
  showLabels: boolean;
  setShowLabels: (v: boolean) => void;
  /** Exterior view: rooms drawn as finished buildings with roofs, seen from above. */
  exterior: boolean;
  setExterior: (v: boolean) => void;
  autoOpen: boolean;
  setAutoOpen: (v: boolean) => void;
  accountOpen: boolean;
  setAccountOpen: (v: boolean) => void;
  /** Keep an autopilot game running while the player is away (remembered per browser). */
  awayPlay: boolean;
  setAwayPlay: (v: boolean) => void;
  /** Alerts for low cash and decisions waiting (remembered per browser). */
  alertsOn: boolean;
  setAlertsOn: (v: boolean) => void;
  /** Sound effects (default on), the music loop (default off), anonymous play statistics (default on). */
  sfxOn: boolean;
  setSfxOn: (v: boolean) => void;
  musicOn: boolean;
  setMusicOn: (v: boolean) => void;
  statsOn: boolean;
  setStatsOn: (v: boolean) => void;
  /** Catch-up in progress, in ticks. */
  away: { done: number; total: number } | null;
  awayReport: AwayReport | null;
  setAwayReport: (r: AwayReport | null) => void;
  /** The tutorial card is folded into a small chip (remembered per browser). */
  tutorialHidden: boolean;
  setTutorialHidden: (v: boolean) => void;
  /** The chapter verdict card was closed for the current game. */
  chapterSeen: boolean;
  setChapterSeen: (v: boolean) => void;
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

/** A per-browser on/off preference (on unless stored otherwise, or the given default). */
function initialFlag(key: string, fallback = true): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v !== '0';
  } catch {
    return fallback;
  }
}

/** Store a preference and hand the value back. */
function remember(key: string, v: boolean): boolean {
  try {
    localStorage.setItem(key, v ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
  return v;
}

function initialAwayPlay(): boolean {
  return initialFlag('he.away');
}

function initialTutorialHidden(): boolean {
  try {
    return localStorage.getItem('he.tut.hidden') === '1';
  } catch {
    return false;
  }
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
  showLabels: true,
  setShowLabels: (showLabels) => set({ showLabels }),
  exterior: false,
  setExterior: (exterior) => set({ exterior }),
  autoOpen: false,
  setAutoOpen: (autoOpen) => set({ autoOpen }),
  accountOpen: false,
  setAccountOpen: (accountOpen) => set({ accountOpen }),
  awayPlay: initialAwayPlay(),
  setAwayPlay: (awayPlay) => {
    try {
      localStorage.setItem('he.away', awayPlay ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
    set({ awayPlay });
  },
  sfxOn: initialFlag('he.sfx'),
  setSfxOn: (sfxOn) => set({ sfxOn: remember('he.sfx', sfxOn) }),
  musicOn: initialFlag('he.music', false),
  setMusicOn: (musicOn) => set({ musicOn: remember('he.music', musicOn) }),
  statsOn: initialFlag('he.stats'),
  setStatsOn: (statsOn) => set({ statsOn: remember('he.stats', statsOn) }),
  alertsOn: initialFlag('he.alerts'),
  setAlertsOn: (alertsOn) => {
    try {
      localStorage.setItem('he.alerts', alertsOn ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
    set({ alertsOn });
  },
  away: null,
  awayReport: null,
  setAwayReport: (awayReport) => set({ awayReport }),

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
  newGame: (template = 'starter', mode = 'campaign', challenge) =>
    set({ game: newGameState(template, mode, challenge), selectedRoomId: null, drag: null, tool: { kind: 'select' }, toast: null, view: 'map', leftTab: 'build', sheet: null, chapterSeen: false }),
  dismissToast: () => set({ toast: null }),
  loadGame: (game, savedAt) => {
    // An autopilot game saved while running carries on from where it was, catching up the time away.
    const resume = savedAt !== undefined && get().awayPlay && game.speed > 0 && autopilotOn(game);
    set({ game: resume ? game : { ...game, speed: 0 }, selectedRoomId: null, drag: null, tool: { kind: 'select' }, view: 'map', sheet: null, started: true, saveOpen: false, chapterSeen: !!game.chapter.result });
    if (resume) runAway(ticksFor(Date.now() - savedAt, game.speed, MS_PER_TICK_1X));
  },
  started: false,
  setStarted: (started) => set({ started }),
  notify: (key, level = 'ok', params) => set({ toast: { id: ++toastSeq, key, level, ...(params ? { params } : {}) } }),
  saveOpen: false,
  setSaveOpen: (saveOpen) => set({ saveOpen }),
  chaptersOpen: false,
  shopOpen: false,
  setShopOpen: (shopOpen) => set({ shopOpen }),
  cityOpen: null,
  setCityOpen: (cityOpen) => set({ cityOpen }),
  setChaptersOpen: (chaptersOpen) => set({ chaptersOpen }),
  tutorialHidden: initialTutorialHidden(),
  setTutorialHidden: (tutorialHidden) => {
    try {
      localStorage.setItem('he.tut.hidden', tutorialHidden ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
    set({ tutorialHidden });
  },
  chapterSeen: false,
  setChapterSeen: (chapterSeen) => set({ chapterSeen }),
}));
