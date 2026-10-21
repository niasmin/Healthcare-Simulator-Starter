import { LOAN_AMOUNTS, LOAN_DAYS, LOAN_INTEREST_PERCENT } from '../../data/loans';
import { pctOf } from '../../domain/money';
import type { GameState, Loan, ReasonCode } from '../../domain/types';
import { log, post } from '../helpers';
import { dayOf } from './time';

/** What instalment `k` (1..days) brings the paid totals to: equal shares, the last one squares it. */
const shareTo = (total: number, k: number, days: number) => Math.round((total * Math.min(k, days)) / days);

export function loanBlocker(state: GameState, amount: number): ReasonCode | null {
  if (state.mode === 'challenge') return 'no_loans';
  if (state.loan) return 'loan_active';
  if (!LOAN_AMOUNTS.includes(amount)) return 'invalid_choice';
  return null;
}

export function loanInterest(amount: number): number {
  return pctOf(amount, LOAN_INTEREST_PERCENT);
}

/** Take a loan (check loanBlocker first): the cash comes in now, instalments start tonight. */
export function takeLoan(state: GameState, amount: number): GameState {
  const loan: Loan = { principal: amount, interest: loanInterest(amount), paidPrincipal: 0, paidInterest: 0, days: LOAN_DAYS, startDay: dayOf(state.minute) };
  let s: GameState = { ...state, loan };
  s = post(s, amount, 'loan', 'ledger.loan_in', { memoParams: { days: LOAN_DAYS } });
  return log(s, 'info', 'log.loan_taken', { days: LOAN_DAYS });
}

/** Tonight's instalment (principal, interest) for the closing day. */
export function instalment(loan: Loan, closingDay: number): { principal: number; interest: number } {
  const k = closingDay - loan.startDay + 1;
  return { principal: shareTo(loan.principal, k, loan.days) - loan.paidPrincipal, interest: shareTo(loan.interest, k, loan.days) - loan.paidInterest };
}

/** Midnight: pay the day's instalment (even if it takes cash below zero); the last one closes the loan. */
export function loanDayEnd(state: GameState, closingDay: number): GameState {
  const loan = state.loan;
  if (!loan) return state;
  const { principal, interest } = instalment(loan, closingDay);
  let s = state;
  if (principal > 0) s = post(s, -principal, 'loan', 'ledger.loan_payment', { memoParams: { day: closingDay } });
  if (interest > 0) s = post(s, -interest, 'interest', 'ledger.loan_interest', { memoParams: { day: closingDay } });
  const next = { ...loan, paidPrincipal: loan.paidPrincipal + principal, paidInterest: loan.paidInterest + interest };
  if (next.paidPrincipal >= next.principal) return log({ ...s, loan: undefined }, 'good', 'log.loan_done');
  return { ...s, loan: next };
}

/** Principal still owed (what early repayment costs). */
export function loanOwed(state: GameState): number {
  return state.loan ? state.loan.principal - state.loan.paidPrincipal : 0;
}

/** The instalment the next midnight will take (for forecasts and runway). */
export function nextInstalment(state: GameState): number {
  if (!state.loan) return 0;
  const i = instalment(state.loan, dayOf(state.minute));
  return i.principal + i.interest;
}

export function repayBlocker(state: GameState): ReasonCode | null {
  if (!state.loan) return 'not_found';
  if (state.organization.cashSatang < loanOwed(state)) return 'insufficient_funds';
  return null;
}

/** Pay off the rest of the principal now; the interest not yet due is waived. */
export function repayLoan(state: GameState): GameState {
  const owed = loanOwed(state);
  let s = owed > 0 ? post(state, -owed, 'loan', 'ledger.loan_repay') : state;
  s = { ...s, loan: undefined };
  return log(s, 'good', 'log.loan_done');
}
