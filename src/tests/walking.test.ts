import { advance } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { corridorPath, corridorSteps, findDoor } from '../domain/rules/navigation';
import { cellIndex } from '../domain/grid';
import { buildHome, quietEvents } from './helpers';
import { admitPlanned, hire } from './helpers';

describe('walking along the corridors', () => {
  it('finds the corridor route between two doors, one tile at a time', () => {
    const s = buildHome(createInitialState(1));
    const ward = findDoor(s.site.rooms.find((r) => r.type === 'ward')!, s.site)!;
    const therapy = findDoor(s.site.rooms.find((r) => r.type === 'therapy')!, s.site)!;
    const path = corridorPath(s.site, ward.outside, therapy.outside)!;
    expect(path[0]).toEqual(ward.outside);
    expect(path[path.length - 1]).toEqual(therapy.outside);
    for (let i = 1; i < path.length; i++) expect(Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y)).toBe(1);
    for (const c of path) expect(s.site.corridor[cellIndex(c.x, c.y, s.site.width)]).toBe(1);
    expect(corridorSteps(s.site, ward.outside)[cellIndex(therapy.outside.x, therapy.outside.y, s.site.width)]).toBe(path.length - 1);
    // Off the corridor there is no route.
    expect(corridorPath(s.site, { x: 0, y: 0 }, therapy.outside)).toBeNull();
  });

  it('staff remember where they last worked, and walks add up into whole ticks', () => {
    let s = quietEvents(buildHome(createInitialState(1)));
    [s] = hire(s, 'rn', ['morning', 'afternoon']);
    [s] = hire(s, 'caregiver', ['morning', 'afternoon']);
    [s] = hire(s, 'pt', ['morning', 'afternoon']);
    for (let i = 0; i < 4; i++) [s] = admitPlanned(s, { group: 'stroke_rehab' });
    s = advance(s, 144);
    const rooms = new Set(s.site.rooms.map((r) => r.id));
    const placed = s.employees.filter((e) => e.atRoomId);
    expect(placed.length).toBeGreaterThan(0);
    for (const e of placed) expect(rooms.has(e.atRoomId!)).toBe(true);
    // Therapy sessions put the therapist in the therapy room.
    const therapy = s.site.rooms.find((r) => r.type === 'therapy')!.id;
    expect(s.employees.find((e) => e.role === 'pt')!.atRoomId).toBe(therapy);
    for (const e of s.employees) expect((e.walked ?? 0) < 10).toBe(true);
  });
});
