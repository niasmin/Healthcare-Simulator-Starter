import type { GameState, ScheduledEvent } from '../../domain/types';
import { MINUTES_PER_DAY, MINUTES_PER_TICK } from '../constants';

export function dayOf(minute: number): number {
  return Math.floor(minute / MINUTES_PER_DAY) + 1;
}

export function clockOf(minute: number): { hh: number; mm: number } {
  const m = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return { hh: Math.floor(m / 60), mm: m % 60 };
}

export function formatClock(minute: number): string {
  const { hh, mm } = clockOf(minute);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function compareEvents(a: ScheduledEvent, b: ScheduledEvent): number {
  return a.at - b.at || a.seq - b.seq;
}

export function schedule(state: GameState, at: number, kind: ScheduledEvent['kind']): GameState {
  const ev: ScheduledEvent = { at, seq: state.nextSeq, kind };
  const queue = [...state.queue, ev].sort(compareEvents);
  return { ...state, queue, nextSeq: state.nextSeq + 1 };
}

/** Advance the clock by one tick and pop every event that is now due, in deterministic order. */
export function advanceClock(state: GameState): { state: GameState; due: ScheduledEvent[] } {
  const minute = state.minute + MINUTES_PER_TICK;
  const due: ScheduledEvent[] = [];
  const rest: ScheduledEvent[] = [];
  for (const ev of state.queue) (ev.at <= minute ? due : rest).push(ev);
  due.sort(compareEvents);
  return { state: { ...state, minute, queue: rest }, due };
}
