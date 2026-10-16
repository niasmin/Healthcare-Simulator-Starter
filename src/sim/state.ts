import { STARTER_SCENARIO, type ScenarioDef } from '../data/scenarios';
import { cellIndex } from '../domain/grid';
import type { GameState } from '../domain/types';
import { MINUTES_PER_DAY, START_MINUTE } from './constants';
import { post } from './helpers';
import { seedToState } from './rng';

export function createInitialState(seed: number = STARTER_SCENARIO.defaultSeed, scenario: ScenarioDef = STARTER_SCENARIO): GameState {
  const { gridWidth: width, gridHeight: height, entrance } = scenario;
  const corridor = new Array<number>(width * height).fill(0);
  corridor[cellIndex(entrance.x, entrance.y, width)] = 1;
  const base: GameState = {
    schemaVersion: 1,
    seed,
    rngState: seedToState(seed),
    minute: START_MINUTE,
    speed: 0,
    nextId: 1,
    nextSeq: 1,
    organization: {
      id: 'org-1',
      name: scenario.orgName,
      type: 'nursing_home',
      cashSatang: 0,
      reputation: 50,
    },
    site: { id: 'site-1', organizationId: 'org-1', width, height, entrance: { ...entrance }, corridor, rooms: [] },
    ledger: [],
    // First day-end fires at the next midnight.
    queue: [{ at: Math.ceil((START_MINUTE + 1) / MINUTES_PER_DAY) * MINUTES_PER_DAY, seq: 0, kind: 'day_end' }],
    log: [],
  };
  return post(base, scenario.startingCashSatang, 'capital', 'ledger.capital');
}
