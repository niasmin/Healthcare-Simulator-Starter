import { thb } from '../domain/money';

/**
 * Bank loans (fictional game balancing): one at a time, paid back in equal daily instalments at
 * midnight over the term, with a flat interest charge spread over the same days. Paying early
 * settles the principal still owed (the interest not yet due is waived). Not offered in challenges.
 */
export const LOAN_AMOUNTS = [thb(300_000), thb(600_000), thb(1_000_000)];
export const LOAN_DAYS = 60;
export const LOAN_INTEREST_PERCENT = 6;
/** The autopilot borrows when cash covers fewer days of running costs than this. */
export const AUTO_LOAN_DAYS = 7;
/** ... enough to cover this many days (the smallest amount that does). */
export const AUTO_LOAN_TARGET_DAYS = 30;
