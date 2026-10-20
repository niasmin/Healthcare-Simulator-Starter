import { applyCommand, step } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { reconcile } from '../domain/rules/ledger';
import { fireEvent } from '../sim/systems/events';
import { AUTO_CHOICES, AUTO_KEYS, BUILD_RESERVE, autoSettings, nextBuild } from '../sim/autopilot';
import { campaignTurn, dailyCare, pricingFor } from '../sim/autoCampaign';
import { alertsFor, LOW_CASH_DAYS } from '../ui/alerts';
import { gardenAppeal } from '../data/decor';
import { buildSomewhere } from '../sim/autoBuild';
import { post } from '../sim/helpers';
import { thb } from '../domain/money';
import { ticksFor, MAX_AWAY_DAYS } from '../ui/away';
import { advanceChapter } from '../sim/autoCampaign';
import { LAND_PLOTS } from '../data/chapters';
import { newGameState } from '../sim/modes';
import { makeResidentCandidate } from '../sim/systems/staffing';
import { allRoomStatuses } from '../domain/rules/rooms';
import { dailyRunningCost } from '../sim/selectors';
import { MINUTES_PER_DAY } from '../sim/constants';
import type { GameState } from '../domain/types';
import { admit, buildHome, hire, ok, quietEvents } from './helpers';

const ALL_ON = { events: true, admit: true, carePlan: true, staff: true, build: true };
const EVERYTHING = { ...ALL_ON, chapters: true };
const days = (s: GameState, n: number) => {
  for (let i = 0; i < n * (MINUTES_PER_DAY / 10); i++) s = step(s);
  return s;
};

describe('autopilot', () => {
  it('is off by default and is switched with a command', () => {
    const s = createInitialState(8);
    expect(Object.values(autoSettings(s)).every((v) => v === false)).toBe(true);
    expect(Object.keys(autoSettings(s)).sort()).toEqual([...AUTO_KEYS].sort());
    const on = ok(s, { type: 'setAuto', settings: { admit: true } });
    expect(autoSettings(on)).toMatchObject({ admit: true, events: false });
  });

  it('runs a built home on its own for 30 days: admits, plans, hires and rosters, solvent and ledger intact', () => {
    let s = ok(quietEvents(buildHome(createInitialState(8))), { type: 'setAuto', settings: ALL_ON });
    s = days(s, 30);
    expect(s.residents.length).toBeGreaterThanOrEqual(8);
    expect(s.residents.every((r) => r.carePlan)).toBe(true);
    expect(s.employees.some((e) => e.role === 'rn')).toBe(true);
    expect(s.organization.cashSatang).toBeGreaterThan(0);
    const last = s.history.slice(-7);
    const done = last.reduce((a, d) => a + d.done, 0);
    const missed = last.reduce((a, d) => a + d.missed, 0);
    expect(done / (done + missed)).toBeGreaterThan(0.9);
    expect(reconcile(s).ok).toBe(true);
    // Unique beds and no overlapping shifts still hold.
    expect(new Set(s.residents.map((r) => r.bedId)).size).toBe(s.residents.length);
  });

  it('answers events at once without pausing, accepting a staff request', () => {
    let s = buildHome(createInitialState(8));
    [s] = hire(s, 'rn', ['morning']);
    [s] = hire(s, 'pn', ['afternoon']);
    s = ok({ ...s, speed: 2 }, { type: 'setAuto', settings: { events: true } });
    s = fireEvent(s, 'staff_resign');
    expect(s.speed).toBe(0);
    const wages = s.employees.map((e) => e.wageMonthlySatang);
    s = step(s);
    expect(s.events.active).toBeNull();
    expect(s.speed).toBe(2);
    expect(s.events.history[s.events.history.length - 1].choiceId).toBe(AUTO_CHOICES.staff_resign[0]);
    expect(s.employees.map((e) => e.wageMonthlySatang).some((w, i) => w > wages[i])).toBe(true);
  });

  it('from the starter campus it builds, staffs and fills the home, and wins chapter 1 on its own', () => {
    let s = ok(newGameState('starter', 'campaign', undefined, 1), { type: 'setAuto', settings: ALL_ON });
    let minCash = Infinity;
    for (let d = 0; d < 31; d++) {
      s = days(s, 1);
      minCash = Math.min(minCash, s.organization.cashSatang);
    }
    const statuses = allRoomStatuses(s.site);
    for (const t of ['ward', 'nursing_station', 'staff_room', 'therapy']) expect(s.site.rooms.some((r) => r.type === t && statuses.get(r.id)?.operational)).toBe(true);
    expect(s.chapter.result?.outcome).toBe('won');
    expect(minCash).toBeGreaterThan(0);
    expect(reconcile(s).ok).toBe(true);
  }, 20_000);

  it('only builds what is missing or needed, and only with money to spare', () => {
    let s = quietEvents(buildHome(createInitialState(8)));
    expect(nextBuild(s)).toBeNull();
    expect(nextBuild(ok(s, { type: 'deleteRoom', roomId: s.site.rooms.find((r) => r.type === 'therapy')!.id }))).toBe('therapy');
    // Full beds and families waiting: another ward.
    s = ok(s, { type: 'setAuto', settings: { admit: true, build: true } });
    s = days(s, 3);
    expect(s.residents.length).toBe(10);
    for (let i = 0; i < 3; i++) s = makeResidentCandidate(s, { group: 'active_aging' });
    expect(nextBuild(s)).toBe('ward10');
    // Too little cash: nothing is built at 08:00.
    const poor = { ...s, organization: { ...s.organization, cashSatang: 30 * dailyRunningCost(s) + BUILD_RESERVE } };
    const after = days(poor, 1);
    expect(after.site.rooms.length).toBe(s.site.rooms.length);
  });

  it('"play every chapter" runs the campaign unattended: chapters 1–3 won back to back, villas built', () => {
    let s = ok({ ...newGameState('starter', 'campaign', undefined, 3), speed: 1 }, { type: 'setAuto', settings: EVERYTHING });
    let minCash = Infinity;
    for (let d = 0; d < 151; d++) {
      s = days(s, 1);
      minCash = Math.min(minCash, s.organization.cashSatang);
    }
    const verdicts = [...s.chapter.past, ...(s.chapter.result ? [s.chapter.result] : [])].map((v) => [v.chapter, v.outcome, v.day]);
    expect(verdicts).toEqual([
      [1, 'won', 30],
      [2, 'won', 90],
      [3, 'won', 150],
    ]);
    // Straight on into chapter 4 without stopping.
    expect(s.chapter.id).toBe(4);
    expect(s.speed).toBe(1);
    // Land is bought only once the lot is full, so the width is the start or a later plot.
    expect([20, ...LAND_PLOTS.map((p) => p.width)]).toContain(s.site.width);
    expect(s.site.rooms.filter((r) => r.type === 'villa').length).toBeGreaterThanOrEqual(4);
    expect(minCash).toBeGreaterThan(0);
    expect(reconcile(s).ok).toBe(true);
  }, 60_000);

  it('after a verdict: the next chapter on a win, the same chapter again on a loss, at the speed before', () => {
    const base = quietEvents(buildHome(createInitialState(8)));
    const won = { ...base, speed: 0 as const, chapter: { id: 1, startDay: 1, result: { chapter: 1, outcome: 'won' as const, day: 30, checks: [] as never[] }, past: [] } };
    const next = advanceChapter(won as unknown as GameState, applyCommand, 4);
    expect(next.chapter.id).toBe(2);
    expect(next.speed).toBe(4);
    const lost = { ...won, chapter: { ...won.chapter, result: { ...won.chapter.result, outcome: 'failed' as const } } };
    const again = advanceChapter(lost as unknown as GameState, applyCommand, 2);
    expect(again.chapter.id).toBe(1);
    expect(again.chapter.result).toBeNull();
    expect(again.speed).toBe(2);
  });

  describe('business switches work on their own', () => {
    const OFF = { chapters: false, build: false, estate: false, homecare: false, training: false, placements: false, branches: false, shop: false };
    const rich = (chapter: number): GameState => {
      const s = post(quietEvents(buildHome(createInitialState(8))), thb(5_000_000), 'capital', 'ledger.capital');
      return { ...s, chapter: { id: chapter, startDay: 1, result: null, past: [] } };
    };

    it('Home Care opens the centre (from chapter 4 only) and takes clients the vans can serve', () => {
      expect(campaignTurn(rich(3), applyCommand, { ...OFF, homecare: true }).site.rooms.some((r) => r.type === 'homecare_office')).toBe(false);
      let s = campaignTurn(rich(4), applyCommand, { ...OFF, homecare: true });
      expect(s.site.rooms.some((r) => r.type === 'homecare_office')).toBe(true);
      for (let d = 0; d < 3 && !s.homecare.clients.length; d++) s = campaignTurn(days(s, 1), applyCommand, { ...OFF, homecare: true });
      expect(s.homecare.clients.length).toBeGreaterThan(0);
      // Nothing else is touched.
      expect(s.site.rooms.some((r) => r.type === 'villa' || r.type === 'training_room')).toBe(false);
    });

    it('training builds the training room and sends someone for a certificate', () => {
      const s = campaignTurn(rich(5), applyCommand, { ...OFF, training: true });
      expect(s.site.rooms.some((r) => r.type === 'training_room')).toBe(true);
      expect(s.workforce.training.length).toBeGreaterThan(0);
      expect(s.workforce.contracts).toHaveLength(0);
    });

    it('placements build the training room partners require, then accept their offers with a suitable person', () => {
      let s = rich(5);
      for (let d = 0; d < 10 && !s.workforce.contracts.length; d++) s = campaignTurn(days(s, 1), applyCommand, { ...OFF, placements: true });
      expect(s.workforce.contracts.length).toBeGreaterThan(0);
      // Partners only make offers to a home with a training room, so it builds one; nobody is sent to class.
      expect(s.site.rooms.some((r) => r.type === 'training_room')).toBe(true);
      expect(s.workforce.training).toHaveLength(0);
    });

    it('the shop buys the cheapest unlocked upgrade with money to spare, and nothing when short', () => {
      // Not before the home has 30 beds.
      expect(campaignTurn(rich(1), applyCommand, { ...OFF, shop: true }).upgrades ?? []).toEqual([]);
      let big = rich(1);
      for (let i = 0; i < 2; i++) big = buildSomewhere(big, applyCommand, 'ward10')!.state;
      const s = campaignTurn(big, applyCommand, { ...OFF, shop: true });
      expect(s.upgrades).toEqual(['online_marketing']);
      const base = quietEvents(buildHome(createInitialState(8)));
      const poor = campaignTurn({ ...base, organization: { ...base.organization, cashSatang: thb(200_000) } }, applyCommand, { ...OFF, shop: true });
      expect(poor.upgrades ?? []).toEqual([]);
    });
  });

  describe('everyday extras', () => {
    it('pricing: value with empty beds, premium for a full, liked home with a queue, else standard', () => {
      let s = quietEvents(buildHome(createInitialState(8)));
      [s] = hire(s, 'rn', ['morning']);
      expect(pricingFor(s)).toBe('value');
      s = ok(s, { type: 'setAuto', settings: { pricing: true } });
      const priced = dailyCare({ ...s, minute: Math.floor(s.minute / 1440) * 1440 + 6 * 60 }, applyCommand, autoSettings(s));
      expect(priced.priceLevel).toBe('value');
      for (let i = 0; i < 10; i++) [s] = admit(s);
      for (let i = 0; i < 6; i++) s = makeResidentCandidate(s, { group: 'active_aging' });
      const liked = { ...s, organization: { ...s.organization, reputation: 70 }, residents: s.residents.map((r) => ({ ...r, needs: { ...r.needs, satisfaction: 90 } })) };
      expect(pricingFor(liked)).toBe('premium');
      expect(pricingFor({ ...liked, waitlist: liked.waitlist.slice(0, 2) })).toBe('standard');
    });

    it('staff care: a tired person on a double shift gets the second one off; a staff room is built if missing', () => {
      let s = quietEvents(buildHome(createInitialState(8)));
      let id: string;
      [s, id] = hire(s, 'caregiver', ['morning', 'afternoon']);
      [s] = admit(s);
      s = { ...s, employees: s.employees.map((e) => (e.id === id ? { ...e, energy: 20 } : e)) };
      const at5 = { ...s, minute: Math.floor(s.minute / 1440) * 1440 + 1440 + 5 * 60 };
      const out = dailyCare(at5, applyCommand, { staffCare: true });
      expect(out.shifts.filter((x) => x.employeeId === id)).toHaveLength(1);
      const noRoom = ok(at5, { type: 'deleteRoom', roomId: at5.site.rooms.find((r) => r.type === 'staff_room')!.id });
      expect(dailyCare(noRoom, applyCommand, { staffCare: true }).site.rooms.some((r) => r.type === 'staff_room')).toBe(true);
    });

    it('garden from chapter 1: decor around the wards, never next to a corridor, up to full appeal', () => {
      let s = post(quietEvents(buildHome(createInitialState(8))), thb(2_000_000), 'capital', 'ledger.capital');
      for (let i = 0; i < 20; i++) s = campaignTurn(s, applyCommand, { chapters: false, build: false, estate: false, homecare: false, training: false, placements: false, branches: false, shop: false, garden: true });
      expect(gardenAppeal(s.site.decor)).toBeGreaterThanOrEqual(30);
      for (const d of s.site.decor)
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = d.cell.x + dx;
          const y = d.cell.y + dy;
          if (x >= 0 && y >= 0 && x < s.site.width && y < s.site.height) expect(s.site.corridor[y * s.site.width + x]).toBe(0);
        }
      expect(reconcile(s).ok).toBe(true);
    });

    it('alerts: low cash under two weeks of running costs, and a game paused for a decision', () => {
      let s = quietEvents(buildHome(createInitialState(8)));
      [s] = admit(s);
      [s] = hire(s, 'rn', ['morning']);
      expect(alertsFor(s)).toBeNull();
      const poor = { ...s, organization: { ...s.organization, cashSatang: dailyRunningCost(s) * (LOW_CASH_DAYS - 4) } };
      expect(alertsFor(poor)).toEqual({ kind: 'cash', days: LOW_CASH_DAYS - 4 });
      expect(alertsFor(fireEvent({ ...s, speed: 1 }, 'family_visit'))?.kind).toBe('paused');
    });
  });

  it('time away is played out at the speed the game ran at, capped at 30 game days', () => {
    expect(ticksFor(60_000, 1, 500)).toBe(120);
    expect(ticksFor(60_000, 4, 500)).toBe(480);
    expect(ticksFor(24 * 3_600_000, 4, 500)).toBe(MAX_AWAY_DAYS * 144);
  });

  it('with autopilot off nothing happens by itself', () => {
    let s = quietEvents(buildHome(createInitialState(8)));
    s = days(s, 2);
    expect(s.residents).toHaveLength(0);
    expect(s.employees).toHaveLength(0);
    expect(applyCommand(s, { type: 'setAuto', settings: {} }).result.ok).toBe(true);
  });
});
