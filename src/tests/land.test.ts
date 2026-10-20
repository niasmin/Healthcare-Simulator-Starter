import { applyCommand } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { reconcile } from '../domain/rules/ledger';
import { cellIndex } from '../domain/grid';
import { EXTRA_PLOT_GROWTH, EXTRA_PLOT_WIDTH, LAND_PLOTS, MAX_LOT_WIDTH, nextPlot } from '../data/chapters';
import type { GameState } from '../domain/types';
import { post } from '../sim/helpers';
import { thb } from '../domain/money';
import { buildHome, ok, quietEvents } from './helpers';
import { buyLand } from '../sim/autoCampaign';
import { buildSomewhere } from '../sim/autoBuild';

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

  it('the autopilot buys the next plot with a corridor running into it, so rooms can be built there', () => {
    const s = inChapter(5);
    const g = buyLand(s, applyCommand);
    expect(g.site.width).toBe(LAND_PLOTS[0].width);
    // The new corridor reaches into the new plot.
    const east = Array.from({ length: g.site.height }, (_, y) => g.site.corridor[cellIndex(LAND_PLOTS[0].width - 2, y, g.site.width)]).some((v) => v === 1);
    expect(east).toBe(true);
    // Fill the old lot's spots, then a villa still finds a working spot on the new land.
    let t = g;
    for (let i = 0; i < 12; i++) {
      const b = buildSomewhere(t, applyCommand, 'villa');
      if (!b) break;
      t = b.state;
    }
    expect(t.site.rooms.some((r) => r.type === 'villa' && r.rect.x >= 20)).toBe(true);
    expect(reconcile(t).ok).toBe(true);
  });

  it('after the listed plots the street goes on, 12 columns a plot, each dearer, up to the far end', () => {
    const last = LAND_PLOTS[LAND_PLOTS.length - 1];
    let w = last.width;
    let price = last.priceSatang;
    while (nextPlot(w)) {
      const p = nextPlot(w)!;
      expect(p.width).toBe(w + EXTRA_PLOT_WIDTH);
      expect(p.priceSatang).toBeGreaterThan(price);
      expect(p.priceSatang / price).toBeCloseTo(EXTRA_PLOT_GROWTH, 1);
      w = p.width;
      price = p.priceSatang;
    }
    expect(w).toBeLessThanOrEqual(MAX_LOT_WIDTH);
    expect(nextPlot(w)).toBeNull();
    // The game itself sells them too.
    let s = post(inChapter(5), thb(100_000_000), 'capital', 'ledger.capital');
    for (let i = 0; i < 6; i++) s = ok(s, { type: 'expandLot' });
    expect(s.site.width).toBe(last.width + 3 * EXTRA_PLOT_WIDTH);
    expect(s.site.corridor).toHaveLength(s.site.width * s.site.height);
    expect(reconcile(s).ok).toBe(true);
  });
});
