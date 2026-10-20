import { applyCommand, type Command } from './engine';
import type { DecorType, GameState } from '../domain/types';

/**
 * New-game templates. "starter" opens with part of the campus already built: a corridor spine from
 * the entrance, a ready nursing station and staff room, and a few plants at the gate. Everything is
 * built with ordinary commands and paid for from the starting capital, so the economy is unchanged;
 * the player still builds the ward and therapy room (one tap each with a ready-made room).
 */
export type GameTemplate = 'starter' | 'empty';

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

export function applyTemplate(state: GameState, template: GameTemplate): GameState {
  if (template === 'empty') return state;
  let s = state;
  for (const cmd of STARTER_COMMANDS) {
    const out = applyCommand(s, cmd);
    if (out.result.ok) s = out.state;
  }
  // The template is part of the opening, not news: keep the event log clean.
  return { ...s, log: [] };
}
