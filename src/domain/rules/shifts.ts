import { MAX_DAILY_SHIFT_MINUTES, SHIFT_SLOTS } from '../../data/staff';
import type { GameState, Shift, ShiftSlot } from '../types';

const DAY = 1440;

/** Split a daily recurring [start, end) window into non-wrapping segments within 0..1440. */
export function segments(start: number, end: number): Array<[number, number]> {
  if (start === end) return [];
  return end > start ? [[start, end]] : [[start, DAY], [0, end]];
}

export function shiftMinutes(start: number, end: number): number {
  return segments(start, end).reduce((a, [s, e]) => a + (e - s), 0);
}

/** True when two recurring daily windows share any minute (touching ends do not overlap). */
export function windowsOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  for (const [s1, e1] of segments(a.start, a.end)) for (const [s2, e2] of segments(b.start, b.end)) if (s1 < e2 && s2 < e1) return true;
  return false;
}

export function minuteOfDay(minute: number): number {
  return ((minute % DAY) + DAY) % DAY;
}

export function inWindow(minute: number, start: number, end: number): boolean {
  const m = minuteOfDay(minute);
  return segments(start, end).some(([s, e]) => m >= s && m < e);
}

export function shiftsOf(state: GameState, employeeId: string): Shift[] {
  return state.shifts.filter((s) => s.employeeId === employeeId);
}

export function isOnShift(state: GameState, employeeId: string, minute: number): boolean {
  return state.shifts.some((s) => s.employeeId === employeeId && inWindow(minute, s.start, s.end));
}

export function slotAt(minute: number): ShiftSlot {
  const m = minuteOfDay(minute);
  for (const slot of ['morning', 'afternoon', 'night'] as ShiftSlot[]) {
    const w = SHIFT_SLOTS[slot];
    if (inWindow(m, w.start, w.end)) return slot;
  }
  return 'night';
}

export type ShiftCheck = { ok: true } | { ok: false; reason: 'not_found' | 'shift_overlap' | 'shift_too_long' };

/** GDD rule: no overlapping shifts for an employee. Also caps daily hours (max double shift). */
export function validateShift(state: GameState, employeeId: string, window: { start: number; end: number }): ShiftCheck {
  if (!state.employees.some((e) => e.id === employeeId)) return { ok: false, reason: 'not_found' };
  const existing = shiftsOf(state, employeeId);
  if (existing.some((s) => windowsOverlap(s, window))) return { ok: false, reason: 'shift_overlap' };
  const total = existing.reduce((a, s) => a + shiftMinutes(s.start, s.end), 0) + shiftMinutes(window.start, window.end);
  if (total > MAX_DAILY_SHIFT_MINUTES) return { ok: false, reason: 'shift_too_long' };
  return { ok: true };
}
