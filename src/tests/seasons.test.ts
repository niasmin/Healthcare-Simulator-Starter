import { createInitialState } from '../sim/state';
import { goalsDayEnd, goalsOf } from '../sim/systems/goals';
import { TROPHY_STARS } from '../data/goals';
import { townRanking } from '../sim/rivals';
import { currentSeason, previousSeason } from '../storage/supabaseStore';
import type { GameState } from '../domain/types';
import { admit, buildHome, quietEvents } from './helpers';

/** A home that tops the town: many happy residents and a famous name. */
function champion(): GameState {
  let s = quietEvents(buildHome(createInitialState(8)));
  for (let i = 0; i < 10; i++) [s] = admit(s, { needs: { physical: 80, mobility: 80, mental: 80, happiness: 90, satisfaction: 95, nutrition: 80 } });
  return { ...s, organization: { ...s.organization, reputation: 100 } };
}

describe('town seasons (each game month)', () => {
  it('a podium finish at month end wins a trophy and its stars', () => {
    const s = champion();
    const rank = townRanking(s, { th: '', en: '' }).findIndex((r) => r.you) + 1;
    expect(rank).toBeGreaterThanOrEqual(1);
    expect(rank).toBeLessThanOrEqual(3);
    const g = goalsOf(goalsDayEnd(s, 30));
    expect(g.trophies).toEqual([{ month: 1, rank }]);
    expect(g.stars).toBeGreaterThanOrEqual(TROPHY_STARS[rank - 1]);
  });

  it('no trophy mid-month, for an empty home, or off the podium', () => {
    const s = champion();
    expect(goalsOf(goalsDayEnd(s, 29)).trophies ?? []).toHaveLength(0);
    const empty = quietEvents(buildHome(createInitialState(8)));
    expect(goalsOf(goalsDayEnd(empty, 30)).trophies ?? []).toHaveLength(0);
  });
});

describe('online seasons (calendar months)', () => {
  it('are named by UTC month and step back across years', () => {
    expect(currentSeason(new Date(Date.UTC(2026, 9, 21)))).toBe('2026-10');
    expect(previousSeason('2026-10')).toBe('2026-09');
    expect(previousSeason('2026-01')).toBe('2025-12');
    expect(previousSeason('2026-03', 6)).toBe('2025-09');
  });
});
