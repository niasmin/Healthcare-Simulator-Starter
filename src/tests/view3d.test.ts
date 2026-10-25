import { daylight, facingRotation, peoplePlan, roomsPlan, STOREY } from '../render3d/plan';
import { mapMarkers } from '../ui/components/GameCanvas';
import { createInitialState } from '../sim/state';
import { applyTemplate } from '../sim/templates';
import { applyCommand } from '../sim/engine';
import type { GameState } from '../domain/types';

function readyHome(): GameState {
  let s = applyTemplate(createInitialState(4), 'ready');
  for (const c of s.waitlist.slice(0, 6)) {
    const out = applyCommand(s, { type: 'admitResident', candidateId: c.id });
    if (out.result.ok) s = out.state;
  }
  return s;
}

describe('the 3D view plan', () => {
  it('turns models to face each way', () => {
    expect(facingRotation('s')).toBe(0);
    expect(facingRotation('e')).toBeCloseTo(Math.PI / 2);
    expect(facingRotation('n')).toBeCloseTo(Math.PI);
    expect(facingRotation('w')).toBeCloseTo(-Math.PI / 2);
  });

  it('gives every room its height, roof and equipment layout', () => {
    const s = readyHome();
    const rooms = roomsPlan(s);
    expect(rooms).toHaveLength(s.site.rooms.length);
    const ward = rooms.find((r) => r.type === 'ward')!;
    expect(ward.floors).toBe(2); // the 10-bed ward is 4 × 5
    expect(ward.height).toBeCloseTo(STOREY * 1.75);
    expect(ward.pitched).toBe(true);
    expect(ward.beds).toHaveLength(10);
    expect(rooms.find((r) => r.type === 'nursing_station')!.pitched).toBe(false);
  });

  it('lays residents in their beds inside, and puts everyone somewhere on the lot', () => {
    const s = readyHome();
    const rooms = roomsPlan(s);
    const people = peoplePlan(s, rooms, mapMarkers(s));
    expect(people.length).toBeGreaterThan(0);
    const inBed = people.filter((p) => p.lying);
    expect(inBed.length).toBeGreaterThan(0);
    const ward = rooms.find((r) => r.type === 'ward')!;
    for (const p of inBed) {
      expect(p.inside).toBe(true);
      expect(ward.beds.some((b) => b.x + 0.5 === p.x && b.y + 0.5 === p.z)).toBe(true);
    }
    for (const p of people) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.z).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(s.site.width);
      expect(p.z).toBeLessThanOrEqual(s.site.height);
    }
  });

  it('is dark at night and bright at noon', () => {
    expect(daylight(0).day).toBe(0);
    expect(daylight(12 * 60).day).toBe(1);
    expect(daylight(12 * 60).elevation).toBeGreaterThan(daylight(8 * 60).elevation);
  });
});
