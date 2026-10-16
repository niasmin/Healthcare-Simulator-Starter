import { applyCommand } from '../sim/engine';
import { createInitialState } from '../sim/state';
import { reconcile } from '../domain/rules/ledger';
import { roomConstructionCost, CORRIDOR_COST_PER_TILE, REFUND_PERCENT } from '../data/rooms';
import { thb } from '../domain/money';
import { ok } from './helpers';

const WARD = { x: 2, y: 2, w: 4, h: 5 };

describe('room placement', () => {
  it('deducts construction cost exactly once with one ledger entry', () => {
    const s0 = createInitialState(1);
    const out = applyCommand(s0, { type: 'placeRoom', roomType: 'ward', rect: WARD });
    expect(out.result.ok).toBe(true);
    const cost = roomConstructionCost('ward', WARD);
    expect(cost).toBe(thb(50_000 + 12_000 * 20));
    expect(out.state.organization.cashSatang).toBe(s0.organization.cashSatang - cost);
    const entries = out.state.ledger.filter((e) => e.category === 'construction');
    expect(entries).toHaveLength(1);
    expect(entries[0].amountSatang).toBe(-cost);
    expect(entries[0].ref).toBe(out.state.site.rooms[0].id);
    expect(reconcile(out.state).ok).toBe(true);
  });

  it('does not mutate the input state', () => {
    const s0 = createInitialState(1);
    const snapshot = JSON.stringify(s0);
    applyCommand(s0, { type: 'placeRoom', roomType: 'ward', rect: WARD });
    expect(JSON.stringify(s0)).toBe(snapshot);
  });

  it('rejects collisions with existing rooms and charges nothing', () => {
    const s1 = ok(createInitialState(1), { type: 'placeRoom', roomType: 'ward', rect: WARD });
    const out = applyCommand(s1, { type: 'placeRoom', roomType: 'staff_room', rect: { x: 5, y: 6, w: 2, h: 2 } });
    expect(out.result).toMatchObject({ ok: false, reason: 'overlap' });
    expect(out.state).toBe(s1);
  });

  it('rejects rooms over corridor tiles', () => {
    const s1 = ok(createInitialState(1), { type: 'paintCorridor', rect: { x: 3, y: 3, w: 1, h: 1 } });
    const out = applyCommand(s1, { type: 'placeRoom', roomType: 'ward', rect: WARD });
    expect(out.result).toMatchObject({ ok: false, reason: 'overlap' });
  });

  it('rejects rooms over the entrance', () => {
    const out = applyCommand(createInitialState(1), { type: 'placeRoom', roomType: 'staff_room', rect: { x: 8, y: 18, w: 2, h: 2 } });
    expect(out.result).toMatchObject({ ok: false, reason: 'overlap' });
  });

  it('rejects out-of-bounds, too small and too large footprints', () => {
    const s = createInitialState(1);
    expect(applyCommand(s, { type: 'placeRoom', roomType: 'ward', rect: { x: 18, y: 0, w: 3, h: 3 } }).result).toMatchObject({ reason: 'out_of_bounds' });
    expect(applyCommand(s, { type: 'placeRoom', roomType: 'ward', rect: { x: 0, y: 0, w: 1, h: 6 } }).result).toMatchObject({ reason: 'too_small' });
    expect(applyCommand(s, { type: 'placeRoom', roomType: 'therapy', rect: { x: 0, y: 0, w: 2, h: 6 } }).result).toMatchObject({ reason: 'too_small' });
    expect(applyCommand(s, { type: 'placeRoom', roomType: 'staff_room', rect: { x: 0, y: 0, w: 4, h: 4 } }).result).toMatchObject({ reason: 'too_large' });
  });

  it('rejects construction the player cannot afford', () => {
    let s = createInitialState(1);
    s = { ...s, organization: { ...s.organization, cashSatang: thb(1000) } };
    expect(applyCommand(s, { type: 'placeRoom', roomType: 'ward', rect: WARD }).result).toMatchObject({ reason: 'insufficient_funds' });
  });

  it('demolishing refunds the configured percentage once and frees the cells', () => {
    const s1 = ok(createInitialState(1), { type: 'placeRoom', roomType: 'ward', rect: WARD });
    const roomId = s1.site.rooms[0].id;
    const s2 = ok(s1, { type: 'bulldoze', cell: { x: 3, y: 4 } });
    expect(s2.site.rooms).toHaveLength(0);
    const refund = s2.ledger.filter((e) => e.category === 'refund');
    expect(refund).toHaveLength(1);
    expect(refund[0].ref).toBe(roomId);
    expect(refund[0].amountSatang).toBe((roomConstructionCost('ward', WARD) * REFUND_PERCENT) / 100);
    expect(reconcile(s2).ok).toBe(true);
    // Cells are free again
    expect(applyCommand(s2, { type: 'placeRoom', roomType: 'ward', rect: WARD }).result.ok).toBe(true);
  });
});

describe('corridor painting', () => {
  it('charges only for new tiles and skips existing corridor', () => {
    const s0 = createInitialState(1);
    const s1 = ok(s0, { type: 'paintCorridor', rect: { x: 9, y: 15, w: 1, h: 5 } }); // includes entrance (already corridor)
    expect(s0.organization.cashSatang - s1.organization.cashSatang).toBe(CORRIDOR_COST_PER_TILE * 4);
    const again = applyCommand(s1, { type: 'paintCorridor', rect: { x: 9, y: 15, w: 1, h: 5 } });
    expect(again.result).toMatchObject({ ok: false, reason: 'nothing_to_build' });
  });

  it('rejects corridor strokes across rooms', () => {
    const s1 = ok(createInitialState(1), { type: 'placeRoom', roomType: 'ward', rect: WARD });
    expect(applyCommand(s1, { type: 'paintCorridor', rect: { x: 0, y: 4, w: 10, h: 1 } }).result).toMatchObject({ reason: 'overlap' });
  });

  it('the entrance cannot be bulldozed', () => {
    const s = createInitialState(1);
    expect(applyCommand(s, { type: 'bulldoze', cell: { ...s.site.entrance } }).result).toMatchObject({ reason: 'cannot_remove_entrance' });
  });
});
