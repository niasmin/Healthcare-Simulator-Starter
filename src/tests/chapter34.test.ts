import { advance, applyCommand, step } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { reconcile } from '../domain/rules/ledger';
import { parseBedId } from '../domain/rules/beds';
import { cellIndex } from '../domain/grid';
import { buildObjectives, peopleMarkers } from '../sim/selectors';
import { STARTER_SCENARIO } from '../data/scenarios';
import { EXPANDED_WIDTH, LAND_PRICE } from '../data/chapters';
import { VISIT_PRICE } from '../data/finance';
import { CHURN_SATISFACTION, VISIT_DURATION, VISIT_SLOTS, emptyHomecare, homecareTick, visitRate } from '../sim/systems/homecare';
import { TICKS_PER_DAY } from '../sim/constants';
import { validate } from '../storage/format';
import { DICTS } from '../ui/i18n';
import type { GameState, ResidentCandidate } from '../domain/types';
import { NEW_LAND, playthrough } from './bot';
import { buildHome, hire, ok, quietEvents } from './helpers';

/** A state already in `chapter`, with the starter home built (for rule tests). */
function inChapter(chapter: number, seed = 8): GameState {
  const s = quietEvents(buildHome(createInitialState(seed)));
  return { ...s, chapter: { id: chapter, startDay: 1, result: null, past: [] } };
}

const premiumCandidate = (id: string): ResidentCandidate => ({
  id,
  name: { th: 'ก', en: 'A' },
  age: 80,
  group: 'active_aging',
  careLevel: 1,
  needs: { physical: 80, mobility: 80, mental: 80, happiness: 80, satisfaction: 80, nutrition: 80 },
  premium: true,
});

function withVilla(s: GameState): [GameState, string] {
  s = ok(s, { type: 'expandLot' });
  s = ok(s, { type: 'paintCorridor', rect: NEW_LAND.corridor });
  const out = applyCommand(s, { type: 'placeRoom', roomType: 'villa', rect: NEW_LAND.villas[0] });
  if (!out.result.ok || !out.result.id) throw new Error('villa');
  s = out.state;
  for (const k of ['care_bed', 'call_system', 'rest_sofa'] as const) s = ok(s, { type: 'installEquipment', roomId: out.result.id, equipment: k });
  return [s, out.result.id];
}

function withOffice(s: GameState, vans = 1): [GameState, string] {
  if (s.site.width < EXPANDED_WIDTH) s = ok(ok(s, { type: 'expandLot' }), { type: 'paintCorridor', rect: NEW_LAND.corridor });
  const out = applyCommand(s, { type: 'placeRoom', roomType: 'homecare_office', rect: NEW_LAND.office });
  if (!out.result.ok || !out.result.id) throw new Error('office');
  s = ok(out.state, { type: 'installEquipment', roomId: out.result.id, equipment: 'nurse_desk' });
  for (let i = 0; i < vans; i++) s = ok(s, { type: 'installEquipment', roomId: out.result.id, equipment: 'care_van' });
  return [s, out.result.id];
}

function addLeads(s: GameState, plans: Array<'caregiver' | 'nurse'>): GameState {
  const leads = plans.map((plan, i) => ({ id: `lead-t${i}`, name: { th: `ลูกค้า${i}`, en: `Client${i}` }, age: 80, plan }));
  return { ...s, homecare: { ...s.homecare, leads: [...s.homecare.leads, ...leads] } };
}

describe('the full campaign: chapters 1–4 in 210 days (scripted careful player)', () => {
  const run = playthrough(createInitialState(STARTER_SCENARIO.defaultSeed), 211, { campaign: true });
  const s = run.state;
  const verdicts = [...s.chapter.past, ...(s.chapter.result ? [s.chapter.result] : [])];

  it('wins every chapter, on schedule and solvent', () => {
    expect(verdicts.map((v) => [v.chapter, v.outcome, v.day])).toEqual([
      [1, 'won', 30],
      [2, 'won', 90],
      [3, 'won', 150],
      [4, 'won', 210],
    ]);
    expect(run.minCash).toBeGreaterThan(0);
    expect(reconcile(s).ok).toBe(true);
  });

  it('chapter 3: premium residents live only in villas on the bought land', () => {
    expect(s.site.width).toBe(EXPANDED_WIDTH);
    const premium = s.residents.filter((r) => r.premium);
    expect(premium.length).toBeGreaterThanOrEqual(4);
    for (const r of s.residents) {
      const room = s.site.rooms.find((x) => x.id === parseBedId(r.bedId).roomId)!;
      expect(room.type).toBe(r.premium ? 'villa' : 'ward');
    }
    expect(verdicts[2].checks.find((c) => c.id === 'premium_sat')!.ok).toBe(true);
  });

  it('chapter 4: visits go out by van with qualified staff, are billed per visit, and staff on a visit leave the map', () => {
    expect(s.homecare.clients.length).toBeGreaterThanOrEqual(12);
    expect(visitRate(s)).toBeGreaterThan(0.9);
    for (const v of s.homecare.visits.filter((x) => x.assigneeId)) {
      const e = s.employees.find((x) => x.id === v.assigneeId);
      if (e) expect(e.skills).toContain(v.skill);
    }
    const hcInvoices = s.invoices.filter((i) => i.kind === 'homecare');
    expect(hcInvoices.length).toBeGreaterThan(0);
    for (const i of hcInvoices) for (const l of i.lines) expect(l.amountSatang).toBe(l.qty * l.unitSatang);
    // Find a moment with someone out on a visit and check the map leaves them out.
    let g = s;
    for (let i = 0; i < TICKS_PER_DAY && !g.employees.some((e) => e.taskId?.startsWith('visit-')); i++) g = step(g);
    const away = g.employees.filter((e) => e.taskId?.startsWith('visit-')).map((e) => e.id);
    expect(away.length).toBeGreaterThan(0);
    expect(peopleMarkers(g).some((m) => away.includes(m.key))).toBe(false);
  });
});

describe('chapter 3 rules', () => {
  it('the first plot is bought from chapter 3 and keeps every corridor tile in place', () => {
    expect(applyCommand(inChapter(2), { type: 'expandLot' }).result).toMatchObject({ ok: false, reason: 'chapter_locked' });
    const before = inChapter(3);
    const after = ok(before, { type: 'expandLot' });
    expect(after.site.width).toBe(EXPANDED_WIDTH);
    expect(after.organization.cashSatang).toBe(before.organization.cashSatang - LAND_PRICE);
    for (let y = 0; y < before.site.height; y++)
      for (let x = 0; x < before.site.width; x++) expect(after.site.corridor[cellIndex(x, y, EXPANDED_WIDTH)]).toBe(before.site.corridor[cellIndex(x, y, before.site.width)]);
    // The next plot down the street goes on sale in chapter 4.
    expect(applyCommand(after, { type: 'expandLot' }).result).toMatchObject({ ok: false, reason: 'chapter_locked' });
    expect(reconcile(after).ok).toBe(true);
  });

  it('villas unlock in chapter 3 and take only premium residents', () => {
    expect(applyCommand(inChapter(2), { type: 'placeRoom', roomType: 'villa', rect: { x: 14, y: 1, w: 3, h: 3 } }).result).toMatchObject({ reason: 'chapter_locked' });
    let [s, villa] = withVilla(inChapter(3));
    // A premium family can't take a ward bed, even with ward beds free…
    const noVilla = applyCommand({ ...inChapter(3), waitlist: [premiumCandidate('p0')] }, { type: 'admitResident', candidateId: 'p0' });
    expect(noVilla.result).toMatchObject({ ok: false, reason: 'no_free_bed' });
    // …but takes the villa and pays the villa fee.
    s = ok({ ...s, waitlist: [premiumCandidate('p1')] }, { type: 'admitResident', candidateId: 'p1' });
    const r = s.residents.find((x) => x.premium)!;
    expect(parseBedId(r.bedId).roomId).toBe(villa);
    expect(s.invoices.at(-1)!.totalSatang).toBeGreaterThan(4_000_000);
  });

  it('premium families grow unhappy without a garden and stay content with a lovely one', () => {
    const [base] = withVilla(inChapter(3));
    let plain = ok({ ...base, waitlist: [premiumCandidate('p1')] }, { type: 'admitResident', candidateId: 'p1' });
    [plain] = hire(plain, 'rn', ['morning']);
    plain = ok(plain, { type: 'createCarePlan', residentId: plain.residents[0].id });
    let lush = plain;
    for (const [i, type] of (['gazebo', 'gazebo', 'fountain', 'fountain', 'gazebo'] as const).entries()) lush = ok(lush, { type: 'placeDecor', decor: type, cell: NEW_LAND.garden[i] });
    const a = advance(plain, TICKS_PER_DAY * 10).residents[0].needs.satisfaction;
    const b = advance(lush, TICKS_PER_DAY * 10).residents[0].needs.satisfaction;
    expect(b).toBeGreaterThan(a + 5);
  });
});

describe('chapter 4 rules (home care)', () => {
  it('clients need an open Home Care centre with a van', () => {
    const s = addLeads(inChapter(4), ['caregiver']);
    expect(applyCommand(s, { type: 'admitClient', leadId: 'lead-t0' }).result).toMatchObject({ ok: false, reason: 'no_homecare_office' });
    expect(applyCommand(inChapter(3), { type: 'placeRoom', roomType: 'homecare_office', rect: { x: 14, y: 1, w: 3, h: 3 } }).result).toMatchObject({ reason: 'chapter_locked' });
  });

  it('one van takes one visit out at a time; a done visit is billed at midnight', () => {
    let [s] = withOffice(inChapter(4), 1);
    [s] = hire(s, 'caregiver', ['morning']);
    [s] = hire(s, 'caregiver', ['morning']);
    s = addLeads(s, ['caregiver', 'caregiver']);
    s = ok(ok(s, { type: 'admitClient', leadId: 'lead-t0' }), { type: 'admitClient', leadId: 'lead-t1' });
    // Both get distinct slots (the first two appointment times): run to the first and see one van out.
    while (s.minute % 1440 !== VISIT_SLOTS[0] + 10) s = step(s);
    expect(s.homecare.visits.filter((v) => v.status === 'in_progress')).toHaveLength(1);
    s = advance(s, (VISIT_DURATION + 120) / 10);
    expect(s.homecare.visits.filter((v) => v.status === 'done')).toHaveLength(2);
    const before = s.invoices.length;
    while (s.minute % 1440 !== 10) s = step(s);
    const bills = s.invoices.slice(before).filter((i) => i.kind === 'homecare');
    expect(bills).toHaveLength(2);
    expect(bills[0].totalSatang).toBe(VISIT_PRICE.caregiver);
    expect(reconcile(s).ok).toBe(true);
  });

  it('missed visits lower satisfaction until the family cancels', () => {
    let [s] = withOffice(inChapter(4), 1);
    s = addLeads(s, ['nurse']);
    s = ok(s, { type: 'admitClient', leadId: 'lead-t0' }); // nobody can do nurse visits: no PN/RN on shift
    for (let d = 0; d < 6 && s.homecare.clients.length; d++) s = advance(s, TICKS_PER_DAY);
    expect(s.homecare.clients).toHaveLength(0);
    expect(s.homecare.history.some((h) => h.missed > 0)).toBe(true);
    expect(s.log.some((l) => l.key === 'log.client_cancelled')).toBe(true);
    expect(CHURN_SATISFACTION).toBeGreaterThan(0);
  });

  it('a visit only goes to someone with the skill and on shift', () => {
    let [s] = withOffice(inChapter(4), 1);
    [s] = hire(s, 'caregiver', ['morning']);
    s = addLeads(s, ['nurse']);
    s = ok(s, { type: 'admitClient', leadId: 'lead-t0' });
    while (s.minute % 1440 !== 8 * 60 + 30) s = step(s);
    expect(homecareTick(s).homecare.visits.every((v) => v.status !== 'in_progress')).toBe(true);
  });

  it('schema-6 saves migrate with empty home care', () => {
    const { homecare: _h, ...rest } = inChapter(2);
    void _h;
    const res = validate({ ...rest, schemaVersion: 6 } as unknown as GameState);
    expect(res.ok && res.state.homecare).toEqual(emptyHomecare());
  });

  it('every chapter 3 and 4 step has text in Thai and English', () => {
    for (const id of [3, 4])
      for (const g of buildObjectives(inChapter(id)))
        for (const lang of ['th', 'en'] as const) {
          expect(DICTS[lang][g.key], g.key).toBeTruthy();
          expect(DICTS[lang][g.hint], g.hint).toBeTruthy();
        }
  });
});
