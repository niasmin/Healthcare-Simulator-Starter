import { layoutRoom } from '../domain/rules/layout';
import type { Door } from '../domain/rules/navigation';
import { PREFABS } from '../data/prefabs';
import type { Cell, Room } from '../domain/types';

const room = (type: Room['type'], w: number, h: number, equipment: Room['equipment']): Room => ({ id: 'r', type, rect: { x: 3, y: 4, w, h }, equipment, builtAt: 0 });
/** A door in the middle of each side of the room. */
function doors(r: Room): Door[] {
  const { x, y, w, h } = r.rect;
  const mx = x + Math.floor(w / 2);
  const my = y + Math.floor(h / 2);
  return [
    { inside: { x: mx, y: y + h - 1 }, outside: { x: mx, y: y + h } },
    { inside: { x: x + w - 1, y: my }, outside: { x: x + w, y: my } },
    { inside: { x: mx, y }, outside: { x: mx, y: y - 1 } },
    { inside: { x, y: my }, outside: { x: x - 1, y: my } },
    { inside: { x, y: y + h - 1 }, outside: { x, y: y + h } },
  ];
}
const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
const STEP = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] } as const;

describe('interior layout', () => {
  it('is deterministic', () => {
    const r = room('ward', 5, 6, { care_bed: 15, call_system: 1, feeding_pump: 1 });
    expect(layoutRoom(r, doors(r)[0])).toEqual(layoutRoom(r, doors(r)[0]));
  });

  it('fits every ready-made room with any door: clear doorway, one clear floor area, access to everything', () => {
    for (const p of PREFABS)
      for (const rotated of [false, true]) {
        const r = room(p.roomType, rotated ? p.h : p.w, rotated ? p.w : p.h, p.equipment);
        for (const door of doors(r)) {
          const L = layoutRoom(r, door);
          expect(L.issues, `${p.id} ${JSON.stringify(door)}`).toEqual([]);
          const floor = L.items.filter((it) => !it.mounted);
          expect(floor.some((it) => same(it.cell, door.inside))).toBe(false);
          // one item per tile
          expect(new Set(floor.map((it) => `${it.cell.x},${it.cell.y}`)).size).toBe(floor.length);
          // every installed piece appears
          const total = Object.values(p.equipment).reduce((a, b) => a + (b ?? 0), 0);
          expect(L.items.length).toBe(total);
          // clear floor is connected to the door
          const free = new Set(L.free.map((c) => `${c.x},${c.y}`));
          const seen = new Set([`${door.inside.x},${door.inside.y}`]);
          const queue = [door.inside];
          while (queue.length) {
            const c = queue.pop()!;
            for (const [dx, dy] of Object.values(STEP)) {
              const k = `${c.x + dx},${c.y + dy}`;
              if (free.has(k) && !seen.has(k)) seen.add(k), queue.push({ x: c.x + dx, y: c.y + dy });
            }
          }
          expect(seen.size).toBe(free.size);
          // every floor item has a reachable clear tile beside it
          for (const it of floor) expect(Object.values(STEP).some(([dx, dy]) => seen.has(`${it.cell.x + dx},${it.cell.y + dy}`))).toBe(true);
        }
      }
  });

  it('stands ward beds with the headboard against a wall, down both long walls', () => {
    const r = room('ward', 4, 5, { care_bed: 10, call_system: 1 });
    const L = layoutRoom(r, doors(r)[0]);
    expect(L.beds).toHaveLength(10);
    const wallBeds = L.items.filter((it) => it.id === 'care_bed').filter((it) => {
      const [dx, dy] = STEP[it.facing];
      const head = { x: it.cell.x - dx, y: it.cell.y - dy };
      return head.x < r.rect.x || head.y < r.rect.y || head.x >= r.rect.x + r.rect.w || head.y >= r.rect.y + r.rect.h;
    });
    expect(wallBeds.length).toBeGreaterThanOrEqual(9);
    expect(L.items.filter((it) => it.id === 'care_bed' && (it.cell.x === r.rect.x || it.cell.x === r.rect.x + 3)).length).toBeGreaterThanOrEqual(8);
  });

  it('hangs bedside kit on a bed and keeps desks by the door', () => {
    const w = room('ward', 3, 3, { care_bed: 4, call_system: 1, suction_unit: 1 });
    const L = layoutRoom(w, doors(w)[0]);
    for (const it of L.items.filter((i) => i.id !== 'care_bed')) {
      expect(it.mounted).toBe(true);
      expect(L.beds.some((b) => same(b, it.cell))).toBe(true);
    }
    const s = room('nursing_station', 4, 4, { nurse_desk: 1, med_cart: 2 });
    const d = doors(s)[0];
    const desk = layoutRoom(s, d).items.find((i) => i.id === 'nurse_desk')!;
    expect(Math.abs(desk.cell.x - d.inside.x) + Math.abs(desk.cell.y - d.inside.y)).toBe(1);
  });

  it('flags a room packed too full to reach everything', () => {
    const r = room('storage_room', 2, 2, { storage_rack: 4 });
    expect(layoutRoom(r, doors(r)[0]).issues.length).toBeGreaterThan(0);
  });

  it('works for a room with no door yet', () => {
    const r = room('ward', 4, 5, { care_bed: 10 });
    expect(layoutRoom(r, null).beds).toHaveLength(10);
  });
});
