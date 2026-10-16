import { MEAL_TIMES, SELF_MEAL_NUTRITION, selfFeeds } from '../../data/patients';
import { minuteOfDay } from '../../domain/rules/shifts';
import type { CareGroup, GameState, NeedKey, Needs, Resident } from '../../domain/types';
import { clamp, r2 } from '../helpers';

/** Per-tick decay rates (fictional balancing). */
const MOBILITY_DECAY: Record<CareGroup, number> = { active_aging: 0.01, stroke_rehab: 0.04, bedridden: 0.03 };

export function applyNeedDelta(needs: Needs, delta: Partial<Record<NeedKey, number>>, scale = 1): Needs {
  const out = { ...needs };
  for (const [k, v] of Object.entries(delta) as [NeedKey, number][]) out[k] = r2(clamp(out[k] + v * scale));
  return out;
}

/** Wellbeing: mean of all needs except satisfaction. */
export function wellbeing(n: Needs): number {
  return (n.physical + n.mobility + n.mental + n.happiness + n.nutrition) / 5;
}

function decayResident(r: Resident, minute: number): Resident {
  const n = r.needs;
  const lvl = r.careLevel;
  const d: Partial<Record<NeedKey, number>> = {
    nutrition: -0.35,
    physical: -(0.04 + 0.04 * lvl) - (n.nutrition < 30 ? 0.1 : 0),
    mobility: -MOBILITY_DECAY[r.group],
    mental: -0.05,
    happiness: -0.07,
  };
  if (!r.carePlan) {
    // Without a care plan residents feel unattended.
    d.happiness! -= 0.05;
    d.satisfaction = -0.08;
  }
  let needs = applyNeedDelta(n, d);
  // Satisfaction drifts slowly toward overall wellbeing.
  needs = { ...needs, satisfaction: r2(clamp(needs.satisfaction + (wellbeing(needs) - needs.satisfaction) * 0.004)) };
  // Independent residents eat at meal times on their own (kitchen is abstract).
  if (selfFeeds(r.group, lvl) && MEAL_TIMES.includes(minuteOfDay(minute))) needs = applyNeedDelta(needs, { nutrition: SELF_MEAL_NUTRITION });
  return { ...r, needs };
}

export function needsTick(state: GameState): GameState {
  if (state.residents.length === 0) return state;
  return { ...state, residents: state.residents.map((r) => decayResident(r, state.minute)) };
}
