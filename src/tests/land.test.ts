import { applyCommand } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { reconcile } from '../domain/rules/ledger';
import { cellIndex } from '../domain/grid';
import { LAND_PLOTS, nextPlot } from '../data/chapters';
import type { GameState } from '../domain/types';
import { post } from '../sim/helpers';
import { thb } from '../domain/money';
import { buildHome, ok, quietEvents } from './helpers';

const inChapter = (c: number): GameState => {
  // Extra capital booked through the ledger so every plot is affordable.
  const s = post(quietEvents(buildHome(createInitialState(8))), thb(3_000_000), 'capital', 'ledger.capital');
  return { ...s, chapter: { id: c, startDay: 1, result: null, past: [] } };
};

describe('buying more land', () => {
  it('sells the plots down the street in order, each from its chapter, for its price', () => {
    let s = inChapter(5);
    for (const plot of LAND_PLOTS) {
      expect(nextPlot(s.site.width)).toEqual(plot);
      const cash = s.organization.cashSatang;
      const before = s;
      s = ok(s, { type: 'expandLot' });
      expect(s.site.width).toBe(plot.width);
      expect(s.organization.cashSatang).toBe(cash - plot.priceSatang);
      // Everything already built stays where it was.
      expect(s.site.rooms).toEqual(before.site.rooms);
      for (let y = 0; y < s.site.height; y++)
        for (let x = 0; x < before.site.width; x++) expect(s.site.corridor[cellIndex(x, y, s.site.width)]).toBe(before.site.corridor[cellIndex(x, y, before.site.width)]);
    }
    expect(nextPlot(s.site.width)).toBeNull();
    expect(applyCommand(s, { type: 'expandLot' }).result).toMatchObject({ ok: false, reason: 'already_done' });
    expect(reconcile(s).ok).toBe(true);
  });

  it('each later plot waits for its chapter, and needs the cash', () => {
    const s = ok(inChapter(3), { type: 'expandLot' });
    expect(applyCommand(s, { type: 'expandLot' }).result).toMatchObject({ reason: 'chapter_locked' });
    const poor = { ...s, chapter: { ...s.chapter, id: 4 }, organization: { ...s.organization, cashSatang: LAND_PLOTS[1].priceSatang - 1 } };
    expect(applyCommand(poor, { type: 'expandLot' }).result).toMatchObject({ reason: 'insufficient_funds' });
  });

  it('a room can be built on the newest plot once a corridor reaches it', () => {
    let s = inChapter(5);
    for (let i = 0; i < LAND_PLOTS.length; i++) s = ok(s, { type: 'expandLot' });
    s = ok(s, { type: 'paintCorridor', rect: { x: 14, y: 10, w: 40, h: 1 } });
    s = ok(s, { type: 'placePrefab', prefab: 'storage', origin: { x: 50, y: 11 } });
    expect(s.site.rooms.some((r) => r.type === 'storage_room' && r.rect.x === 50)).toBe(true);
  });
});
