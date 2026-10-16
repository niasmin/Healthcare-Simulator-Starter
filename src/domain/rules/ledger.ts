import type { GameState, Satang } from '../types';

export function ledgerBalance(state: GameState): Satang {
  let sum = 0;
  for (const e of state.ledger) {
    if (!Number.isSafeInteger(e.amountSatang)) throw new Error(`Non-integer ledger amount ${e.id}`);
    sum += e.amountSatang;
  }
  return sum;
}

/** Cash invariant: cached balance must equal the sum of the immutable ledger. */
export function reconcile(state: GameState): { ok: boolean; ledger: Satang; cash: Satang } {
  const ledger = ledgerBalance(state);
  return { ok: ledger === state.organization.cashSatang, ledger, cash: state.organization.cashSatang };
}
