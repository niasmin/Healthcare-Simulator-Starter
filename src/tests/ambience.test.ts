import { lightAt, NIGHT_DARK } from '../render/Ambience';

describe('map light through the day', () => {
  it('is clear by day, dark at night, and warm at dawn and dusk', () => {
    expect(lightAt(12 * 60)).toMatchObject({ alpha: 0, night: 0 });
    expect(lightAt(2 * 60).night).toBe(1);
    // The tint is lighter at night than it was: the darkness sheet (cut around lights) does the rest.
    expect(lightAt(2 * 60).alpha).toBeGreaterThan(0.25);
    expect(lightAt(2 * 60).alpha + NIGHT_DARK).toBeGreaterThan(0.7);
    const dusk = lightAt(18 * 60 + 30);
    expect(dusk.alpha).toBeGreaterThan(0.1);
    expect(dusk.night).toBeLessThan(0.5);
    expect(lightAt(7 * 60).night).toBeLessThan(0.2);
  });

  it('changes smoothly: no jump bigger than a few percent between 10-minute ticks, and wraps at midnight', () => {
    for (let m = 0; m < 1440; m += 10) {
      const a = lightAt(m);
      const b = lightAt(m + 10);
      expect(Math.abs(a.alpha - b.alpha)).toBeLessThan(0.05);
      expect(Math.abs(a.night - b.night)).toBeLessThan(0.12);
    }
    expect(lightAt(1440 + 600)).toEqual(lightAt(600));
  });
});
