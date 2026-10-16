import { advance, applyCommand } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { fireEvent } from '../sim/systems/events';
import { reconcile } from '../domain/rules/ledger';
import { REFERRAL_COUNT } from '../data/events';
import { TICKS_PER_DAY } from '../sim/constants';
import type { GameState } from '../domain/types';
import { admit, buildHome, hire, ok } from './helpers';

function base(): GameState {
  let s = buildHome(createInitialState(4));
  [s] = admit(s, { careLevel: 3 });
  return s;
}

describe('events', () => {
  it('auto-pauses on arrival and restores the speed after a choice', () => {
    let s = ok(base(), { type: 'setSpeed', speed: 2 });
    s = fireEvent(s, 'family_visit');
    expect(s.speed).toBe(0);
    expect(s.events.active?.residentId).toBe(s.residents[0].id);
    s = ok(s, { type: 'resolveEvent', choiceId: 'standard' });
    expect(s.speed).toBe(2);
    expect(s.events.active).toBeNull();
    expect(applyCommand(s, { type: 'resolveEvent', choiceId: 'standard' }).result).toMatchObject({ reason: 'no_event' });
  });

  it('charges a choice cost exactly once and applies its effects', () => {
    let s = fireEvent(base(), 'family_visit');
    const before = s.residents[0].needs.happiness;
    s = ok(s, { type: 'resolveEvent', choiceId: 'special' });
    expect(s.ledger.filter((e) => e.category === 'event')).toHaveLength(1);
    expect(s.residents[0].needs.happiness).toBeGreaterThan(before);
    expect(s.unbilled[s.residents[0].id].special).toBe(1);
    expect(reconcile(s).ok).toBe(true);
  });

  it('urgent assessment needs an RN on duty and delays their queue by an hour', () => {
    let s = fireEvent(base(), 'resident_change');
    expect(applyCommand(s, { type: 'resolveEvent', choiceId: 'assess' }).result).toMatchObject({ reason: 'needs_rn_on_shift' });
    expect(applyCommand(s, { type: 'resolveEvent', choiceId: 'nope' }).result).toMatchObject({ reason: 'invalid_choice' });
    let rn: string;
    [s, rn] = hire(s, 'rn', ['morning']);
    s = ok(s, { type: 'resolveEvent', choiceId: 'assess' });
    expect(s.employees.find((e) => e.id === rn)!.busyUntil).toBe(s.minute + 60);
  });

  it('keeps at least 3 quiet days between events', () => {
    let s = base();
    [s] = hire(s, 'rn', ['morning']);
    [s] = hire(s, 'pn', ['afternoon']);
    s = advance(s, TICKS_PER_DAY * 60);
    const days = s.events.history.map((h) => h.day);
    for (let i = 1; i < days.length; i++) expect(days[i] - days[i - 1]).toBeGreaterThanOrEqual(3);
  });

  it('nurse resignation: raise keeps them at +10% wage, accept lets both go', () => {
    let s = base();
    let a: string, b: string;
    [s, a] = hire(s, 'rn', ['morning']);
    [s, b] = hire(s, 'pn', ['afternoon']);
    [s] = hire(s, 'caregiver', ['morning']);
    const wage = s.employees.find((e) => e.id === a)!.wageMonthlySatang;
    const raised = ok(fireEvent(s, 'staff_resign'), { type: 'resolveEvent', choiceId: 'raise' });
    expect(raised.employees.find((e) => e.id === a)!.wageMonthlySatang).toBe(Math.floor((wage * 1.1) / 100) * 100);
    const gone = ok(fireEvent(s, 'staff_resign'), { type: 'resolveEvent', choiceId: 'accept' });
    expect(gone.employees.map((e) => e.id)).not.toContain(a);
    expect(gone.employees.map((e) => e.id)).not.toContain(b);
    expect(gone.shifts.some((x) => x.employeeId === a || x.employeeId === b)).toBe(false);
  });

  it('referral contract adds candidates with a deadline; missing it costs reputation', () => {
    let s = fireEvent(base(), 'referral');
    s = ok(s, { type: 'resolveEvent', choiceId: 'accept_all' });
    const refs = s.waitlist.filter((c) => c.referralDeadline);
    expect(refs).toHaveLength(REFERRAL_COUNT);
    expect(refs.every((c) => c.group === 'stroke_rehab')).toBe(true);
    const rep = s.organization.reputation;
    s = advance(s, TICKS_PER_DAY * 11);
    expect(s.waitlist.filter((c) => c.referralDeadline)).toHaveLength(0);
    expect(s.organization.reputation).toBeLessThan(rep - 5);
  });

  it('an unanswered event resolves with its default after 12 hours', () => {
    let s = fireEvent(base(), 'family_visit');
    s = advance(s, 72);
    expect(s.events.active).toBeNull();
    expect(s.events.history.at(-1)).toMatchObject({ defId: 'family_visit', choiceId: 'postpone', auto: true });
  });

  it('events fire deterministically from the seed and respect cooldowns', () => {
    const run = () => {
      let s = base();
      [s] = hire(s, 'rn', ['morning']);
      [s] = hire(s, 'pn', ['afternoon']);
      return advance(s, TICKS_PER_DAY * 30);
    };
    const a = run();
    const b = run();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.events.history.length).toBeGreaterThan(0);
    const days: Record<string, number[]> = {};
    for (const h of a.events.history) (days[h.defId] ??= []).push(h.day);
    for (const list of Object.values(days)) for (let i = 1; i < list.length; i++) expect(list[i] - list[i - 1]).toBeGreaterThanOrEqual(5);
  });
});
