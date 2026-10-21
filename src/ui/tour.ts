import { rectCells } from '../domain/grid';
import { validateCorridor, validateRoomPlacement } from '../domain/rules/placement';
import type { Cell, GameState, Rect, RoomType, ShiftSlot, StaffRole } from '../domain/types';
import { SHIFT_SLOTS, SKILL_OWNER } from '../data/staff';
import { validateShift } from '../domain/rules/shifts';
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
      return { targets: ['hire-rn', 'tab-hire', 'm-hire', 'nav-manage'], hint: null };
    case 'admit':
      return { targets: ['admit', 'tab-admit', 'nav-manage'], hint: null };
    case 'care_plan':
      return { targets: ['create-plan', 'view-residents', 'nav-residents'], hint: null };
    case 'roster': {
      // Every shift must be ready: its short roles filled, its missing skills and RN covered, and
      // somebody on it at all. Ring a "+" for a role someone can still take (that shift's tab on
      // phones), or send the player to hire when nobody can.
      const view = rosterView(c.game);
      const wanted: Array<{ role: StaffRole; slot: ShiftSlot }> = [];
      for (const sl of view.slots) {
        if (sl.ready && sl.staffCount > 0) continue;
        const roles = new Set<StaffRole>(view.cells.filter((x) => x.slot === sl.slot && x.staff.length < x.need).map((x) => x.role));
        for (const skill of sl.missingSkills) roles.add(SKILL_OWNER[skill]);
        if (sl.missingRn) roles.add('rn');
        if (!roles.size) roles.add('caregiver');
        for (const role of roles) wanted.push({ role, slot: sl.slot });
      }
      const canTake = (role: StaffRole, slot: ShiftSlot) => c.game.employees.some((e) => e.role === role && !e.placement && validateShift(c.game, e.id, SHIFT_SLOTS[slot]).ok);
      const fillable = wanted.filter((w) => canTake(w.role, w.slot));
      // Nobody can take the open shifts: hire first (the roles that are missing).
      if (wanted.length && !fillable.length) {
        const hireable = [...new Set(wanted.map((w) => w.role))].filter((role) => c.game.applicants.some((a) => a.role === role));
        // No applicant for the missing role yet: new ones come every day, so let time run.
        if (!hireable.length) return { targets: ['speed-1', 'speed-2'], hint: null };
        return { targets: [...hireable.map((role) => `hire-${role}`), 'tab-hire', 'm-hire', 'nav-manage'], hint: null };
      }
      // Phones show one shift at a time: the shift's tab comes after its cells.
      return { targets: ['roster-pick', ...fillable.map((w) => `roster-add-${w.role}-${w.slot}`), ...new Set(fillable.map((w) => `roster-slot-${w.slot}`)), 'view-roster', 'nav-roster'], hint: null };
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

/**
 * One plain sentence for the coach bubble beside the ring: what to tap next for this step.
 * Build steps say "tap the build button", then "tap the glowing tiles to place it", then
 * "tap the glowing room" (to buy its equipment), following the pointer.
 */
export function coachLine(goal: Objective | null, c: TourCtx, p: TourPointer): string | null {
  if (!goal) return null;
  const build: Partial<Record<string, RoomType>> = { ward: 'ward', beds: 'ward', station: 'nursing_station', therapy: 'therapy', staff_room: 'staff_room' };
  const type = build[goal.id];
  if (goal.id === 'corridor') return p.targets.length ? 'coach.corridor' : 'coach.corridor_draw';
  if (type) {
    const room = c.game.site.rooms.find((r) => r.type === type);
    if (!room) return p.targets.length ? `coach.build_${type}` : 'coach.place';
    if (c.selectedRoomId !== room.id) return 'coach.tap_room';
    return 'coach.equip';
  }
  if (goal.id === 'roster' && p.targets[0] === 'speed-1') return 'coach.wait_applicants';
  if (goal.id === 'roster' && p.targets.some((t) => t.startsWith('hire-'))) return 'coach.hire_more';
  return p.targets.length ? `coach.${goal.id}` : null;
}
