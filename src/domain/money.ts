import type { Satang } from './types';

export const SATANG_PER_THB = 100;

/** Convert whole baht to integer satang. Throws on non-integer input to keep money exact. */
export function thb(amount: number): Satang {
  const s = Math.round(amount * SATANG_PER_THB);
  if (!Number.isSafeInteger(s)) throw new Error(`Invalid money amount: ${amount}`);
  return s;
}

/** Integer-safe percentage of a satang amount, rounded down toward zero. */
export function pctOf(amount: Satang, percent: number): Satang {
  return Math.trunc((amount * percent) / 100);
}

export function formatTHB(amount: Satang, locale: string): string {
  const baht = amount / SATANG_PER_THB;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: Number.isInteger(baht) ? 0 : 2,
  }).format(baht);
}
