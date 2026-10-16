import { CORRIDOR_COST_PER_TILE, ROOMS, roomConstructionCost } from '../../data/rooms';
import { cellIndex, rectArea, rectCells, rectInBounds, rectsOverlap } from '../grid';
import type { Cell, GameState, Rect, ReasonCode, RoomType, Satang } from '../types';

export type PlacementCheck =
  | { ok: true; costSatang: Satang; cells: Cell[] }
  | { ok: false; reason: ReasonCode; costSatang: Satang; params?: Record<string, number> };

function occupiedByRoom(state: GameState, rect: Rect): boolean {
  return state.site.rooms.some((r) => rectsOverlap(r.rect, rect));
}

/** Validate a room footprint before construction. Pure — never mutates state. */
export function validateRoomPlacement(state: GameState, type: RoomType, rect: Rect): PlacementCheck {
  const { site, organization } = state;
  const def = ROOMS[type];
  const cost = roomConstructionCost(type, rect);
  if (!rectInBounds(rect, site.width, site.height)) return { ok: false, reason: 'out_of_bounds', costSatang: cost };
  const area = rectArea(rect);
  if (Math.min(rect.w, rect.h) < def.minSide || area < def.minArea)
    return { ok: false, reason: 'too_small', costSatang: cost, params: { minSide: def.minSide, minArea: def.minArea } };
  if (area > def.maxArea) return { ok: false, reason: 'too_large', costSatang: cost, params: { maxArea: def.maxArea } };
  if (occupiedByRoom(state, rect)) return { ok: false, reason: 'overlap', costSatang: cost };
  const cells = rectCells(rect);
  if (cells.some((c) => site.corridor[cellIndex(c.x, c.y, site.width)]))
    return { ok: false, reason: 'overlap', costSatang: cost };
  if (organization.cashSatang < cost) return { ok: false, reason: 'insufficient_funds', costSatang: cost };
  return { ok: true, costSatang: cost, cells };
}

/**
 * Validate painting corridor over a rectangle. Existing corridor tiles are skipped
 * (and not charged); any overlap with a room rejects the whole stroke.
 */
export function validateCorridor(state: GameState, rect: Rect): PlacementCheck {
  const { site, organization } = state;
  if (!rectInBounds(rect, site.width, site.height)) return { ok: false, reason: 'out_of_bounds', costSatang: 0 };
  if (occupiedByRoom(state, rect)) return { ok: false, reason: 'overlap', costSatang: 0 };
  const cells = rectCells(rect).filter((c) => !site.corridor[cellIndex(c.x, c.y, site.width)]);
  const cost = CORRIDOR_COST_PER_TILE * cells.length;
  if (cells.length === 0) return { ok: false, reason: 'nothing_to_build', costSatang: 0 };
  if (organization.cashSatang < cost) return { ok: false, reason: 'insufficient_funds', costSatang: cost };
  return { ok: true, costSatang: cost, cells };
}
