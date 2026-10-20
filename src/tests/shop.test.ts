import { applyCommand, step } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { reconcile } from '../domain/rules/ledger';
import { TASK_KINDS } from '../data/patients';
import { pctOf } from '../domain/money';
import { KITCHEN_FOOD_PERCENT, LAUNDRY_SUPPLIES_PERCENT, SMART_CALL_EXTRA_GRACE, UPGRADES, UPGRADE_ORDER } from '../data/shop';
import { dailyResidentCosts } from '../sim/systems/billing';
import { refreshCandidates, staffMoraleDaily } from '../sim/systems/staffing';
import { careTick } from '../sim/systems/care';
import { newGameState } from '../sim/modes';
import type { GameState, UpgradeId } from '../domain/types';
import { admit, buildHome, hire, ok, quietEvents } from './helpers';

const home = (chapter = 3): GameState => {
  const s = quietEvents(buildHome(createInitialState(8)));
  return { ...s, chapter: { id: chapter, startDay: 1, result: null, past: [] } };
};
const own = (s: GameState, id: UpgradeId): GameState => ({ ...s, upgrades: [...(s.upgrades ?? []), id] });

describe('shop upgrades', () => {
  it('are bought once, for their price, from their chapter (all at once in the sandbox)', () => {
    let s = home(1);
    expect(applyCommand(s, { type: 'buyUpgrade', upgrade: 'smart_call' }).result).toMatchObject({ ok: false, reason: 'chapter_locked' });
    const cash = s.organization.cashSatang;
    s = ok(s, { type: 'buyUpgrade', upgrade: 'online_marketing' });
    expect(s.organization.cashSatang).toBe(cash - UPGRADES.online_marketing.costSatang);
    expect(s.upgrades).toEqual(['online_marketing']);
    expect(applyCommand(s, { type: 'buyUpgrade', upgrade: 'online_marketing' }).result).toMatchObject({ reason: 'already_owned' });
    expect(reconcile(s).ok).toBe(true);
    let sb = newGameState('starter', 'sandbox');
    for (const id of UPGRADE_ORDER) sb = ok(sb, { type: 'buyUpgrade', upgrade: id });
    expect(sb.upgrades).toHaveLength(UPGRADE_ORDER.length);
  });

  it('central kitchen and laundry cut daily food and supplies', () => {
    let s = home();
    [s] = admit(s);
    [s] = admit(s);
    const base = dailyResidentCosts(s);
    expect(dailyResidentCosts(own(s, 'central_kitchen')).food).toBe(pctOf(base.food, KITCHEN_FOOD_PERCENT));
    expect(dailyResidentCosts(own(s, 'laundry_supply')).supplies).toBe(pctOf(base.supplies, LAUNDRY_SUPPLIES_PERCENT));
  });

  it('staff welfare lifts morale every day', () => {
    let s = home();
    [s] = hire(s, 'caregiver', ['morning']);
    s = { ...s, employees: s.employees.map((e) => ({ ...e, morale: 60 })) };
    expect(staffMoraleDaily(own(s, 'staff_welfare')).employees[0].morale).toBe(staffMoraleDaily(s).employees[0].morale + 1);
  });

  it('online marketing brings one more enquiry a day', () => {
    const s = { ...home(), waitlist: [] };
    const plain = refreshCandidates(s).waitlist.length;
    expect(refreshCandidates(own(s, 'online_marketing')).waitlist.length).toBe(plain + 1);
  });

  it('the family app lifts reputation while residents are content', () => {
    let s = home();
    [s] = admit(s, { needs: { physical: 80, mobility: 80, mental: 80, happiness: 80, satisfaction: 70, nutrition: 80 } });
    const run = (g: GameState) => {
      while (g.minute % 1440 !== 0) g = step(g);
      return g.organization.reputation;
    };
    expect(run(own(s, 'family_app'))).toBeGreaterThan(run(s));
  });

  it('the smart call system gives routine care 30 more minutes before it counts as missed', () => {
    let s = home();
    [s] = admit(s);
    // An RN with no shifts writes the plan; nobody is on duty, so the task just waits.
    [s] = hire(s, 'rn');
    s = ok(s, { type: 'createCarePlan', residentId: s.residents[0].id });
    const t = s.tasks.find((x) => x.status === 'pending')!;
    const late = { ...s, minute: t.dueAt + TASK_KINDS[t.kind].grace + 10 };
    expect(careTick(late).tasks.find((x) => x.id === t.id)!.status).toBe('missed');
    expect(careTick(own(late, 'smart_call')).tasks.find((x) => x.id === t.id)!.status).toBe('pending');
    expect(SMART_CALL_EXTRA_GRACE).toBe(30);
  });
});
