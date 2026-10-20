import {
  dayInMonth,
  DAYS_PER_MONTH,
  FOOD_PER_RESIDENT_DAY,
  monthlyFee,
  monthOfDay,
  PAYMENT_DELAY_DAYS,
  SERVICE_PRICE,
  SUPPLIES_BASE_PER_DAY,
  SUPPLIES_PER_LEVEL_DAY,
  PROGRAMME_SUPPLIES_PER_DAY,
} from '../../data/finance';
import type { GameState, Invoice, InvoiceLine, Resident, RevenueStream } from '../../domain/types';
import { allocId, log, post, randInt } from '../helpers';
import { hasUpgrade, KITCHEN_FOOD_PERCENT, LAUNDRY_SUPPLIES_PERCENT } from '../../data/shop';
import { pctOf } from '../../domain/money';
import { dayOf } from './time';

/**
 * Billing rules (fictional):
 * - Room & care is billed IN ADVANCE: pro-rated on admission, then in full on day 1 of each month.
 * - Therapy, activity and special services are counted as delivered and billed on the next invoice.
 * - A family pays each invoice exactly once, 1–5 days after issue; revenue is booked on payment
 *   (cash basis) with the invoice id as the ledger reference, so revenue can never be double-counted.
 */

type Services = GameState['unbilled'][string];
const EMPTY: Services = { therapy: 0, activity: 0, special: 0 };

function serviceLines(sv: Services): InvoiceLine[] {
  const out: InvoiceLine[] = [];
  for (const stream of ['therapy', 'activity', 'special'] as const) {
    const qty = sv[stream];
    if (qty > 0) out.push({ stream, memo: `invoice.line.${stream}`, qty, unitSatang: SERVICE_PRICE[stream], amountSatang: qty * SERVICE_PRICE[stream] });
  }
  return out;
}

export function hasInvoice(state: GameState, clientId: string, month: number, kind: Invoice['kind']): boolean {
  return state.invoices.some((i) => i.clientId === clientId && i.month === month && i.kind === kind);
}

export function issue(state: GameState, resident: Pick<Resident, 'id' | 'name'>, kind: Invoice['kind'], month: number, lines: InvoiceLine[]): GameState {
  if (!lines.length) return state;
  // Invariant: at most one admission/monthly invoice per resident per month.
  if ((kind === 'admission' || kind === 'monthly') && (hasInvoice(state, resident.id, month, 'admission') || hasInvoice(state, resident.id, month, 'monthly'))) return state;
  let s = state;
  let id: string, delay: number;
  [s, id] = allocId(s, 'inv');
  [s, delay] = randInt(s, PAYMENT_DELAY_DAYS[0], PAYMENT_DELAY_DAYS[1]);
  const inv: Invoice = {
    id,
    kind,
    clientId: resident.id,
    clientName: resident.name,
    month,
    lines,
    totalSatang: lines.reduce((a, l) => a + l.amountSatang, 0),
    status: 'issued',
    issuedAt: s.minute,
    payDay: dayOf(s.minute) + delay,
    paidAt: null,
  };
  return { ...s, invoices: [...s.invoices, inv] };
}

/**
 * A resident has left: hand back prepaid room & care for the days of this month they won't use.
 * Booked once per invoice as negative revenue ('fee_refund'), whether or not that invoice is paid yet.
 */
export function refundUnusedDays(state: GameState, resident: Resident): GameState {
  const lastDay = dayOf(Math.max(0, state.minute - 1));
  const unused = DAYS_PER_MONTH - dayInMonth(lastDay);
  if (unused <= 0) return state;
  const month = monthOfDay(lastDay);
  const inv = state.invoices.find((i) => i.clientId === resident.id && i.month === month && (i.kind === 'admission' || i.kind === 'monthly'));
  const line = inv?.lines.find((l) => l.stream === 'room_care');
  if (!inv || !line) return state;
  const ref = `${inv.id}:refund`;
  if (state.ledger.some((e) => e.ref === ref)) return state;
  const covered = inv.kind === 'admission' ? line.qty : DAYS_PER_MONTH;
  const days = Math.min(unused, covered);
  const amount = Math.floor((line.amountSatang * days) / covered / 100) * 100;
  if (amount <= 0) return state;
  return post(state, -amount, 'fee_refund', 'ledger.fee_refund', { ref, memoParams: { name: resident.name.th, nameEn: resident.name.en, days } });
}

/** Pro-rated room & care for the rest of the admission month. */
export function billAdmission(state: GameState, resident: Resident): GameState {
  const day = dayOf(state.minute);
  const days = DAYS_PER_MONTH - dayInMonth(day) + 1;
  const fee = monthlyFee(resident.careLevel, state.priceLevel, resident.group, resident.premium);
  const amount = Math.floor((fee * days) / DAYS_PER_MONTH / 100) * 100;
  const line: InvoiceLine = { stream: 'room_care', memo: 'invoice.line.room_care_days', memoParams: { days, level: resident.careLevel }, qty: days, unitSatang: Math.floor(fee / DAYS_PER_MONTH), amountSatang: amount };
  return issue(state, resident, 'admission', monthOfDay(day), [line]);
}

/** Day 1 of each month: full room & care for the month plus last month's services. */
export function billMonth(state: GameState, month: number): GameState {
  let s = state;
  for (const r of state.residents) {
    const fee = monthlyFee(r.careLevel, s.priceLevel, r.group, r.premium);
    const lines: InvoiceLine[] = [
      { stream: 'room_care', memo: 'invoice.line.room_care', memoParams: { level: r.careLevel }, qty: 1, unitSatang: fee, amountSatang: fee },
      ...serviceLines(s.unbilled[r.id] ?? EMPTY),
    ];
    const before = s.invoices.length;
    s = issue(s, r, 'monthly', month, lines);
    if (s.invoices.length > before) s = { ...s, unbilled: { ...s.unbilled, [r.id]: { ...EMPTY } } };
  }
  return s;
}

/** On discharge: bill outstanding services once. */
export function billFinal(state: GameState, resident: Resident): GameState {
  const lines = serviceLines(state.unbilled[resident.id] ?? EMPTY);
  let s = issue(state, resident, 'final', monthOfDay(dayOf(state.minute)), lines);
  const { [resident.id]: _drop, ...rest } = s.unbilled;
  void _drop;
  s = { ...s, unbilled: rest };
  return s;
}

export function recordService(state: GameState, residentId: string, stream: Exclude<RevenueStream, 'room_care' | 'homecare' | 'workforce' | 'hospital' | 'network'>, n = 1): GameState {
  const cur = state.unbilled[residentId] ?? EMPTY;
  return { ...state, unbilled: { ...state.unbilled, [residentId]: { ...cur, [stream]: cur[stream] + n } } };
}

/** Families pay due invoices; each payment books revenue exactly once. */
export function collectPayments(state: GameState, closingDay: number): GameState {
  let s = state;
  const due = s.invoices.filter((i) => i.status === 'issued' && i.payDay <= closingDay);
  for (const inv of due) {
    s = { ...s, invoices: s.invoices.map((x) => (x.id === inv.id ? { ...x, status: 'paid' as const, paidAt: s.minute } : x)) };
    s = post(s, inv.totalSatang, 'revenue', inv.kind === 'b2b' ? 'ledger.revenue_b2b' : 'ledger.revenue', { ref: inv.id, memoParams: { name: inv.clientName.th, nameEn: inv.clientName.en, month: inv.month } });
  }
  if (due.length) s = log(s, 'good', 'log.payments', { n: due.length });
  return s;
}

/** Daily food and care supplies, one ledger entry each per day. */
/** Today's food and supplies for every resident. */
export function dailyResidentCosts(state: GameState): { food: number; supplies: number } {
  const food = FOOD_PER_RESIDENT_DAY * state.residents.length;
  const supplies = state.residents.reduce((a, r) => a + SUPPLIES_BASE_PER_DAY + SUPPLIES_PER_LEVEL_DAY * r.careLevel + (PROGRAMME_SUPPLIES_PER_DAY[r.group] ?? 0), 0);
  // Shop upgrades: a central kitchen and an in-house laundry and supply room cut these costs.
  return {
    food: hasUpgrade(state, 'central_kitchen') ? pctOf(food, KITCHEN_FOOD_PERCENT) : food,
    supplies: hasUpgrade(state, 'laundry_supply') ? pctOf(supplies, LAUNDRY_SUPPLIES_PERCENT) : supplies,
  };
}

export function chargeDailyResidentCosts(state: GameState): GameState {
  if (!state.residents.length) return state;
  const day = dayOf(state.minute - 1);
  const { food, supplies } = dailyResidentCosts(state);
  let s = post(state, -food, 'food', 'ledger.food', { ref: `food-day-${day}`, memoParams: { day, n: state.residents.length } });
  s = post(s, -supplies, 'supplies', 'ledger.supplies', { ref: `supplies-day-${day}`, memoParams: { day } });
  return s;
}
