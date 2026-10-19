import { advance, applyCommand, step } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { reconcile } from '../domain/rules/ledger';
import { monthlyFee } from '../data/finance';
import { billMonth } from '../sim/systems/billing';
import type { GameState } from '../domain/types';
import { admit, admitPlanned, buildHome, hire, ok, quietEvents } from './helpers';

function home(seed = 5): GameState {
  let s = quietEvents(buildHome(createInitialState(seed)));
  [s] = hire(s, 'rn', ['morning']);
  [s] = hire(s, 'rn', ['afternoon']);
  [s] = hire(s, 'pn', ['morning']);
  [s] = hire(s, 'caregiver', ['morning']);
  [s] = hire(s, 'caregiver', ['afternoon']);
  [s] = hire(s, 'caregiver', ['night']);
  [s] = hire(s, 'pt', ['morning']);
  [s] = hire(s, 'ot', ['morning']);
  [s] = hire(s, 'ot', ['afternoon']);
  return s;
}

/** Advance until the clock shows `day` at `hh:00`. */
function until(s: GameState, day: number, hh = 7): GameState {
  const target = (day - 1) * 1440 + hh * 60;
  return advance(s, Math.max(0, (target - s.minute) / 10));
}

describe('invoices', () => {
  it('bills a pro-rated admission invoice once (full month when admitted on day 1)', () => {
    let s = home();
    let id: string;
    [s, id] = admit(s, { careLevel: 3 });
    const inv = s.invoices.filter((i) => i.clientId === id);
    expect(inv).toHaveLength(1);
    expect(inv[0].kind).toBe('admission');
    expect(inv[0].totalSatang).toBe(monthlyFee(3, 'standard'));
    // Day 16 admission → 15 of 30 days
    s = until(s, 16, 10);
    let id2: string;
    [s, id2] = admit(s, { careLevel: 2 });
    const inv2 = s.invoices.find((i) => i.clientId === id2)!;
    expect(inv2.totalSatang).toBe(Math.floor((monthlyFee(2, 'standard') * 15) / 30 / 100) * 100);
  });

  it('creates each monthly invoice exactly once', () => {
    let s = home();
    for (let i = 0; i < 3; i++) [s] = admitPlanned(s);
    s = until(s, 31, 1); // just after the month-2 billing run
    const m2 = s.invoices.filter((i) => i.month === 2 && i.kind === 'monthly');
    expect(m2).toHaveLength(3);
    expect(new Set(m2.map((i) => i.clientId)).size).toBe(3);
    // Re-running billing for the same month is a no-op
    expect(billMonth(s, 2).invoices).toHaveLength(s.invoices.length);
    s = until(s, 45);
    expect(s.invoices.filter((i) => i.month === 2 && i.kind === 'monthly')).toHaveLength(3);
  });

  it('a family pays once; revenue equals paid invoices and the ledger reconciles', () => {
    let s = home();
    for (let i = 0; i < 4; i++) [s] = admit(s);
    s = until(s, 40);
    const paid = s.invoices.filter((i) => i.status === 'paid');
    expect(paid.length).toBeGreaterThan(0);
    const revenue = s.ledger.filter((e) => e.category === 'revenue');
    expect(revenue).toHaveLength(paid.length);
    expect(new Set(revenue.map((e) => e.ref)).size).toBe(revenue.length); // never double-counted
    expect(revenue.reduce((a, e) => a + e.amountSatang, 0)).toBe(paid.reduce((a, i) => a + i.totalSatang, 0));
    for (const i of s.invoices.filter((x) => x.status === 'issued')) expect(i.payDay).toBeGreaterThan(39);
    expect(reconcile(s).ok).toBe(true);
  });

  it("bills last month's therapy sessions on the next invoice and resets the counter", () => {
    let s = home();
    let id: string;
    [s, id] = admit(s, { group: 'stroke_rehab', careLevel: 3 });
    s = ok(s, { type: 'createCarePlan', residentId: id });
    s = until(s, 30, 23); // late on the last day of month 1
    s = advance(s, 5); // 23:50
    const sessions = s.unbilled[id].therapy;
    expect(sessions).toBeGreaterThan(20);
    s = step(s); // midnight: month 2 billing
    const inv = s.invoices.find((i) => i.clientId === id && i.month === 2)!;
    expect(inv.lines.find((l) => l.stream === 'therapy')!.qty).toBe(sessions);
    expect(s.unbilled[id].therapy).toBe(0);
  });

  it('charges food and supplies once per day per home', () => {
    let s = home();
    for (let i = 0; i < 2; i++) [s] = admitPlanned(s);
    s = until(s, 11);
    const food = s.ledger.filter((e) => e.category === 'food');
    expect(food).toHaveLength(10);
    expect(new Set(food.map((e) => e.ref)).size).toBe(10);
    expect(s.ledger.filter((e) => e.category === 'supplies')).toHaveLength(10);
  });

  it('price level changes future invoices only', () => {
    let s = home();
    let a: string, b: string;
    [s, a] = admit(s, { careLevel: 1 });
    s = ok(s, { type: 'setPriceLevel', level: 'premium' });
    [s, b] = admit(s, { careLevel: 1 });
    expect(s.invoices.find((i) => i.clientId === a)!.totalSatang).toBe(monthlyFee(1, 'standard'));
    expect(s.invoices.find((i) => i.clientId === b)!.totalSatang).toBe(monthlyFee(1, 'premium'));
    expect(monthlyFee(1, 'premium')).toBeGreaterThan(monthlyFee(1, 'standard'));
  });

  it('a full 10-bed home runs 30 days with positive operating cash flow', () => {
    let s = home(9);
    const groups = ['active_aging', 'active_aging', 'active_aging', 'active_aging', 'stroke_rehab', 'stroke_rehab', 'stroke_rehab', 'bedridden', 'bedridden', 'bedridden'] as const;
    for (const g of groups) {
      let id: string;
      [s, id] = admit(s, { group: g, careLevel: g === 'active_aging' ? 2 : g === 'stroke_rehab' ? 3 : 4 });
      s = ok(s, { type: 'createCarePlan', residentId: id });
    }
    const start = s.organization.cashSatang;
    s = until(s, 31, 7);
    expect(s.organization.cashSatang).toBeGreaterThan(start);
    expect(s.history.every((d) => d.cash > 0)).toBe(true);
    expect(reconcile(s).ok).toBe(true);
  });
});

describe('commands', () => {
  it('rejects an unknown price level', () => {
    expect(applyCommand(createInitialState(1), { type: 'setPriceLevel', level: 'luxury' as never }).result.ok).toBe(false);
  });
});

describe('finance view', () => {
  it('totals match the ledger and the revenue mix matches paid invoices', async () => {
    const { financeView } = await import('../sim/selectors');
    let s = home(12);
    for (let i = 0; i < 3; i++) {
      let id: string;
      [s, id] = admit(s, { group: 'stroke_rehab', careLevel: 3 });
      s = ok(s, { type: 'createCarePlan', residentId: id });
    }
    s = until(s, 38);
    const all = financeView(s, 'all');
    const revenue = s.ledger.filter((e) => e.category === 'revenue').reduce((a, e) => a + e.amountSatang, 0);
    expect(all.current.revenue).toBe(revenue);
    expect(all.mix.reduce((a, m) => a + m.amount, 0)).toBe(revenue);
    expect(all.mix.find((m) => m.stream === 'therapy')!.amount).toBeGreaterThan(0);
    const month = financeView(s, 'month');
    expect(month.month).toBe(2);
    expect(month.previous).not.toBeNull();
    expect(month.series).toHaveLength(8);
    expect(all.series.reduce((a, p) => a + p.revenue, 0)).toBe(revenue);
  });
});
