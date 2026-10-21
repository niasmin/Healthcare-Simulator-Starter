import { advance, applyCommand } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { newGameState } from '../sim/modes';
import { LOAN_AMOUNTS, LOAN_DAYS } from '../data/loans';
import { loanInterest, loanOwed, nextInstalment } from '../sim/systems/loans';
import { autoLoan } from '../sim/autopilot';
import { dailyRunningCost, totalsOf } from '../sim/selectors';
import { reconcile } from '../domain/rules/ledger';
import { post } from '../sim/helpers';
import type { GameState } from '../domain/types';
import { buildHome, hire, ok, quietEvents } from './helpers';

const sum = (s: GameState, cat: string) => s.ledger.filter((e) => e.category === cat).reduce((a, e) => a + e.amountSatang, 0);

describe('bank loans', () => {
  it('pays the cash in now and takes equal instalments every midnight until it closes', () => {
    const s0 = createInitialState(1);
    const amount = LOAN_AMOUNTS[0];
    let s = ok(s0, { type: 'takeLoan', amount });
    expect(s.organization.cashSatang).toBe(s0.organization.cashSatang + amount);
    expect(nextInstalment(s)).toBe(Math.round((amount + loanInterest(amount)) / LOAN_DAYS));
    s = advance(s, 144 * (LOAN_DAYS + 2));
    expect(s.loan).toBeUndefined();
    // Every satang of principal came back, plus the interest, no more.
    expect(sum(s, 'loan')).toBe(0);
    expect(sum(s, 'interest')).toBe(-loanInterest(amount));
    expect(s.ledger.filter((e) => e.memo === 'ledger.loan_payment')).toHaveLength(LOAN_DAYS);
    expect(reconcile(s).ok).toBe(true);
  });

  it('counts interest as a running cost, never the principal', () => {
    let s = ok(createInitialState(1), { type: 'takeLoan', amount: LOAN_AMOUNTS[1] });
    s = advance(s, 144 * 3);
    const t = totalsOf(s.ledger);
    expect(t.byCategory.interest).toBeGreaterThan(0);
    expect(t.revenue).toBe(0);
    expect(t.opex).toBe(-sum(s, 'interest') - sum(s, 'payroll') - sum(s, 'upkeep') - sum(s, 'food') - sum(s, 'supplies'));
  });

  it('one loan at a time, fixed amounts, none in challenges; paying early waives the rest of the interest', () => {
    let s = ok(createInitialState(1), { type: 'takeLoan', amount: LOAN_AMOUNTS[0] });
    expect(applyCommand(s, { type: 'takeLoan', amount: LOAN_AMOUNTS[0] }).result).toEqual({ ok: false, reason: 'loan_active' });
    expect(applyCommand(createInitialState(1), { type: 'takeLoan', amount: 12345 }).result).toEqual({ ok: false, reason: 'invalid_choice' });
    expect(applyCommand(newGameState('starter', 'challenge', 'tight_budget'), { type: 'takeLoan', amount: LOAN_AMOUNTS[0] }).result).toEqual({ ok: false, reason: 'no_loans' });
    s = advance(s, 144 * 10);
    const owed = loanOwed(s);
    const cash = s.organization.cashSatang;
    s = ok(s, { type: 'repayLoan' });
    expect(s.loan).toBeUndefined();
    expect(s.organization.cashSatang).toBe(cash - owed);
    expect(sum(s, 'loan')).toBe(0);
    expect(-sum(s, 'interest')).toBeLessThan(loanInterest(LOAN_AMOUNTS[0]));
    expect(applyCommand(s, { type: 'repayLoan' }).result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('the next instalment is part of the running costs (runway)', () => {
    const s = quietEvents(buildHome(createInitialState(1)));
    const before = dailyRunningCost(s);
    expect(dailyRunningCost(ok(s, { type: 'takeLoan', amount: LOAN_AMOUNTS[2] }))).toBe(before + Math.round((LOAN_AMOUNTS[2] + loanInterest(LOAN_AMOUNTS[2])) / LOAN_DAYS));
  });

  it('the autopilot borrows only when cash covers under a week, the smallest loan for a month', () => {
    let s = quietEvents(buildHome(createInitialState(1)));
    for (const role of ['rn', 'caregiver', 'caregiver'] as const) [s] = hire(s, role, ['morning']);
    const cost = dailyRunningCost(s);
    const rich = autoLoan(s, applyCommand);
    expect(rich.loan).toBeUndefined();
    const poor = post(s, -(s.organization.cashSatang - cost * 5), 'event', 'test');
    const after = autoLoan(poor, applyCommand);
    expect(after.loan).toBeDefined();
    expect(after.loan!.principal).toBe(LOAN_AMOUNTS.find((x) => x >= cost * 30 - cost * 5) ?? LOAN_AMOUNTS[2]);
    expect(autoLoan(after, applyCommand)).toBe(after);
  });
});
