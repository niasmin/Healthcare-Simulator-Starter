import { weatherFor } from '../render/Ambience';
import { strollSpots } from '../render/IsoRenderer';
import { mapMarkers } from '../ui/components/GameCanvas';
import { createInitialState } from '../sim/state';
import type { GameState } from '../domain/types';
import { admit, buildHome, quietEvents } from './helpers';

const at = (s: GameState, hour: number) => ({ ...s, minute: Math.floor(s.minute / 1440) * 1440 + hour * 60 });
/** A day of the given weather for this seed. */
const dayWith = (s: GameState, w: string) => {
  for (let d = 1; d < 400; d++) if (weatherFor(s.seed, d) === w) return { ...s, minute: (d - 1) * 1440 + (s.minute % 1440) };
  throw new Error(w);
};

describe('weather (looks only)', () => {
  it('is repeatable per seed and day, mostly clear, with some rain and some cloud', () => {
    const days = Array.from({ length: 600 }, (_, i) => weatherFor(8, i + 1));
    expect(weatherFor(8, 17)).toBe(days[16]);
    const n = (w: string) => days.filter((d) => d === w).length;
    expect(n('clear')).toBeGreaterThan(300);
    expect(n('rain')).toBeGreaterThan(50);
    expect(n('cloudy')).toBeGreaterThan(50);
  });
});

describe('residents out for a stroll', () => {
  it('mobile residents stroll in the late morning and afternoon, and are back in bed at night or in the rain', () => {
    let s = quietEvents(buildHome(createInitialState(8)));
    [s] = admit(s, { group: 'active_aging', needs: { physical: 80, mobility: 85, mental: 80, happiness: 70, satisfaction: 70, nutrition: 80 } });
    [s] = admit(s, { group: 'bedridden', needs: { physical: 40, mobility: 10, mental: 60, happiness: 60, satisfaction: 60, nutrition: 60 } });
    const dry = dayWith(s, 'clear');
    const out = mapMarkers(at(dry, 10)).filter((m) => m.kind === 'resident');
    expect(out.filter((m) => 'stroll' in m && m.stroll)).toHaveLength(1);
    expect(mapMarkers(at(dry, 22)).some((m) => 'stroll' in m && m.stroll)).toBe(false);
    expect(mapMarkers(at(dayWith(s, 'rain'), 10)).some((m) => 'stroll' in m && m.stroll)).toBe(false);
  });

  it('stroll spots are on the dining floor or lawn, never inside other rooms or on decor', () => {
    const s = quietEvents(buildHome(createInitialState(8)));
    const spots = strollSpots(s.site, () => []);
    expect(spots.length).toBeGreaterThan(0);
    for (const c of spots) {
      expect(s.site.rooms.some((r) => c.x >= r.rect.x && c.x < r.rect.x + r.rect.w && c.y >= r.rect.y && c.y < r.rect.y + r.rect.h)).toBe(false);
      expect(s.site.corridor[c.y * s.site.width + c.x]).toBe(0);
    }
    expect(new Set(spots.map((c) => `${c.x},${c.y}`)).size).toBe(spots.length);
  });
});
