import { applyCommand, step } from './engine';
import { buildSomewhere } from './autoBuild';
import { buyLand } from './autoCampaign';
import { newGameState } from './modes';
import { makeResidentCandidate } from './systems/staffing';
import { RIVALS, rivalStats, type RivalDef } from './rivalStats';
import type { GameState } from '../domain/types';

/** Visits to rival homes (their numbers and the town ranking live in rivalStats, free of the engine). */
export * from './rivalStats';

/** The ready-made rooms a rival of this style and size has, in building order. */
export function rivalPlan(r: RivalDef, beds: number): string[] {
  const plan: string[] = [];
  if (r.style === 'premium') {
    plan.push('ward10');
    for (let b = 10; b < beds; b += 2) plan.push('villa');
    plan.push('dining', 'reception');
  } else {
    for (let b = 0; b < beds; b += r.style === 'value' ? 15 : 10) plan.push(r.style === 'value' ? 'ward15' : 'ward10');
    if (r.style === 'rehab') plan.push('therapy', 'bathroom');
    if (r.style === 'standard') plan.push('dining', 'laundry');
    if (r.style === 'value') plan.push('laundry');
  }
  return plan.slice(0, 8);
}

/**
 * A look-alike of a rival's home for the visit view: the starter campus plus its rooms, with
 * residents and staff moved in for a few hours so the map is lived in. Pure and repeatable.
 */
export function rivalSite(r: RivalDef, day: number): GameState {
  const stats = rivalStats(r, day);
  let s = newGameState('starter', 'sandbox', undefined, 1000 + RIVALS.indexOf(r));
  s = { ...s, organization: { ...s.organization, name: r.name.th } };
  for (const prefab of rivalPlan(r, stats.beds)) {
    let built = buildSomewhere(s, applyCommand, prefab);
    if (!built) {
      s = buyLand(s, applyCommand);
      built = buildSomewhere(s, applyCommand, prefab);
    }
    if (built) s = built.state;
  }
  // Families waiting to move in, about as many as the rival has residents.
  for (let i = s.waitlist.length; i < stats.residents; i++) s = makeResidentCandidate(s, r.style === 'premium' && i % 2 ? { group: 'active_aging', premium: true } : undefined);
  s = { ...s, auto: { admit: true, staff: true, carePlan: true, events: true } };
  for (let i = 0; i < 18; i++) s = step(s);
  return s;
}
