import { advance } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { reconcile } from '../domain/rules/ledger';
import { dailyUpkeep } from '../sim/systems/finance';
import { TICKS_PER_DAY } from '../sim/constants';
import { run, SPINE } from './helpers';
import type { Command } from '../sim/engine';

const BUILD: Command[] = [
  ...SPINE,
  { type: 'placeRoom', roomType: 'ward', rect: { x: 2, y: 5, w: 4, h: 5 } },
  { type: 'placeRoom', roomType: 'nursing_station', rect: { x: 10, y: 7, w: 3, h: 3 } },
];

describe('determinism and ledger', () => {
  it('advancing 30 days twice from the same seed gives identical state', () => {
    const a = advance(run(createInitialState(99), BUILD), TICKS_PER_DAY * 30);
    const b = advance(run(createInitialState(99), BUILD), TICKS_PER_DAY * 30);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('charges upkeep once per day and the ledger reconciles', () => {
    const built = run(createInitialState(1), BUILD);
    const upkeep = dailyUpkeep(built);
    const after = advance(built, TICKS_PER_DAY * 30);
    const entries = after.ledger.filter((e) => e.category === 'upkeep');
    expect(entries).toHaveLength(30);
    expect(new Set(entries.map((e) => e.ref)).size).toBe(30); // never double-charged for a day
    expect(after.organization.cashSatang).toBe(built.organization.cashSatang - upkeep * 30);
    expect(reconcile(after).ok).toBe(true);
    for (const e of after.ledger) expect(Number.isInteger(e.amountSatang)).toBe(true);
  });

  it('state survives a JSON round-trip unchanged (save-ready)', () => {
    const s = advance(run(createInitialState(5), BUILD), 500);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
