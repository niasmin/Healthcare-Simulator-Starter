import { applyCommand, PERF_DAYS, step } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { pctOf } from '../domain/money';
import { COURSES } from '../data/workforce';
import { EHR_TASK_PERCENT, SCHOLARSHIP_COURSE_PERCENT, SOLAR_UPKEEP_PERCENT, UPGRADES, UPGRADE_ORDER } from '../data/shop';
import { ROLE_ORDER, ROLES } from '../data/staff';
import { DICTS } from '../ui/i18n';
import { dailyResidentCosts } from '../sim/systems/billing';
import { careTick } from '../sim/systems/care';
import { dailyUpkeep } from '../sim/systems/finance';
import { ACCOUNTANT_COST_PERCENT, roomOpen } from '../sim/systems/support';
import { courseCost } from '../sim/systems/workforce';
import { rolePerformance } from '../sim/selectors';
import { dayOf } from '../sim/systems/time';
import type { CareTask, GameState, UpgradeId } from '../domain/types';
import { admit, buildHome, hire, quietEvents } from './helpers';

const home = (): GameState => {
  const s = quietEvents(buildHome(createInitialState(8)));
  return { ...s, chapter: { id: 2, startDay: 1, result: null, past: [] } };
};
const own = (s: GameState, id: UpgradeId): GameState => ({ ...s, upgrades: [...(s.upgrades ?? []), id] });
const withOffice = (s: GameState): GameState => {
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 20; x++) {
      const out = applyCommand(s, { type: 'placePrefab', prefab: 'accounting', origin: { x, y } });
      if (out.result.ok && roomOpen(out.state, 'accounting_office')) return out.state;
    }
  throw new Error('no spot for the accounting office');
};

describe('accounting office and accountant', () => {
  it('an accountant on the roster cuts daily costs by 3%', () => {
    let s = withOffice(home());
    [s] = admit(s);
    const upkeep = dailyUpkeep(s);
    const costs = dailyResidentCosts(s);
    let unrostered: GameState;
    [unrostered] = hire(s, 'accountant');
    expect(dailyUpkeep(unrostered)).toBe(upkeep);
    [s] = hire(s, 'accountant', ['morning']);
    expect(dailyUpkeep(s)).toBe(pctOf(upkeep, ACCOUNTANT_COST_PERCENT));
    expect(dailyResidentCosts(s).food).toBe(pctOf(costs.food, ACCOUNTANT_COST_PERCENT));
    expect(dailyResidentCosts(s).supplies).toBe(pctOf(costs.supplies, ACCOUNTANT_COST_PERCENT));
  });

  it('with an accountant, invoices are paid the day they are issued (and the random sequence is unchanged)', () => {
    let s = withOffice(home());
    [s] = hire(s, 'accountant', ['morning']);
    const [withAcct] = admit(s);
    const [without] = admit(home());
    const inv = withAcct.invoices[withAcct.invoices.length - 1];
    expect(inv.payDay).toBe(dayOf(withAcct.minute));
    expect(without.invoices[without.invoices.length - 1].payDay).toBeGreaterThanOrEqual(dayOf(without.minute));
    expect(withAcct.rngState).toBe(admit({ ...s, shifts: [] })[0].rngState);
  });
});

describe('new shop items', () => {
  it('are in the shop, priced, and labelled in both languages', () => {
    for (const id of ['family_lounge', 'solar_roof', 'ehr_system', 'training_scholarship'] as UpgradeId[]) {
      expect(UPGRADE_ORDER).toContain(id);
      expect(UPGRADES[id].costSatang).toBeGreaterThan(0);
      for (const lang of ['th', 'en'] as const) {
        expect(DICTS[lang][`shop.${id}`]).toBeTruthy();
        expect(DICTS[lang][`shop.${id}.desc`]).toBeTruthy();
      }
    }
  });

  it('solar roof cuts upkeep; scholarship cuts course fees', () => {
    const s = home();
    expect(dailyUpkeep(own(s, 'solar_roof'))).toBe(pctOf(dailyUpkeep(s), SOLAR_UPKEEP_PERCENT));
    expect(courseCost(s, 'care_cert')).toBe(COURSES.care_cert.costSatang);
    expect(courseCost(own(s, 'training_scholarship'), 'care_cert')).toBe(pctOf(COURSES.care_cert.costSatang, SCHOLARSHIP_COURSE_PERCENT));
  });

  it('electronic records make medication rounds quicker', () => {
    let s = home();
    let rid: string, eid: string;
    [s, rid] = admit(s);
    [s, eid] = hire(s, 'pn', ['morning']);
    const task: CareTask = { id: 'tk', residentId: rid, kind: 'med_round', skill: 'med_round', dueAt: s.minute, duration: 20, priority: 1, status: 'pending', assigneeId: null, finishAt: null };
    const base = careTick({ ...s, tasks: [task] }).tasks[0];
    const ehr = careTick(own({ ...s, tasks: [task] }, 'ehr_system')).tasks[0];
    expect(base.assigneeId).toBe(eid);
    expect(ehr.finishAt! - s.minute).toBe(Math.round(((base.finishAt! - s.minute) * EHR_TASK_PERCENT) / 100));
  });
});

describe('job descriptions and performance by profession', () => {
  it('every role has a job description in both languages', () => {
    for (const role of ROLE_ORDER) {
      expect(ROLES[role]).toBeTruthy();
      for (const lang of ['th', 'en'] as const) expect(DICTS[lang][`role.${role}.jd`]).toBeTruthy();
    }
  });

  it('counts tasks done and minutes per profession, and missed work against its owner', () => {
    let s = home();
    let rid: string, eid: string;
    [s, rid] = admit(s);
    [s, eid] = hire(s, 'caregiver', ['morning']);
    const t: CareTask = { id: 'a', residentId: rid, kind: 'personal_care', skill: 'personal_care', dueAt: s.minute, duration: 30, priority: 2, status: 'pending', assigneeId: null, finishAt: null };
    s = careTick({ ...s, tasks: [t] });
    expect(s.perfToday?.caregiver).toEqual({ done: 0, missed: 0, minutes: s.tasks[0].finishAt! - s.minute });
    s = careTick({ ...s, minute: s.tasks[0].finishAt! });
    expect(s.perfToday?.caregiver?.done).toBe(1);
    expect(s.employees.find((e) => e.id === eid)?.taskId).toBeNull();
    // A vital-signs check nobody can do is missed, and counts against the PNs.
    const v: CareTask = { id: 'b', residentId: rid, kind: 'vital_signs', skill: 'vital_signs', dueAt: s.minute - 600, duration: 10, priority: 1, status: 'pending', assigneeId: null, finishAt: null };
    s = careTick({ ...s, tasks: [v] });
    expect(s.perfToday?.pn?.missed).toBe(1);
  });

  it('closes each day into a 7-day report', () => {
    let s = home();
    [s] = admit(s);
    [s] = hire(s, 'caregiver', ['morning']);
    s = { ...s, perfToday: { caregiver: { done: 4, missed: 1, minutes: 120 } } };
    const day = dayOf(s.minute);
    while (dayOf(s.minute) === day) s = step(s);
    expect(s.perfDays).toHaveLength(1);
    expect(s.perfDays![0].caregiver!.done).toBeGreaterThanOrEqual(4);
    const report = rolePerformance(s).find((r) => r.role === 'caregiver')!;
    expect(report.people).toBe(1);
    expect(report.done).toBe(s.perfDays![0].caregiver!.done);
    expect(report.costPerTask).toBeGreaterThan(0);
    expect(report.support).toBeNull();
    for (let i = 0; i < PERF_DAYS + 2; i++) s = { ...s, perfDays: [...(s.perfDays ?? []), {}].slice(-PERF_DAYS) };
    expect(s.perfDays).toHaveLength(PERF_DAYS);
  });

  it('older saves without the report still load and play', () => {
    const s = home();
    const legacy = { ...s } as GameState;
    delete legacy.perfToday;
    delete legacy.perfDays;
    expect(rolePerformance(legacy).every((r) => r.done === 0)).toBe(true);
    expect(() => step(legacy)).not.toThrow();
  });
});
