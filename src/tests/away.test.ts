import { AUTO_CATCH_UP_TICKS, offerAway, runAway, stopAway } from '../ui/away';
import { useGame } from '../ui/store';
import { MS_PER_TICK_1X } from '../ui/hooks';

const waitIdle = async () => {
  for (let i = 0; i < 2000 && useGame.getState().away; i++) await new Promise((r) => setTimeout(r, 0));
};

describe('time away', () => {
  beforeEach(() => {
    useGame.getState().newGame('ready');
    const g = useGame.getState().game;
    useGame.setState({ game: { ...g, speed: 1, auto: { ...(g.auto ?? {}), staffing: true } as typeof g.auto }, away: null, awayOffer: null, awayReport: null });
  });

  it('catches up a short absence straight away', async () => {
    const before = useGame.getState().game.minute;
    offerAway(30 * MS_PER_TICK_1X, 1, MS_PER_TICK_1X);
    expect(useGame.getState().awayOffer).toBeNull();
    await waitIdle();
    expect(useGame.getState().game.minute).toBe(before + 30 * 10);
  });

  it('asks first after a long absence, and skipping leaves the game where it was', () => {
    const before = useGame.getState().game;
    offerAway((AUTO_CATCH_UP_TICKS * 5) * MS_PER_TICK_1X, 1, MS_PER_TICK_1X);
    expect(useGame.getState().awayOffer).toEqual({ ticks: AUTO_CATCH_UP_TICKS * 5, ms: AUTO_CATCH_UP_TICKS * 5 * MS_PER_TICK_1X });
    expect(useGame.getState().away).toBeNull();
    useGame.getState().skipAway();
    expect(useGame.getState().awayOffer).toBeNull();
    expect(useGame.getState().game).toBe(before);
  });

  it('can be stopped part way, keeping what was played', async () => {
    const before = useGame.getState().game.minute;
    runAway(AUTO_CATCH_UP_TICKS * 3);
    expect(useGame.getState().awayOffer).toBeNull();
    stopAway();
    await waitIdle();
    const after = useGame.getState().game.minute;
    expect(after).toBeGreaterThanOrEqual(before);
    expect(after).toBeLessThan(before + AUTO_CATCH_UP_TICKS * 3 * 10);
  });
});
