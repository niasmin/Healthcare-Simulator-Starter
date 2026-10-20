import { rectCells } from '../domain/grid';
import { validateCorridor, validateRoomPlacement } from '../domain/rules/placement';
import type { Cell, GameState, Rect, RoomType } from '../domain/types';
import { rosterView, type Objective } from '../sim/selectors';

/**
 * Pointers for the guided tutorial: which on-screen control to ring (by data-tour id, first
 * visible wins) and which map tiles to suggest, for the current Chapter 1 goal. Pure and
 * derived from game + UI state, like the goals themselves.
 */

export interface TourCtx {
  game: GameState;
  tool: { kind: string; roomType?: string };
  selectedRoomId: string | null;
}

export interface TourPointer {
  targets: string[];
  hint: Cell[] | null;
}

/** Suggested starter layout beside the main entrance (9,19). Hints only show while still buildable. */
export const SUGGEST: { corridor: Rect } & Partial<Record<RoomType, Rect>> = {
  corridor: { x: 9, y: 13, w: 1, h: 6 },
  ward: { x: 4, y: 13, w: 5, h: 4 },
  nursing_station: { x: 10, y: 13, w: 3, h: 3 },
  therapy: { x: 10, y: 16, w: 3, h: 3 },
  staff_room: { x: 7, y: 17, w: 2, h: 2 },
};

/** Validate as if cash were unlimited: the hint is about where, not whether you can afford it. */
function rich(game: GameState): GameState {
  return { ...game, organization: { ...game.organization, cashSatang: Number.MAX_SAFE_INTEGER } };
}

export function corridorHint(game: GameState): Cell[] | null {
  const v = validateCorridor(rich(game), SUGGEST.corridor);
  return v.ok && v.cells.length ? v.cells : null;
}

export function roomHint(game: GameState, type: RoomType): Cell[] | null {
  const rect = SUGGEST[type];
  return rect && validateRoomPlacement(rich(game), type, rect).ok ? rectCells(rect) : null;
}

/** Build a room: pick its tool, then place it (hint), then select it and buy equipment. */
function buildStep(c: TourCtx, type: RoomType, equipment: string[]): TourPointer {
  const room = c.game.site.rooms.find((r) => r.type === type);
  if (!room) {
    const picked = c.tool.kind === 'room' && c.tool.roomType === type;
    return picked ? { targets: [], hint: roomHint(c.game, type) } : { targets: [`tool-room-${type}`, 'm-build'], hint: null };
  }
  if (c.selectedRoomId === room.id) return { targets: [...equipment.map((e) => `equip-${e}`), 'm-info'], hint: null };
  return { targets: [], hint: rectCells(room.rect) };
}

export function tourPointer(goal: Objective | null, c: TourCtx): TourPointer {
  const none: TourPointer = { targets: [], hint: null };
  if (!goal) return none;
  switch (goal.id) {
    case 'corridor':
      return c.tool.kind === 'corridor' ? { targets: [], hint: corridorHint(c.game) } : { targets: ['tool-corridor', 'm-build'], hint: null };
    case 'ward': {
      const p = buildStep(c, 'ward', []);
      return { ...p, targets: p.targets.filter((t) => !t.startsWith('equip') && t !== 'm-info') };
    }
    case 'beds':
      return buildStep(c, 'ward', ['care_bed', 'call_system']);
    case 'station':
      return buildStep(c, 'nursing_station', ['nurse_desk', 'med_cart']);
    case 'therapy':
      return buildStep(c, 'therapy', ['exercise_mat', 'parallel_bars']);
    case 'staff_room':
      return buildStep(c, 'staff_room', ['lockers']);
    case 'hire_rn':
      return { targets: ['hire-rn', 'tab-hire', 'nav-manage'], hint: null };
    case 'admit':
      return { targets: ['admit', 'tab-admit', 'nav-manage'], hint: null };
    case 'care_plan':
      return { targets: ['create-plan', 'view-residents', 'nav-residents'], hint: null };
    case 'roster': {
      // Ring the first under-staffed role × shift cell (any visible one; phones show one shift).
      const short = rosterView(c.game).cells.filter((x) => x.staff.length < x.need);
      return { targets: ['roster-pick', ...short.map((x) => `roster-add-${x.role}-${x.slot}`), 'view-roster', 'nav-roster'], hint: null };
    }
    case 'run':
      return { targets: ['speed-1', 'speed-2'], hint: null };
    case 'fill':
      return { targets: ['admit', 'tab-admit', 'nav-manage'], hint: null };
    default:
      // Long goals (first payment, the 30-day chapter) need no pointer.
      return none;
  }
}
