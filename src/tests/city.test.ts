import { applyCommand, step } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { reconcile } from '../domain/rules/ledger';
import { pctOf } from '../domain/money';
import { CITY_ORDER, CITY_PLACES, MALL_DEAL_DAYS, MALL_SUPPLIES_PERCENT } from '../data/city';
import { dailyResidentCosts } from '../sim/systems/billing';
import { cityCost } from '../sim/systems/city';
import { dayOf } from '../sim/systems/time';
import { centerScore, playerStats, RIVALS, rivalSite, rivalStats, townRanking } from '../sim/rivals';
import { DICTS } from '../ui/i18n';
import type { GameState } from '../domain/types';
import { admit, buildHome, hire, ok, quietEvents } from './helpers';

const home = (): GameState => quietEvents(buildHome(createInitialState(8)));
const nextDay = (s: GameState): GameState => {
  const d = dayOf(s.minute);
  while (dayOf(s.minute) === d) s = step(s);
  return s;
};

describe('town outings', () => {
  it("coffee lifts every employee's morale, paid per head, booked once in the ledger", () => {
    let s = home();
    [s] = hire(s, 'caregiver');
    [s] = hire(s, 'rn');
    s = { ...s, employees: s.employees.map((e) => ({ ...e, morale: 50 })) };
    const cash = s.organization.cashSatang;
    const out = applyCommand(s, { type: 'visitPlace', place: 'coffee' });
    expect(out.result).toMatchObject({ ok: true, costSatang: 2 * CITY_PLACES.coffee.perStaff! });
    expect(out.state.organization.cashSatang).toBe(cash - 2 * CITY_PLACES.coffee.perStaff!);
    expect(out.state.employees.every((e) => e.morale === 55)).toBe(true);
    expect(out.state.ledger.filter((e) => e.category === 'outing')).toHaveLength(1);
    expect(reconcile(out.state).ok).toBe(true);
  });

  it('cake and restaurant cheer residents; the park is free', () => {
    let s = home();
    [s] = admit(s, { needs: { physical: 80, mobility: 80, mental: 80, happiness: 50, satisfaction: 60, nutrition: 80 } });
    const cake = ok(s, { type: 'visitPlace', place: 'cake' }).residents[0].needs;
    expect(cake.happiness).toBe(56);
    const meal = ok(s, { type: 'visitPlace', place: 'restaurant' }).residents[0].needs;
    expect([meal.happiness, meal.satisfaction]).toEqual([53, 64]);
    const park = ok(s, { type: 'visitPlace', place: 'park' });
    expect(park.residents[0].needs.happiness).toBe(52);
    expect(park.organization.cashSatang).toBe(s.organization.cashSatang);
  });

  it('each place once a day, never for nobody, never into debt', () => {
    let s = home();
    expect(applyCommand(s, { type: 'visitPlace', place: 'cake' }).result).toMatchObject({ ok: false, reason: 'nobody_to_treat' });
    [s] = admit(s);
    s = ok(s, { type: 'visitPlace', place: 'cake' });
    expect(applyCommand(s, { type: 'visitPlace', place: 'cake' }).result).toMatchObject({ ok: false, reason: 'already_today' });
    expect(applyCommand(nextDay(s), { type: 'visitPlace', place: 'cake' }).result.ok).toBe(true);
    const broke = { ...s, organization: { ...s.organization, cashSatang: cityCost(s, 'mall') - 1 } };
    expect(applyCommand(broke, { type: 'visitPlace', place: 'mall' }).result).toMatchObject({ ok: false, reason: 'insufficient_funds' });
  });

  it('the mall deal cuts daily supplies for a week, then ends', () => {
    let s = home();
    [s] = admit(s);
    const before = dailyResidentCosts(s).supplies;
    s = ok(s, { type: 'visitPlace', place: 'mall' });
    expect(dailyResidentCosts(s).supplies).toBe(pctOf(before, MALL_SUPPLIES_PERCENT));
    const later = { ...s, minute: s.minute + MALL_DEAL_DAYS * 1440 };
    expect(dailyResidentCosts(later).supplies).toBe(before);
  });

  it('every place has a name and description in both languages', () => {
    for (const id of CITY_ORDER) for (const lang of ['th', 'en'] as const) {
      expect(DICTS[lang][`city.place.${id}`]).toBeTruthy();
      expect(DICTS[lang][`city.place.${id}.desc`]).toBeTruthy();
    }
  });
});

describe('rival homes and the town ranking', () => {
  it('rivals grow with the calendar, repeatably, within their limits', () => {
    for (const r of RIVALS) {
      const a = rivalStats(r, 1);
      expect(rivalStats(r, 1)).toEqual(a);
      const late = rivalStats(r, 300);
      expect(late.beds).toBe(r.maxBeds);
      expect(late.beds).toBeGreaterThanOrEqual(a.beds);
      for (const st of [a, late]) {
        expect(st.residents).toBeLessThanOrEqual(st.beds);
        expect(st.reputation).toBeGreaterThanOrEqual(0);
        expect(st.reputation).toBeLessThanOrEqual(100);
      }
    }
  });

  it('ranks the player among the rivals by score, best first', () => {
    let s = home();
    [s] = admit(s);
    const rows = townRanking(s, { th: 'ฉัน', en: 'Me' });
    expect(rows).toHaveLength(RIVALS.length + 1);
    expect(rows.filter((r) => r.you)).toHaveLength(1);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].stats.score).toBeGreaterThanOrEqual(rows[i].stats.score);
    const me = playerStats(s);
    expect(me.residents).toBe(1);
    expect(me.score).toBe(centerScore(me));
  });

  it('a visit builds a lived-in look-alike, the same every time, without touching the game', () => {
    const r = RIVALS[0];
    const a = rivalSite(r, 30);
    expect(a.site.rooms.filter((x) => x.type === 'ward').length).toBeGreaterThanOrEqual(1);
    expect(a.residents.length).toBeGreaterThan(0);
    expect(a.employees.length).toBeGreaterThan(0);
    expect(rivalSite(r, 30).site).toEqual(a.site);
  });
});
