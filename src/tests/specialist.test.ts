import { applyCommand, POST_SURGERY_STAY_DAYS, step } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { carePlanSchedule, SPECIALIST_GROUPS } from '../data/patients';
import { freeBeds } from '../domain/rules/beds';
import { specialistReferrals, SPECIALIST_REFERRAL_DAYS } from '../sim/systems/staffing';
import { DICTS } from '../ui/i18n';
import type { GameState } from '../domain/types';
import { admit, buildHome, ok, quietEvents, WARD } from './helpers';

const home = (chapter = 3): GameState => {
  const s = quietEvents(buildHome(createInitialState(8)));
  return { ...s, chapter: { id: chapter, startDay: 1, result: null, past: [] } };
};
const ward = (s: GameState) => s.site.rooms.find((r) => r.type === 'ward' && r.rect.x === WARD.x)!.id;
const fit = (s: GameState, ...kits: Array<'door_sensor' | 'sensory_kit' | 'rehab_frame'>) => kits.reduce((g, k) => ok(g, { type: 'installEquipment', roomId: ward(g), equipment: k }), s);

describe('specialist care levels', () => {
  it('need a ward fitted with their kit', () => {
    const s = home();
    expect(freeBeds(s, 'advanced_dementia')).toHaveLength(0);
    expect(freeBeds(fit(s, 'door_sensor'), 'advanced_dementia')).toHaveLength(0);
    expect(freeBeds(fit(s, 'door_sensor', 'sensory_kit'), 'advanced_dementia').length).toBeGreaterThan(0);
    expect(freeBeds(fit(s, 'rehab_frame'), 'post_surgery').length).toBeGreaterThan(0);
  });

  it('have their own care plans: round-the-clock safety and comfort rounds; twice-daily therapy and recovery checks', () => {
    const ad = carePlanSchedule('advanced_dementia', 4).map(([k]) => k);
    expect(ad.filter((k) => k === 'safety_round')).toHaveLength(5);
    expect(ad.filter((k) => k === 'comfort_round')).toHaveLength(2);
    const ps = carePlanSchedule('post_surgery', 2).map(([k]) => k);
    expect(ps.filter((k) => k === 'mobility_session')).toHaveLength(2);
    expect(ps.filter((k) => k === 'recovery_check')).toHaveLength(2);
  });

  it('are referred every few days from chapter 3, only to a fitted home, and never touch an unfitted home', () => {
    const plain = home();
    const day = SPECIALIST_REFERRAL_DAYS * 4;
    expect(specialistReferrals(plain, day)).toBe(plain);
    expect(specialistReferrals(fit(home(2), 'rehab_frame'), day).waitlist.some((c) => c.group === 'post_surgery')).toBe(false);
    const s = specialistReferrals(fit(home(), 'rehab_frame', 'door_sensor', 'sensory_kit'), day);
    for (const g of SPECIALIST_GROUPS) expect(s.waitlist.filter((c) => c.group === g)).toHaveLength(1);
    expect(specialistReferrals(s, day + 1)).toBe(s);
  });

  it('post-surgery residents go home recovered after their stay, and the home gains a little reputation', () => {
    let s = fit(home(), 'rehab_frame');
    [s] = admit(s, { group: 'post_surgery', needs: { physical: 70, mobility: 80, mental: 70, happiness: 70, satisfaction: 70, nutrition: 70 } });
    expect(s.residents[0].group).toBe('post_surgery');
    const rep = s.organization.reputation;
    s = { ...s, residents: s.residents.map((r) => ({ ...r, admittedAt: r.admittedAt - POST_SURGERY_STAY_DAYS * 1440 })) };
    const day = Math.floor(s.minute / 1440);
    while (Math.floor(s.minute / 1440) === day) s = step(s);
    expect(s.residents).toHaveLength(0);
    expect(s.log.some((l) => l.key === 'log.recovered')).toBe(true);
    expect(s.organization.reputation).toBeGreaterThanOrEqual(rep);
    expect(applyCommand(s, { type: 'setSpeed', speed: 1 }).result.ok).toBe(true);
  });

  it('are labelled in both languages', () => {
    for (const lang of ['th', 'en'] as const)
      for (const k of ['group.advanced_dementia', 'group.post_surgery', 'equip.sensory_kit', 'equip.rehab_frame', 'task.comfort_round', 'task.recovery_check', 'spec.advanced_dementia', 'spec.post_surgery']) expect(DICTS[lang][k]).toBeTruthy();
  });
});
