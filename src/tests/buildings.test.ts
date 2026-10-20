import { applyCommand, ROOM_NAME_MAX } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { roomNumber } from '../sim/selectors';
import { staffGroups } from '../ui/components/RosterView';
import type { GameState } from '../domain/types';
import { buildHome, hire, ok, quietEvents } from './helpers';

const home = (): GameState => quietEvents(buildHome(createInitialState(8)));

describe('building names', () => {
  it('wards and villas are numbered by age by default; one-of-a-kind rooms are not', () => {
    let s = home();
    s = ok(s, { type: 'placePrefab', prefab: 'ward10', origin: { x: 13, y: 4 } });
    const wards = s.site.rooms.filter((r) => r.type === 'ward').sort((a, b) => a.builtAt - b.builtAt || (a.id < b.id ? -1 : 1));
    expect(wards.map((w) => roomNumber(s.site, w))).toEqual([1, 2]);
    expect(roomNumber(s.site, s.site.rooms.find((r) => r.type === 'nursing_station')!)).toBeNull();
  });

  it('a building can be renamed, trimmed and capped; an empty name brings the default back', () => {
    let s = home();
    const ward = s.site.rooms.find((r) => r.type === 'ward')!;
    s = ok(s, { type: 'renameRoom', roomId: ward.id, name: '  อาคารดอกแก้ว  ' });
    expect(s.site.rooms.find((r) => r.id === ward.id)!.name).toBe('อาคารดอกแก้ว');
    s = ok(s, { type: 'renameRoom', roomId: ward.id, name: 'x'.repeat(50) });
    expect(s.site.rooms.find((r) => r.id === ward.id)!.name).toHaveLength(ROOM_NAME_MAX);
    s = ok(s, { type: 'renameRoom', roomId: ward.id, name: '   ' });
    expect('name' in s.site.rooms.find((r) => r.id === ward.id)!).toBe(false);
    expect(applyCommand(s, { type: 'renameRoom', roomId: 'nope', name: 'a' }).result).toMatchObject({ ok: false, reason: 'not_found' });
  });
});

describe('staff list', () => {
  it('groups staff by profession, the costliest profession first, highest wage first within each', () => {
    let s = home();
    for (const role of ['caregiver', 'caregiver', 'caregiver', 'rn', 'pn'] as const) [s] = hire(s, role);
    const groups = staffGroups(s.employees);
    expect(groups.map((g) => g.payroll)).toEqual([...groups.map((g) => g.payroll)].sort((a, b) => b - a));
    for (const g of groups) {
      expect(new Set(g.staff.map((e) => e.role))).toEqual(new Set([g.role]));
      expect(g.staff.map((e) => e.wageMonthlySatang)).toEqual([...g.staff.map((e) => e.wageMonthlySatang)].sort((a, b) => b - a));
    }
    expect(groups.reduce((a, g) => a + g.staff.length, 0)).toBe(s.employees.length);
  });
});
