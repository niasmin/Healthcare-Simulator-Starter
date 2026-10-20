import { useEffect } from 'react';
import type { GameState } from '../domain/types';
import { useGame } from './store';

/**
 * Sound: small synthesized effects and an optional soft music loop, all made with WebAudio at run
 * time (no audio files to download). Effects follow what happens in the game (building, hiring,
 * admissions, payments, events, chapter verdicts, refused actions). Preferences are per browser:
 * effects on by default, music off. Nothing plays until the player has touched the page (browsers
 * require a gesture), and nothing plays while time away is being caught up.
 */

export type Sfx = 'click' | 'build' | 'coin' | 'chime' | 'error' | 'alert' | 'win' | 'lose';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const lastPlayed = new Map<Sfx, number>();

function audio(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Browsers start audio suspended until a gesture: resume on the first tap or key. */
function unlockOnGesture(): () => void {
  const unlock = () => void audio()?.resume().catch(() => undefined);
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, slideTo?: number): void {
  const a = audio();
  if (!a || !master) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const RECIPES: Record<Sfx, () => void> = {
  click: () => tone(880, 0, 0.05, 'triangle', 0.08),
  build: () => {
    tone(196, 0, 0.12, 'square', 0.06, 140);
    tone(294, 0.09, 0.16, 'triangle', 0.08);
  },
  coin: () => {
    tone(1319, 0, 0.08, 'square', 0.04);
    tone(1760, 0.06, 0.16, 'square', 0.04);
  },
  chime: () => {
    tone(659, 0, 0.18, 'sine', 0.12);
    tone(988, 0.08, 0.26, 'sine', 0.1);
  },
  error: () => tone(220, 0, 0.18, 'sawtooth', 0.05, 150),
  alert: () => {
    tone(784, 0, 0.2, 'triangle', 0.1);
    tone(587, 0.18, 0.28, 'triangle', 0.1);
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.32, 'triangle', 0.11)),
  lose: () => [440, 392, 330].forEach((f, i) => tone(f, i * 0.16, 0.34, 'sine', 0.1)),
};

/** Play an effect if effects are on (each kind at most every 180 ms, so bursts don't pile up). */
export function playSfx(name: Sfx): void {
  const st = useGame.getState();
  if (!st.sfxOn || st.away) return;
  const a = audio();
  if (!a || a.state !== 'running') return;
  const now = performance.now();
  if (now - (lastPlayed.get(name) ?? 0) < 180) return;
  lastPlayed.set(name, now);
  RECIPES[name]();
}

// ---------------------------------------------------------------------------
// Music: a slow pentatonic arpeggio over a soft pad, scheduled a bar at a time.
// ---------------------------------------------------------------------------

const CHORDS = [
  [261.6, 329.6, 392.0],
  [220.0, 261.6, 329.6],
  [174.6, 220.0, 261.6],
  [196.0, 246.9, 293.7],
];
const MELODY = [523.3, 587.3, 659.3, 784.0, 880.0];
let musicTimer: number | null = null;
let bar = 0;

function playBar(): void {
  const a = audio();
  if (!a || a.state !== 'running') return;
  const chord = CHORDS[bar % CHORDS.length];
  for (const f of chord) tone(f, 0, 3.6, 'sine', 0.025);
  for (let i = 0; i < 4; i++) tone(MELODY[(bar * 3 + i * 2) % MELODY.length], i * 0.9, 0.8, 'triangle', 0.02);
  bar++;
}

function setMusic(on: boolean): void {
  if (on && musicTimer === null) {
    playBar();
    musicTimer = window.setInterval(playBar, 3600);
  } else if (!on && musicTimer !== null) {
    window.clearInterval(musicTimer);
    musicTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Following the game
// ---------------------------------------------------------------------------

function soundFor(prev: GameState, next: GameState): Sfx | null {
  if (next.chapter.result && !prev.chapter.result) return next.chapter.result.outcome === 'won' ? 'win' : 'lose';
  if (next.chapter.id !== prev.chapter.id) return 'win';
  if (next.events.active && !prev.events.active) return 'alert';
  if (next.ledger.length > prev.ledger.length) {
    const added = next.ledger.slice(prev.ledger.length);
    if (added.some((e) => e.category === 'construction' || e.category === 'equipment')) return 'build';
    if (added.some((e) => e.category === 'revenue')) return 'coin';
  }
  if (next.employees.length > prev.employees.length || next.residents.length > prev.residents.length) return 'chime';
  return null;
}

export function useSound(): void {
  useEffect(() => {
    const off = unlockOnGesture();
    const unsub = useGame.subscribe((s, prev) => {
      if (s.musicOn !== prev.musicOn) setMusic(s.musicOn);
      // A refused action shows a red toast: a short low buzz.
      if (s.toast && s.toast !== prev.toast && s.toast.level === 'error' && s.toast.key.startsWith('reason.')) playSfx('error');
      if (s.game === prev.game || !s.started) return;
      const sfx = soundFor(prev.game, s.game);
      if (sfx) playSfx(sfx);
    });
    // Music starts with the first gesture if it was left on.
    const startMusic = () => useGame.getState().musicOn && setMusic(true);
    window.addEventListener('pointerdown', startMusic, { once: true });
    return () => {
      off();
      unsub();
      setMusic(false);
      window.removeEventListener('pointerdown', startMusic);
    };
  }, []);
}
