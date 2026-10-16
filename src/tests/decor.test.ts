import { advance, applyCommand } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { reconcile } from '../domain/rules/ledger';
import { DECOR, gardenAppeal, MAX_APPEAL } from '../data/decor';
import { validate } from '../storage/format';
import { TICKS_PER_DAY } from '../sim/constants';
import type { GameState } from '../domain/types';
import { admit, buildHome, ok, quietEvents } from './helpers';

describe('garden decorations', () => {
  it('places on an empty tile and charges once', () => {
    const s0 = createInitialState(1);
    const s1 = ok(s0, { type: 'placeDecor', decor: 'fountain', cell: { x: 15, y: 15 } });
    expect(s1.site.decor).toHaveLength(1);
    expect(s0.organization.cashSatang - s1.organization.cashSatang).toBe(DECOR.fountain.costSatang);
    expect(s1.ledger.filter((e) => e.ref === s1.site.decor[0].id)).toHaveLength(1);
    expect(reconcile(s1).ok).toBe(true);
  });

  it('cannot share a tile with rooms, corridor, entrance or other decor — and blocks building over it', () => {
    let s = buildHome(createInitialState(1), 2);
    expect(applyCommand(s, { type: 'placeDecor', decor: 'tree', cell: { x: 3, y: 6 } }).result).toMatchObject({ reason: 'overlap' }); // ward
    expect(applyCommand(s, { type: 'placeDecor', decor: 'tree', cell: { x: 9, y: 12 } }).result).toMatchObject({ reason: 'overlap' }); // corridor
    expect(applyCommand(s, { type: 'placeDecor', decor: 'tree', cell: s.site.entrance }).result).toMatchObject({ reason: 'overlap' });
    s = ok(s, { type: 'placeDecor', decor: 'tree', cell: { x: 16, y: 3 } });
    expect(applyCommand(s, { type: 'placeDecor', decor: 'sakura', cell: { x: 16, y: 3 } }).result).toMatchObject({ reason: 'overlap' });
    expect(applyCommand(s, { type: 'placeRoom', roomType: 'staff_room', rect: { x: 15, y: 2, w: 2, h: 2 } }).result).toMatchObject({ reason: 'overlap' });
    expect(applyCommand(s, { type: 'paintCorridor', rect: { x: 14, y: 3, w: 4, h: 1 } }).result).toMatchObject({ reason: 'overlap' });
  });

  it('demolishing decor refunds half once', () => {
    let s = ok(createInitialState(1), { type: 'placeDecor', decor: 'gazebo', cell: { x: 2, y: 2 } });
    const cash = s.organization.cashSatang;
    s = ok(s, { type: 'bulldoze', cell: { x: 2, y: 2 } });
    expect(s.site.decor).toHaveLength(0);
    expect(s.organization.cashSatang - cash).toBe(DECOR.gazebo.costSatang / 2);
    expect(reconcile(s).ok).toBe(true);
  });

  it('appeal is capped and keeps residents happier', () => {
    expect(gardenAppeal(Array.from({ length: 20 }, () => ({ type: 'gazebo' as const })))).toBe(MAX_APPEAL);
    const base = (): GameState => {
      let s = quietEvents(buildHome(createInitialState(8), 2));
      [s] = admit(s, { group: 'active_aging', careLevel: 1 });
      return s;
    };
    let garden = base();
    for (const [i, t] of (['gazebo', 'fountain', 'umbrella', 'sakura', 'sakura', 'tree', 'flowers'] as const).entries())
      garden = ok(garden, { type: 'placeDecor', decor: t, cell: { x: 14 + (i % 4), y: 14 + Math.floor(i / 4) } });
    const plain = advance(base(), TICKS_PER_DAY * 2);
    const lush = advance(garden, TICKS_PER_DAY * 2);
    expect(lush.residents[0].needs.happiness).toBeGreaterThan(plain.residents[0].needs.happiness + 5);
  });

  it('old saves (schema 3) upgrade to schema 4 with an empty garden', () => {
    const s = createInitialState(1);
    const { decor: _d, ...siteV3 } = s.site;
    void _d;
    const v3 = { ...s, schemaVersion: 3, site: siteV3 } as unknown as GameState;
    const res = validate(v3);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.schemaVersion).toBe(4);
      expect(res.state.site.decor).toEqual([]);
    }
  });
});
