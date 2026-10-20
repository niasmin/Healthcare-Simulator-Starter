import { applyCommand, step } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { reconcile } from '../domain/rules/ledger';
import { parseBedId } from '../domain/rules/beds';
import { STARTER_SCENARIO } from '../data/scenarios';
import { CONSULT_FEE, CONSULT_GRACE, CONSULT_SLOTS, IPD_FEE_PER_DAY, NURSE_ROUNDS } from '../data/hospital';
import { summarizeBeds } from '../sim/bedsSummary';
import { buildObjectives, peopleMarkers } from '../sim/selectors';
import { hospitalDayEnd, strokeBeds } from '../sim/systems/hospital';
import { MINUTES_PER_DAY } from '../sim/constants';
import { validate } from '../storage/format';
import type { GameState, IpdReferral } from '../domain/types';
import { HOSPITAL, playthrough } from './bot';
import { buildHome, hire, ok, quietEvents } from './helpers';

/** A chapter 6 home with a 2-desk neuro clinic and a 6-bed stroke unit. */
function hospitalHome(seed = 8): GameState {
  let s = quietEvents(buildHome(createInitialState(seed)));
  // A good name fills every booking (below 60 only 4 of the 6 per desk).
  s = { ...s, chapter: { id: 6, startDay: 1, result: null, past: [] }, organization: { ...s.organization, reputation: 70 } };
  s = ok(s, { type: 'placePrefab', prefab: 'clinic', origin: HOSPITAL.clinic });
  return ok(s, { type: 'placePrefab', prefab: 'stroke', origin: HOSPITAL.stroke });
}

function until(s: GameState, mod: number): GameState {
  do s = step(s);
  while (s.minute % MINUTES_PER_DAY !== mod);
  return s;
}

const referral = (partial: Partial<IpdReferral> = {}): IpdReferral => ({ id: 'ref-t1', name: { th: 'ผู้ป่วยทดสอบ', en: 'Test Patient' }, age: 70, stayDays: 2, expiresDay: 99, ...partial });
const withReferral = (s: GameState, r: IpdReferral): GameState => ({ ...s, hospital: { ...s.hospital, referrals: [...s.hospital.referrals, r] } });

describe('the full campaign: chapters 1–6 in 330 days (scripted careful player)', () => {
  const run = playthrough(createInitialState(STARTER_SCENARIO.defaultSeed), 331, { campaign: true });
  const s = run.state;
  const verdicts = [...s.chapter.past, ...(s.chapter.result ? [s.chapter.result] : [])];

  it('wins chapter 6 on schedule, solvent, with the ledger intact', () => {
    expect(verdicts.map((v) => [v.chapter, v.outcome, v.day])).toEqual([
      [1, 'won', 30],
      [2, 'won', 90],
      [3, 'won', 150],
      [4, 'won', 210],
      [5, 'won', 270],
      [6, 'won', 330],
    ]);
    expect(run.minCash).toBeGreaterThan(0);
    expect(reconcile(s).ok).toBe(true);
  });

  it('bills consultations and stays exactly, keeps inpatients in stroke-unit beds, and keeps those beds out of the home', () => {
    for (const i of s.invoices.filter((x) => x.kind === 'opd')) for (const l of i.lines) expect(l.amountSatang).toBe(l.qty * CONSULT_FEE);
    for (const i of s.invoices.filter((x) => x.kind === 'ipd')) for (const l of i.lines) expect(l.amountSatang).toBe(l.qty * IPD_FEE_PER_DAY);
    expect(s.invoices.some((x) => x.kind === 'ipd')).toBe(true);
    const beds = s.hospital.inpatients.map((p) => p.bedId);
    expect(new Set(beds).size).toBe(beds.length);
    for (const b of beds) expect(s.site.rooms.find((r) => r.id === parseBedId(b).roomId)!.type).toBe('stroke_unit');
    for (const r of s.residents) expect(s.site.rooms.find((x) => x.id === parseBedId(r.bedId).roomId)!.type).not.toBe('stroke_unit');
    const home = s.site.rooms.filter((r) => r.type === 'ward' || r.type === 'villa').reduce((a, r) => a + (r.equipment.care_bed ?? 0), 0);
    expect(summarizeBeds(s)).toBe(home);
    // Doctors only ever do doctors' work.
    for (const t of s.hospital.tasks.filter((x) => x.assigneeId)) {
      const e = s.employees.find((x) => x.id === t.assigneeId);
      if (e) expect(e.skills).toContain(t.skill);
    }
    for (const t of s.tasks.filter((x) => x.assigneeId)) expect(s.employees.find((e) => e.id === t.assigneeId)?.role).not.toBe('doctor');
  });
});

describe('chapter 6: the clinic', () => {
  it('rooms unlock in chapter 6', () => {
    const s = quietEvents(buildHome(createInitialState(8)));
    expect(applyCommand(s, { type: 'placePrefab', prefab: 'clinic', origin: HOSPITAL.clinic }).result).toMatchObject({ ok: false, reason: 'chapter_locked' });
  });

  it('books 6 appointments per desk from the next day, only once a doctor is on the staff', () => {
    let s = hospitalHome();
    s = hospitalDayEnd(s, 1, MINUTES_PER_DAY);
    expect(s.hospital.tasks.filter((t) => t.kind === 'consult')).toHaveLength(0);
    [s] = hire(s, 'doctor', ['morning']);
    s = hospitalDayEnd(s, 1, MINUTES_PER_DAY);
    const consults = s.hospital.tasks.filter((t) => t.kind === 'consult');
    expect(consults).toHaveLength(2 * CONSULT_SLOTS.length);
    // A lower reputation books fewer.
    const low = hospitalDayEnd({ ...hospitalHome(), organization: { ...s.organization, reputation: 40 }, employees: s.employees, shifts: s.shifts }, 1, MINUTES_PER_DAY);
    expect(low.hospital.tasks.filter((t) => t.kind === 'consult')).toHaveLength(2 * 4);
  });

  it('a doctor on shift sees patients at free desks; without one they leave after the grace period', () => {
    let s = hospitalHome();
    let doc: string;
    [s, doc] = hire(s, 'doctor', ['morning']);
    s = until(s, 0);
    s = until(s, CONSULT_SLOTS[0] + 10);
    const e = s.employees.find((x) => x.id === doc)!;
    expect(s.hospital.tasks.find((t) => t.id === e.taskId)?.kind).toBe('consult');
    const clinic = s.site.rooms.find((r) => r.type === 'neuro_clinic')!;
    expect(peopleMarkers(s).find((m) => m.key === doc)?.roomId).toBe(clinic.id);
    s = until(s, 16 * 60);
    // One doctor, two desks: about half the morning's bookings are seen, the rest leave.
    expect(s.hospital.today.consults).toBeGreaterThan(0);
    expect(s.hospital.today.missed).toBeGreaterThan(0);
    expect(s.hospital.today.consults + s.hospital.today.missed).toBe(2 * CONSULT_SLOTS.length);
    s = until(s, 0);
    const inv = s.invoices.filter((i) => i.kind === 'opd');
    expect(inv).toHaveLength(1);
    expect(inv[0].totalSatang).toBe(s.hospital.history[s.hospital.history.length - 1].consults * CONSULT_FEE);
    expect(reconcile(s).ok).toBe(true);
  });

  it('two doctors never run more consultations at once than there are desks', () => {
    let s = hospitalHome();
    [s] = hire(s, 'doctor', ['morning']);
    [s] = hire(s, 'doctor', ['morning']);
    [s] = hire(s, 'doctor', ['morning']);
    s = until(s, 0);
    for (let i = 0; i < 40; i++) {
      s = step(s);
      expect(s.hospital.tasks.filter((t) => t.kind === 'consult' && t.status === 'in_progress').length).toBeLessThanOrEqual(2);
    }
    expect(CONSULT_GRACE).toBeGreaterThan(0);
  });
});

describe('chapter 6: the stroke unit', () => {
  it('admits a referral to a free stroke bed and plans its rounds', () => {
    let s = withReferral(hospitalHome(), referral());
    s = until(s, 0);
    s = ok(s, { type: 'admitInpatient', referralId: 'ref-t1' });
    const p = s.hospital.inpatients[0];
    expect(strokeBeds(s)).toContain(p.bedId);
    expect(s.hospital.tasks.filter((t) => t.patientId === p.id && t.kind === 'nurse_round')).toHaveLength(NURSE_ROUNDS.length - 0);
    expect(s.hospital.tasks.filter((t) => t.patientId === p.id && t.kind === 'doctor_round')).toHaveLength(1);
    expect(peopleMarkers(s).find((m) => m.key === p.id)?.roomId).toBe(parseBedId(p.bedId).roomId);
  });

  it('refuses when every stroke bed is taken', () => {
    let s = hospitalHome();
    const beds = strokeBeds(s);
    for (let i = 0; i < beds.length; i++) s = ok(withReferral(s, referral({ id: `ref-${i}` })), { type: 'admitInpatient', referralId: `ref-${i}` });
    s = withReferral(s, referral({ id: 'ref-x' }));
    expect(applyCommand(s, { type: 'admitInpatient', referralId: 'ref-x' }).result).toMatchObject({ ok: false, reason: 'no_stroke_bed' });
  });

  it('a stay with rounds done goes home as planned and is billed for its days; unstaffed rounds end in a complicated stay', () => {
    let s = withReferral(hospitalHome(), referral({ stayDays: 2 }));
    [s] = hire(s, 'pn', ['morning']);
    [s] = hire(s, 'pn', ['afternoon']);
    [s] = hire(s, 'pn', ['night']);
    [s] = hire(s, 'doctor', ['morning']);
    s = until(s, 0);
    s = ok(s, { type: 'admitInpatient', referralId: 'ref-t1' });
    s = until(s, 0);
    s = until(s, 0);
    expect(s.hospital.inpatients).toHaveLength(0);
    expect(s.hospital.discharged.map((d) => d.outcome)).toEqual(['recovered']);
    const ipd = s.invoices.filter((i) => i.kind === 'ipd');
    expect(ipd).toHaveLength(1);
    expect(ipd[0].totalSatang).toBe(2 * IPD_FEE_PER_DAY);

    let u = withReferral(hospitalHome(), referral({ stayDays: 2 }));
    u = until(u, 0);
    u = ok(u, { type: 'admitInpatient', referralId: 'ref-t1' });
    const rep = u.organization.reputation;
    u = until(until(u, 0), 0);
    expect(u.hospital.discharged.map((d) => d.outcome)).toEqual(['complicated']);
    expect(u.organization.reputation).toBeLessThan(rep);
    expect(reconcile(u).ok).toBe(true);
  });

  it('referrals left without a bed go elsewhere and cost a little reputation', () => {
    const s = withReferral(hospitalHome(), referral({ expiresDay: 1 }));
    const out = hospitalDayEnd(s, 1, MINUTES_PER_DAY);
    expect(out.hospital.referrals).toHaveLength(0);
    expect(out.organization.reputation).toBe(s.organization.reputation - 0.5);
  });
});

describe('chapter 6: tutorial and saves', () => {
  it('the guide walks from the doctor through clinic, stroke unit and the targets', () => {
    expect(buildObjectives(hospitalHome()).map((g) => g.id)).toEqual(['doctor', 'clinic', 'opd_first', 'stroke_unit', 'ipd_first', 'roster6', 'opd_visits', 'opd_rate', 'discharges', 'chapter']);
  });

  it('a version 8 save gains an empty hospital', () => {
    const { hospital: _h, ...rest } = createInitialState(3);
    const out = validate({ ...rest, schemaVersion: 8 } as unknown as GameState);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.state.hospital.inpatients).toEqual([]);
  });
});
