import type { Command } from '../sim/engine';
import { applyCommand } from '../sim/engine';
import type { GameState } from '../domain/types';

/** Apply a command and assert it succeeded. */
export function ok(state: GameState, cmd: Command): GameState {
  const out = applyCommand(state, cmd);
  if (!out.result.ok) throw new Error(`Command ${cmd.type} failed: ${out.result.reason}`);
  return out.state;
}

export function run(state: GameState, cmds: Command[]): GameState {
  return cmds.reduce(ok, state);
}

/** Corridor from the entrance (9,19) straight up to y=10, plus a crossway on row 10. */
export const SPINE: Command[] = [
  { type: 'paintCorridor', rect: { x: 9, y: 10, w: 1, h: 9 } },
  { type: 'paintCorridor', rect: { x: 2, y: 10, w: 16, h: 1 } },
];
