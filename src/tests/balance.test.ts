import { advance, applyCommand, MISSED_TASK_REP, NATURAL_LEAVE_AFTER_DAYS, step, WITHDRAW_SATISFACTION } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { entryDay, totalsOf } from '../sim/selectors';
import { DAYS_PER_MONTH, monthlyFee, monthOfDay } from '../data/finance';
import { refreshCandidates } from '../sim/systems/staffing';
import { reconcile } from '../domain/rules/ledger';
import type { CareGroup, GameState, PriceLevel, ShiftSlot, StaffRole } from '../domain/types';
import { admit, admitPlanned, buildHome, hire, ok, quietEvents } from './helpers';
import { playthrough } from './bot';

/**
 * Economy guard-rails over 90 days, with a player who refills empty beds from the waiting list
 * every day. Neglect must not pay: families leave, the bed only refills while the home's
 * reputation brings enquiries, and leavers are refunded their unused days. Fictional numbers.
 */
type Staff = Array<[StaffRole, ShiftSlot[]]>;
const SKELETON: Staff = [['rn', ['morning']], ['caregiver', ['morning']], ['caregiver', ['afternoon']], ['caregiver', ['night']]];
const THIN: Staff = [['rn', ['morning']], ['pn', ['afternoon']], ['caregiver', ['morning']], ['caregiver', ['afternoon']], ['caregiver', ['night']], ['ot', ['morning']]];
const LEAN: Staff = [['rn', ['morning']], ['rn', ['afternoon']], ['caregiver', ['morning']], ['caregiver', ['afternoon']], ['caregiver', ['night']], ['pt', ['morning']], ['ot', ['morning']]];
const MID: Staff = [...LEAN, ['pn', ['morning']], ['caregiver', ['morning']]];
const groups: CareGroup[] = ['active_aging', 'stroke_rehab', 'bedridden'];

function refill(s: GameState, max: number): GameState {
  while (s.residents.length < max && s.waitlist.length) {
    const out = applyCommand(s, { type: 'admitResident', candidateId: s.waitlist[0].id });
    if (!out.result.ok) {
      s = { ...s, waitlist: s.waitlist.slice(1) };
      continue;
    }
    s = applyCommand(out.state, { type: 'createCarePlan', residentId: out.result.id! }).state;
  }
  return s;
}

function run90(staff: Staff, priceLevel: PriceLevel = 'standard', max = 10) {
  let s: GameState = { ...quietEvents(buildHome(createInitialState(41))), priceLevel };
  for (const [role, slots] of staff) [s] = hire(s, role, slots);
  for (let i = 0; i < max; i++) {
    const g = groups[i % 3];
    [s] = admitPlanned(s, { group: g, careLevel: g === 'active_aging' ? 2 : g === 'stroke_rehab' ? 3 : 4 });
  }
  for (let d = 0; d < 90; d++) s = refill(advance(s, 144), max);
  const net = (k: number) => totalsOf(s.ledger.filter((e) => e.category !== 'capital' && monthOfDay(entryDay(e)) === k)).net;
  const left = (key: string) => s.log.filter((l) => l.key === key).length;
  return { s, net, left };
}

describe('economy balance (90 days, beds refilled daily)', () => {
  const skeleton = run90(SKELETON);
  const thin = run90(THIN);
  const lean = run90(LEAN);
  const mid = run90(MID);
  const thinPremium = run90(THIN, 'premium');
  const half = run90(MID, 'standard', 6);

  it('a skeleton crew loses money from the first month and the home empties', () => {
    expect(skeleton.net(1)).toBeLessThan(0);
    expect(skeleton.s.residents.length).toBeLessThanOrEqual(2);
    expect(skeleton.left('log.withdrawn')).toBeGreaterThan(5);
    expect(skeleton.s.organization.reputation).toBe(0);
    expect(reconcile(skeleton.s).ok).toBe(true);
  });

  it('cutting care costs reputation, the waiting list dries up and beds stay empty', () => {
    for (const r of [thin, lean]) {
      expect(r.s.organization.reputation).toBeLessThan(15);
      expect(r.s.waitlist.filter((c) => !c.referralDeadline)).toHaveLength(0);
      expect(r.s.residents.length).toBeLessThan(10);
      expect(r.net(3)).toBeLessThan(mid.net(3));
    }
    expect(mid.s.residents).toHaveLength(10);
    expect(mid.s.organization.reputation).toBeGreaterThanOrEqual(50);
  });

  it('premium prices with thin care drive families away', () => {
    expect(thinPremium.left('log.withdrawn')).toBeGreaterThan(0);
    expect(thinPremium.s.residents.length).toBeLessThan(thin.s.residents.length);
  });

  it('a staffed but 60%-full home barely breaks even', () => {
    expect(half.net(2)).toBeLessThan(mid.net(2) / 10);
  });

  it('when staff are short, missed care is shared out rather than hitting the same residents', () => {
    const sats = mid.s.residents.map((r) => r.needs.satisfaction);
    expect(Math.max(...sats) - Math.min(...sats)).toBeLessThan(15);
  });

  it('a player following the roster advice wins Chapter 1 and stays full and well regarded for 90 days', () => {
    for (const seed of [41, 1]) {
      const s = playthrough(createInitialState(seed), 90).state;
      expect(s.chapter.result?.outcome, `seed ${seed}`).toBe('won');
      expect(s.residents).toHaveLength(10);
      expect(s.organization.reputation).toBeGreaterThanOrEqual(80);
      expect(s.log.some((l) => l.key === 'log.went_home')).toBe(true); // turnover happened and was refilled
      const net = (k: number) => totalsOf(s.ledger.filter((e) => e.category !== 'capital' && monthOfDay(entryDay(e)) === k)).net;
      expect(net(2)).toBeGreaterThan(0);
      expect(net(3)).toBeGreaterThan(0);
      expect(reconcile(s).ok).toBe(true);
    }
  }, 60000);
});

describe('leaving the home', () => {
  it('a resident who leaves is refunded the unused days of the month, once', () => {
    let s = quietEvents(buildHome(createInitialState(5)));
    for (const [role, slots] of MID) [s] = hire(s, role, slots);
    let id: string;
    [s, id] = admitPlanned(s, { careLevel: 3 }); // day 1: full-month admission invoice
    s = advance(s, (9 * 1440 + 12 * 60 - s.minute) / 10); // day 10, 12:00
    s = ok(s, { type: 'dischargeResident', residentId: id });
    const refunds = s.ledger.filter((e) => e.category === 'fee_refund');
    expect(refunds).toHaveLength(1);
    const unused = DAYS_PER_MONTH - 10;
    expect(refunds[0].amountSatang).toBe(-Math.floor((monthlyFee(3, 'standard') * unused) / DAYS_PER_MONTH / 100) * 100);
    expect(reconcile(s).ok).toBe(true);
  });

  it('nobody leaves in the settling-in week, and well-cared-for residents later go home now and then', () => {
    let s = quietEvents(buildHome(createInitialState(8)));
    for (const [role, slots] of MID) [s] = hire(s, role, slots);
    for (let i = 0; i < 10; i++) {
      const g = groups[i % 3];
      [s] = admitPlanned(s, { group: g, careLevel: g === 'active_aging' ? 2 : g === 'stroke_rehab' ? 3 : 4 });
    }
    const week = advance(s, 144 * (NATURAL_LEAVE_AFTER_DAYS - 1));
    expect(week.residents).toHaveLength(10);
    const later = advance(week, 144 * 80);
    expect(later.log.some((l) => l.key === 'log.went_home')).toBe(true);
    expect(later.log.some((l) => l.key === 'log.withdrawn')).toBe(false);
    expect(later.organization.reputation).toBeGreaterThanOrEqual(50); // going home costs no reputation
  });

  it('with a poor reputation, families already waiting look elsewhere', () => {
    let base = createInitialState(12);
    for (let i = 0; i < 4; i++) base = refreshCandidates({ ...base, organization: { ...base.organization, reputation: 80 } });
    const ids = base.waitlist.filter((c) => !c.referralDeadline).map((c) => c.id);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    const after = (rep: number) => refreshCandidates({ ...base, organization: { ...base.organization, reputation: rep } }).waitlist.map((c) => c.id);
    expect(after(50)).toEqual(expect.arrayContaining(ids));
    expect(after(20)).not.toContain(ids[0]);
    expect(after(20)).toContain(ids[1]);
    expect(after(10)).not.toContain(ids[1]);
  });
});

describe('consequences of poor care', () => {
  it('families of very unhappy residents move them out, freeing the bed and costing reputation', () => {
    let s = quietEvents(buildHome(createInitialState(3)));
    let id: string;
    [s, id] = admit(s, { needs: { physical: 70, mobility: 35, mental: 70, happiness: 60, satisfaction: WITHDRAW_SATISFACTION - 10, nutrition: 70 } });
    const rep0 = s.organization.reputation;
    s = advance(s, 144 * 20); // no staff, no care plan
    expect(s.residents.find((r) => r.id === id)).toBeUndefined();
    expect(s.log.some((l) => l.key === 'log.withdrawn')).toBe(true);
    expect(s.organization.reputation).toBeLessThan(rep0);
    expect(s.tasks.some((t) => t.residentId === id && t.status !== 'done' && t.status !== 'missed')).toBe(false);
    expect(s.unbilled[id]).toBeUndefined();
    expect(reconcile(s).ok).toBe(true);
  });

  it('withdrawals are deterministic for a seed', () => {
    const play = () => {
      let s = quietEvents(buildHome(createInitialState(9)));
      for (let i = 0; i < 4; i++) [s] = admit(s);
      return advance(s, 144 * 15);
    };
    expect(JSON.stringify(play())).toBe(JSON.stringify(play()));
  });

  it('missed care tasks cost reputation at day end', () => {
    let s = quietEvents(buildHome(createInitialState(4)));
    [s] = admit(s);
    s = advance(s, (1440 - 10 - s.minute) / 10); // 23:50 on day 1
    const withMissed = step({ ...s, today: { ...s.today, missed: 20 } });
    const without = step({ ...s, today: { ...s.today, missed: 0 } });
    const diff = without.organization.reputation - withMissed.organization.reputation;
    expect(diff).toBeCloseTo(20 * MISSED_TASK_REP, 1);
  });

  it('a poor reputation dries up new enquiries', () => {
    const base = createInitialState(12);
    const arrivals = (rep: number) => {
      let s: GameState = { ...base, waitlist: [], organization: { ...base.organization, reputation: rep } };
      let total = 0;
      for (let i = 0; i < 20; i++) {
        s = refreshCandidates({ ...s, waitlist: [] });
        total += s.waitlist.length;
      }
      return total;
    };
    expect(arrivals(10)).toBe(0);
    expect(arrivals(20)).toBeLessThan(arrivals(50));
    expect(arrivals(50)).toBeLessThan(arrivals(80));
  });
});
