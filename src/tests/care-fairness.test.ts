import { createInitialState } from '../sim/state';
import { playthrough } from './bot';

/**
 * Regression: when staff are briefly short, equal-priority tasks used to be ordered by
 * task id, so the same last-admitted resident lost out every time and drifted far below
 * everyone else. Ties now go to the least satisfied resident first.
 */
describe('care triage fairness', () => {
  it.each([1, 3])('no resident is left far behind the rest (seed %i)', (seed) => {
    const s = playthrough(createInitialState(seed), 31).state;
    const sats = s.residents.map((r) => r.needs.satisfaction);
    expect(sats.length).toBe(10);
    expect(Math.min(...sats)).toBeGreaterThan(75);
  });
});
