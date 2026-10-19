import { advance, MISSED_TASK_REP, step, WITHDRAW_SATISFACTION } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { entryDay, totalsOf } from '../sim/selectors';
import { monthOfDay } from '../data/finance';
import { refreshCandidates } from '../sim/systems/staffing';
import { reconcile } from '../domain/rules/ledger';
import type { CareGroup, GameState, PriceLevel, ShiftSlot, StaffRole } from '../domain/types';
import { admit, admitPlanned, buildHome, hire, quietEvents } from './helpers';

/**
 * Economy guard-rails: over 90 days, good care must pay better than neglect,
 * and a half-empty home must not be profitable. Numbers are fictional balancing.
 */
type Staff = Array<[StaffRole, ShiftSlot[]]>;
const LEAN: Staff = [['rn', ['morning']], ['rn', ['afternoon']], ['caregiver', ['morning']], ['caregiver', ['afternoon']], ['caregiver', ['night']], ['pt', ['morning']], ['ot', ['morning']]];
const MID: Staff = [...LEAN, ['pn', ['morning']], ['caregiver', ['morning']]];
const GOOD: Staff = [...MID, ['caregiver', ['afternoon']], ['ot', ['afternoon']]];
const groups: CareGroup[] = ['active_aging', 'stroke_rehab', 'bedridden'];

function run90(staff: Staff, residents: number, priceLevel: PriceLevel = 'standard') {
  let s: GameState = { ...quietEvents(buildHome(createInitialState(41))), priceLevel };
  for (const [role, slots] of staff) [s] = hire(s, role, slots);
  for (let i = 0; i < residents; i++) {
    const g = groups[i % 3];
    [s] = admitPlanned(s, { group: g, careLevel: g === 'active_aging' ? 2 : g === 'stroke_rehab' ? 3 : 4 });
  }
  s = advance(s, 144 * 90);
  const net = (k: number) => totalsOf(s.ledger.filter((e) => e.category !== 'capital' && monthOfDay(entryDay(e)) === k)).net;
  return { s, net };
}

describe('economy balance (90 days)', () => {
  const good = run90(GOOD, 10);
  const goodPremium = run90(GOOD, 10, 'premium');
  const mid = run90(MID, 10);
  const midPremium = run90(MID, 10, 'premium');
  const lean = run90(LEAN, 10);
  const half = run90(GOOD, 6);

  it('a full, well-staffed home is profitable, stays full and is well regarded', () => {
    expect(good.net(2)).toBeGreaterThan(0);
    expect(good.net(3)).toBeGreaterThan(0);
    expect(good.s.residents).toHaveLength(10);
    expect(good.s.organization.reputation).toBeGreaterThanOrEqual(80);
    expect(reconcile(good.s).ok).toBe(true);
  });

  it('good care at premium prices is the best strategy', () => {
    expect(goodPremium.s.residents).toHaveLength(10);
    expect(goodPremium.s.organization.reputation).toBeGreaterThanOrEqual(80);
    for (const other of [good, mid, midPremium, lean]) expect(goodPremium.net(3)).toBeGreaterThan(other.net(3));
  });

  it('premium prices with mediocre care drive families away', () => {
    expect(midPremium.s.residents.length).toBeLessThan(10);
    expect(midPremium.net(3)).toBeLessThan(mid.net(3));
  });

  it('understaffing loses residents and runs at a loss', () => {
    expect(lean.s.residents.length).toBeLessThan(10);
    expect(lean.net(3)).toBeLessThan(0);
    expect(lean.s.organization.reputation).toBeLessThan(good.s.organization.reputation);
  });

  it('a well-staffed but half-empty home runs at a loss', () => {
    expect(half.net(2)).toBeLessThan(0);
  });

  it('when staff are short, missed care is shared out rather than hitting the same residents', () => {
    const sats = mid.s.residents.map((r) => r.needs.satisfaction);
    expect(Math.max(...sats) - Math.min(...sats)).toBeLessThan(15);
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
