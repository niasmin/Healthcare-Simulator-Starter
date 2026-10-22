import { advance } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { BATH_FROM, BATH_MINUTES, BATH_SLOTS, VISIT_EVERY, VISIT_MINUTES, VISIT_SLOTS } from '../data/routine';
import { bathOf, routineAt, visitOf } from '../sim/systems/routine';
import type { Resident } from '../domain/types';
import { admitPlanned, buildHome, hire, quietEvents } from './helpers';
import { mapMarkers } from '../ui/components/GameCanvas';

describe("a resident's day", () => {
  it('visits come about one day in five, in visiting hours, the same for the same game', () => {
    let visits = 0;
    for (let day = 1; day <= 200; day++) {
      const v = visitOf(7, day, 'res-12');
      expect(visitOf(7, day, 'res-12')).toEqual(v);
      if (!v) continue;
      visits++;
      expect(VISIT_SLOTS).toContain(v[0]);
      expect(v[1] - v[0]).toBe(VISIT_MINUTES);
    }
    expect(visits).toBeGreaterThan(200 / VISIT_EVERY / 2);
    expect(visits).toBeLessThan((200 / VISIT_EVERY) * 2);
  });

  it('a morning wash slot, then the day; asleep at night and resting after lunch', () => {
    const [a, b] = bathOf(7, 3, 'res-1');
    expect(a).toBeGreaterThanOrEqual(BATH_FROM);
    expect(b).toBeLessThanOrEqual(BATH_FROM + BATH_SLOTS * BATH_MINUTES);
    const s = createInitialState(7);
    const r = { id: 'res-1' } as Resident;
    const at = (day: number, h: number) => (day - 1) * 1440 + h * 60;
    // Pick a day without a visit to check the plain routine.
    const day = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].find((d) => !visitOf(7, d, 'res-1'))!;
    expect(routineAt(s, r, at(day, 23))).toBe('sleep');
    expect(routineAt(s, r, at(day, 3))).toBe('sleep');
    expect(routineAt(s, r, at(day, 13.5))).toBe('nap');
    expect(routineAt(s, r, at(day, 10))).toBe('activity');
    expect(routineAt(s, r, (day - 1) * 1440 + bathOf(7, day, 'res-1')[0])).toBe('bath');
  });

  it('a family who find poor care say so; visits change nothing else', () => {
    let s = quietEvents(buildHome(createInitialState(3)));
    // An RN to write the care plans, but nobody on shift.
    [s] = hire(s, 'rn', []);
    for (let i = 0; i < 6; i++) [s] = admitPlanned(s);
    // No staff on shift: care falls apart within days and visiting families notice.
    const after = advance(s, 144 * 12);
    expect(after.log.some((l) => l.key === 'log.family_worried')).toBe(true);
  });

  it('on the map: relatives at the bedside during a visit, the bathroom at wash time', () => {
    let s = quietEvents(buildHome(createInitialState(3)));
    [s] = hire(s, 'rn', []);
    let id: string;
    [s, id] = admitPlanned(s, { group: 'active_aging', needs: { physical: 80, mobility: 85, mental: 80, happiness: 70, satisfaction: 70, nutrition: 80 } });
    const day = Array.from({ length: 60 }, (_, i) => i + 1).find((d) => visitOf(s.seed, d, id))!;
    const [start] = visitOf(s.seed, day, id)!;
    const during = mapMarkers({ ...s, minute: (day - 1) * 1440 + start + 30 });
    const visitor = during.find((m) => m.kind === 'visitor');
    const me = during.find((m) => m.key === id)!;
    expect(visitor).toMatchObject({ roomId: me.roomId, bed: me.bed });
    expect(mapMarkers({ ...s, minute: (day - 1) * 1440 + start + VISIT_MINUTES + 10 }).some((m) => m.kind === 'visitor')).toBe(false);
  });
});
