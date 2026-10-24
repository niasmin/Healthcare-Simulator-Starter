import { townLayout, townLights } from '../render/WorldBackdrop';
import { createInitialState } from '../sim/state';

describe('the town layout', () => {
  const site = createInitialState(8).site;
  const t = townLayout(site, 32);
  const inLot = (x: number, y: number) => x >= 0 && y >= 0 && x < 32 && y < site.height;

  it('is repeatable', () => {
    expect(townLayout(site, 32)).toEqual(expect.objectContaining({ buildings: t.buildings, props: t.props, crossings: t.crossings }));
  });

  it('keeps buildings off the roads, the lot and each other, with a small temple among the houses', () => {
    const cells = new Set<string>();
    for (const b of t.buildings)
      for (let y = b.y; y < b.y + 2; y++)
        for (let x = b.x; x < b.x + 2; x++) {
          expect(t.isRoad(x, y)).toBe(false);
          expect(inLot(x, y)).toBe(false);
          expect(cells.has(`${x},${y}`)).toBe(false);
          cells.add(`${x},${y}`);
        }
    expect(t.buildings.filter((b) => b.kind === 'tw_temple')).toHaveLength(1);
    expect(t.buildings.some((b) => b.shop)).toBe(true);
  });

  it('puts street lamps, poles and the bus stop on pavements beside a road', () => {
    const beside = (x: number, y: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => t.isRoad(x + dx, y + dy));
    for (const p of t.props.filter((q) => q.kind !== 'st3_spirit')) {
      expect(t.isRoad(p.x, p.y)).toBe(false);
      expect(inLot(p.x, p.y)).toBe(false);
      if (p.kind !== 'st3_cart' && p.kind !== 'car3_moto_s') expect(beside(p.x, p.y)).toBe(true);
    }
    expect(t.props.some((p) => p.kind === 'st3_busstop')).toBe(true);
    expect(t.props.filter((p) => p.kind === 'st3_pole').length).toBeGreaterThan(10);
  });

  it('has two-lane roads with a crossing in front of the gate', () => {
    expect(t.isRoad(site.entrance.x, t.roads.front)).toBe(true);
    expect(t.isRoad(site.entrance.x, t.roads.front + 1)).toBe(true);
    expect(t.isRoad(site.entrance.x, site.height)).toBe(false); // the pavement by the fence
    expect(t.crossings).toContainEqual({ axis: 'x', row: t.roads.front, at: site.entrance.x });
  });

  it('lights the street lamps and windows at night', () => {
    expect(townLights(site, 32).length).toBe(t.props.filter((p) => p.kind === 'st3_lamp').length + t.buildings.length);
  });
});
