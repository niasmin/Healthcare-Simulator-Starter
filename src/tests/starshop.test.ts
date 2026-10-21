import { applyCommand } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { DECOR, STAR_DECOR, starsLeft } from '../data/decor';
import { playerStats } from '../sim/rivals';
import { reconcile } from '../domain/rules/ledger';
import { DICTS } from '../ui/i18n';
import type { GameState } from '../domain/types';
import { buildHome, ok, quietEvents } from './helpers';

const withStars = (stars: number, spent = 0): GameState => {
  const s = quietEvents(buildHome(createInitialState(8)));
  return { ...s, goals: { day: 1, done: [], total: 0, streak: 0, stars, spent, achievements: {} } };
};
const LAWN = { x: 15, y: 15 };

describe('star shop', () => {
  it('star pieces cost stars, never cash, and placing one spends them', () => {
    const s = withStars(50);
    const cash = s.organization.cashSatang;
    const out = ok(s, { type: 'placeDecor', decor: 'statue', cell: LAWN });
    expect(out.organization.cashSatang).toBe(cash);
    expect(out.goals?.spent).toBe(DECOR.statue.stars);
    expect(starsLeft(out.goals)).toBe(50 - DECOR.statue.stars!);
    expect(out.site.decor.some((d) => d.type === 'statue')).toBe(true);
    expect(reconcile(out).ok).toBe(true);
  });

  it("refuses a piece the home can't afford in stars", () => {
    const s = withStars(30, 25);
    expect(applyCommand(s, { type: 'placeDecor', decor: 'gold_fountain', cell: LAWN }).result).toMatchObject({ ok: false, reason: 'not_enough_stars' });
    expect(applyCommand(withStars(0), { type: 'placeDecor', decor: 'gold_lantern', cell: LAWN }).result).toMatchObject({ ok: false, reason: 'not_enough_stars' });
  });

  it('spending stars never lowers the ranking score; bulldozing a star piece refunds nothing', () => {
    const s = withStars(50);
    const before = playerStats(s).score;
    const placed = ok(s, { type: 'placeDecor', decor: 'sakura_arch', cell: LAWN });
    expect(playerStats(placed).stars).toBe(50);
    expect(playerStats(placed).score).toBeGreaterThanOrEqual(before);
    const gone = ok(placed, { type: 'bulldoze', cell: LAWN });
    expect(gone.site.decor.some((d) => d.type === 'sakura_arch')).toBe(false);
    expect(gone.organization.cashSatang).toBe(placed.organization.cashSatang);
    expect(gone.goals?.spent).toBe(placed.goals?.spent);
  });

  it('every piece has a star price and a name in both languages', () => {
    for (const d of STAR_DECOR) {
      expect(DECOR[d].stars).toBeGreaterThan(0);
      expect(DECOR[d].costSatang).toBe(0);
      for (const lang of ['th', 'en'] as const) expect(DICTS[lang][`decor.${d}`]).toBeTruthy();
    }
  });
});
