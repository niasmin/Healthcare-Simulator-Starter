import { applyCommand, type Command } from './engine';
import type { DecorType, GameState } from '../domain/types';

/**
 * New-game templates. "starter" opens with part of the campus already built: a corridor spine from
 * the entrance, a ready nursing station and staff room, and a few plants at the gate. Everything is
 * built with ordinary commands and paid for from the starting capital, so the economy is unchanged;
 * the player still builds the ward and therapy room (one tap each with a ready-made room).
 * "ready" (for first-time players) also builds a furnished 10-bed ward and a therapy room, so the
 * first steps are hiring, admitting and pressing play.
 */
export type GameTemplate = 'ready' | 'starter' | 'empty';

const DECOR: Array<[DecorType, number, number]> = [
  ['flowers', 8, 18],
  ['flowers', 10, 18],
  ['planter', 8, 17],
  ['tree', 11, 17],
];

export const STARTER_COMMANDS: Command[] = [
  { type: 'paintCorridor', rect: { x: 9, y: 10, w: 1, h: 9 } },
  { type: 'paintCorridor', rect: { x: 2, y: 10, w: 16, h: 1 } },
  { type: 'placePrefab', prefab: 'station', origin: { x: 10, y: 7 } },
  { type: 'placePrefab', prefab: 'staff', origin: { x: 12, y: 11 } },
  ...DECOR.map(([decor, x, y]) => ({ type: 'placeDecor' as const, decor, cell: { x, y } })),
];

export const READY_COMMANDS: Command[] = [
  ...STARTER_COMMANDS,
  { type: 'placePrefab', prefab: 'ward10', origin: { x: 2, y: 11 } },
  { type: 'placePrefab', prefab: 'therapy', origin: { x: 5, y: 7 } },
];

export function applyTemplate(state: GameState, template: GameTemplate): GameState {
  if (template === 'empty') return state;
  let s = state;
  for (const cmd of template === 'ready' ? READY_COMMANDS : STARTER_COMMANDS) {
    const out = applyCommand(s, cmd);
    if (out.result.ok) s = out.state;
  }
  // The template is part of the opening, not news: keep the event log clean.
  return { ...s, log: [] };
}
