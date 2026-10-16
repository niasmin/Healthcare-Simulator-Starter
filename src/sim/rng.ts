/**
 * Seeded PRNG (mulberry32). The state is a single uint32 stored inside
 * GameState, so randomness is part of the saved, reproducible state.
 */
export interface RngStep {
  value: number; // [0, 1)
  state: number;
}

export function nextRandom(state: number): RngStep {
  let t = (state + 0x6d2b79f5) >>> 0;
  const nextState = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: nextState };
}

/** Integer in [min, max] inclusive. */
export function nextInt(state: number, min: number, max: number): { value: number; state: number } {
  const r = nextRandom(state);
  return { value: min + Math.floor(r.value * (max - min + 1)), state: r.state };
}

export function seedToState(seed: number): number {
  return seed >>> 0;
}
