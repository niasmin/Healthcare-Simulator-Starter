import { createInitialState } from '../sim/state';
import { careKpis, rosterView, buildObjectives } from '../sim/selectors';
import { admit, buildHome, hire, ok } from './helpers';

describe('roster view (role × shift)', () => {
  it('flags a day shift without an RN and missing skills as not ready', () => {
    let s = buildHome(createInitialState(2));
    let id: string;
    [s] = hire(s, 'rn'); // plans only
    [s, id] = admit(s, { group: 'bedridden', careLevel: 4 });
    s = ok(s, { type: 'createCarePlan', residentId: id });
    [s] = hire(s, 'caregiver', ['morning']);
    const morning = rosterView(s).slots.find((x) => x.slot === 'morning')!;
    expect(morning.missingRn).toBe(true);
    expect(morning.missingSkills).toEqual(expect.arrayContaining(['vital_signs', 'med_round'])); // bedridden activity is at 15:30 (afternoon)
    expect(morning.ready).toBe(false);
  });

  it('becomes ready when skill mix is covered', () => {
    let s = buildHome(createInitialState(2));
    let id: string;
    [s] = hire(s, 'rn', ['morning']);
    [s, id] = admit(s, { group: 'active_aging', careLevel: 1 });
    s = ok(s, { type: 'createCarePlan', residentId: id });
    [s] = hire(s, 'ot', ['morning']);
    const morning = rosterView(s).slots.find((x) => x.slot === 'morning')!;
    expect(morning.ready).toBe(true);
    const rnCell = rosterView(s).cells.find((c) => c.role === 'rn' && c.slot === 'morning')!;
    expect(rnCell.staff).toHaveLength(1);
    expect(rnCell.need).toBe(1);
  });

  it('occupancy and quality KPIs are computed from state', () => {
    let s = buildHome(createInitialState(2), 4);
    expect(careKpis(s).occupancy).toBe(0);
    expect(careKpis(s).quality).toBeNull();
    [s] = admit(s);
    expect(careKpis(s).occupancy).toBe(0.25);
    expect(careKpis(s).quality).not.toBeNull();
    expect(buildObjectives(s).find((g) => g.id === 'admit')!.done).toBe(true);
  });
});
