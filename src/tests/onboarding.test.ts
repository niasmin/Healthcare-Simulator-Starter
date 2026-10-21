import { advance, applyCommand } from '../sim/engine';
import { newGameState } from '../sim/modes';
import { buildObjectives } from '../sim/selectors';
import { applyTemplate } from '../sim/templates';
import { createInitialState } from '../sim/state';
import { roomOpen } from '../sim/systems/support';
import { coachLine, tourPointer, type TourCtx } from '../ui/tour';
import { reconcile } from '../domain/rules/ledger';
import type { GameState } from '../domain/types';

const goalOf = (s: GameState) => buildObjectives(s).find((g) => !g.done) ?? null;
const coach = (s: GameState, ui: Omit<TourCtx, 'game'>) => {
  const goal = goalOf(s);
  const ctx = { game: s, ...ui };
  return coachLine(goal, ctx, tourPointer(goal, ctx));
};

describe('first-game onboarding', () => {
  it('"ready to open" builds the ward and therapy room too, from the starting capital', () => {
    const s = applyTemplate(createInitialState(1), 'ready');
    for (const type of ['ward', 'nursing_station', 'therapy', 'staff_room'] as const) expect(roomOpen(s, type), type).toBe(true);
    expect(s.organization.cashSatang).toBeGreaterThan(0);
    expect(reconcile(s).ok).toBe(true);
    // The building steps are done: the guide starts at hiring.
    expect(goalOf(s)?.id).toBe('hire_rn');
    expect(s.log).toEqual([]);
  });

  it('a "ready" game run by the assistant wins chapter 1', () => {
    let s = applyCommand({ ...newGameState('ready', 'campaign', undefined, 1), speed: 1 }, { type: 'setAuto', settings: { events: true, admit: true, carePlan: true, staff: true, build: true } }).state;
    s = advance(s, 144 * 31);
    expect(s.chapter.result?.outcome ?? s.chapter.past.find((p) => p.chapter === 1)?.outcome).toBe('won');
  }, 60_000);

  it('the coach bubble says what to tap next, following the build steps', () => {
    const s = applyTemplate(createInitialState(1), 'starter');
    const sel = { tool: { kind: 'select' }, selectedRoomId: null };
    expect(goalOf(s)?.id).toBe('ward');
    expect(coach(s, sel)).toBe('coach.build_ward');
    expect(coach(s, { tool: { kind: 'room', roomType: 'ward' }, selectedRoomId: null })).toBe('coach.place');
    const ready = applyTemplate(createInitialState(1), 'ready');
    expect(coach(ready, sel)).toBe('coach.hire_rn');
    expect(coach(createInitialState(1), sel)).toBe('coach.corridor');
    expect(coach(createInitialState(1), { tool: { kind: 'corridor' }, selectedRoomId: null })).toBe('coach.corridor_draw');
  });
});
