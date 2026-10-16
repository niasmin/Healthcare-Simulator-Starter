import { nextInt } from './rng';
import type { GameState, LedgerCategory, LedgerEntry, LogItem, LogLevel, Satang } from '../domain/types';
import { LOG_LIMIT } from './constants';

export function allocId(state: GameState, prefix: string): [GameState, string] {
  const id = `${prefix}-${state.nextId}`;
  return [{ ...state, nextId: state.nextId + 1 }, id];
}

/** Append an immutable ledger entry and update the cached cash balance atomically. */
export function post(
  state: GameState,
  amountSatang: Satang,
  category: LedgerCategory,
  memo: string,
  extra: { ref?: string; memoParams?: LedgerEntry['memoParams'] } = {},
): GameState {
  if (!Number.isSafeInteger(amountSatang)) throw new Error(`Ledger amount must be integer satang, got ${amountSatang}`);
  const [s, id] = allocId(state, 'le');
  const entry: LedgerEntry = Object.freeze({
    id,
    organizationId: s.organization.id,
    amountSatang,
    category,
    at: s.minute,
    memo,
    ...(extra.ref !== undefined ? { ref: extra.ref } : {}),
    ...(extra.memoParams !== undefined ? { memoParams: extra.memoParams } : {}),
  });
  return {
    ...s,
    ledger: [...s.ledger, entry],
    organization: { ...s.organization, cashSatang: s.organization.cashSatang + amountSatang },
  };
}

export function log(state: GameState, level: LogLevel, key: string, params?: LogItem['params']): GameState {
  const [s, id] = allocId(state, 'log');
  const item: LogItem = { id, at: s.minute, level, key, ...(params ? { params } : {}) };
  const next = [...s.log, item];
  return { ...s, log: next.length > LOG_LIMIT ? next.slice(next.length - LOG_LIMIT) : next };
}

/** Draw an integer in [min, max] from the state's seeded PRNG. */
export function randInt(state: GameState, min: number, max: number): [GameState, number] {
  const r = nextInt(state.rngState, min, max);
  return [{ ...state, rngState: r.state }, r.value];
}

export function clamp(v: number, lo = 0, hi = 100): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Round to 2 decimals so floating noise never accumulates differently across runs. */
export function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
