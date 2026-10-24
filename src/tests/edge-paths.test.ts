import { createInitialState } from '../sim/state';
import { reachableCorridor, findDoor } from '../domain/rules/navigation';
import { roomStatus } from '../domain/rules/rooms';
import { cellIndex } from '../domain/grid';
import { connectPath } from '../sim/systems/move';
import { ok } from './helpers';

describe('paths that meet the street at the fence', () => {
  it('a corridor touching the lot edge counts as connected, even cut off from the main entrance', () => {
    let s = createInitialState(1);
    // A path from the north fence down to row 3, nowhere near the entrance at the south.
    s = ok(s, { type: 'paintCorridor', rect: { x: 4, y: 0, w: 1, h: 4 } });
    const reach = reachableCorridor(s.site);
    expect(reach[cellIndex(4, 3, s.site.width)]).toBe(1);
    // A room beside it works.
    s = ok(s, { type: 'placeRoom', roomType: 'staff_room', rect: { x: 5, y: 1, w: 2, h: 2 } });
    const room = s.site.rooms[s.site.rooms.length - 1];
    s = ok(s, { type: 'installEquipment', roomId: room.id, equipment: 'lockers' });
    expect(findDoor(s.site.rooms.find((r) => r.id === room.id)!, s.site)).not.toBeNull();
    expect(roomStatus(s.site.rooms.find((r) => r.id === room.id)!, s.site).operational).toBe(true);
  });

  it('an island of path inside the lot is still not connected', () => {
    let s = createInitialState(1);
    s = ok(s, { type: 'paintCorridor', rect: { x: 6, y: 6, w: 3, h: 1 } });
    expect(reachableCorridor(s.site)[cellIndex(7, 6, s.site.width)]).toBe(0);
  });

  it('one tap can pave from the nearest fence instead of the far entrance', () => {
    let s = createInitialState(1);
    s = ok(s, { type: 'placeRoom', roomType: 'staff_room', rect: { x: 3, y: 2, w: 2, h: 2 } });
    const room = s.site.rooms[s.site.rooms.length - 1];
    // Two tiles from the north fence (rows 0-1), far from the entrance at the south.
    expect(connectPath(s, room.id)!.length).toBeLessThanOrEqual(2);
  });
});
