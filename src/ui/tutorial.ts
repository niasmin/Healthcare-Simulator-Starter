import { rectCells } from '../domain/grid';
import { validateCorridor, validateRoomPlacement } from '../domain/rules/placement';
import type { Cell, GameState, Rect } from '../domain/types';
import { slotAt } from '../domain/rules/shifts';
import { summarize, type SiteSummary } from '../sim/selectors';

/**
 * Chapter 1 guided tutorial. Steps are derived from the game state, so the
 * tutorial always points at the next thing the player hasn't done yet — even
 * after loading a save. Info steps (no action) advance when acknowledged.
 */

export interface TutorialCtx {
  game: GameState;
  summary: SiteSummary;
  tool: { kind: string; roomType?: string };
  selectedRoomId: string | null;
  ack: ReadonlySet<string>;
}

export interface TutorialStep {
  id: string;
  /** Acknowledge-only step (shows a Next button). */
  info?: boolean;
  /** UI elements to spotlight, by data-tour id; the first one visible on screen is used. */
  targets: string[] | ((c: TutorialCtx) => string[]);
  done: (c: TutorialCtx) => boolean;
  /** Parameters for the step text (e.g. which room it names). */
  params?: Record<string, string>;
  /** Text variant for the current sub-stage (key suffix), e.g. place / select / equip. */
  variant?: (c: TutorialCtx) => string | undefined;
  /** Suggested tiles to highlight on the map. */
  hint?: (c: TutorialCtx) => Cell[] | null;
}

const ward = (c: TutorialCtx) => c.game.site.rooms.find((r) => r.type === 'ward');
const station = (c: TutorialCtx) => c.game.site.rooms.find((r) => r.type === 'nursing_station');
const operational = (c: TutorialCtx, id?: string) => !!id && !!c.summary.statuses.get(id)?.operational;
const toolIs = (c: TutorialCtx, roomType: string) => c.tool.kind === 'room' && c.tool.roomType === roomType;
const cellsOf = (r?: { rect: Rect }) => (r ? rectCells(r.rect) : null);

/** Suggested layout next to the main entrance (entrance at 9,19). Hints only show if still buildable. */
export const SUGGEST = {
  corridor: { x: 9, y: 13, w: 1, h: 6 } as Rect,
  ward: { x: 4, y: 13, w: 5, h: 4 } as Rect,
  station: { x: 10, y: 13, w: 3, h: 3 } as Rect,
};

function hintIfFree(c: TutorialCtx, kind: 'corridor' | 'ward' | 'nursing_station'): Cell[] | null {
  const g = { ...c.game, organization: { ...c.game.organization, cashSatang: Number.MAX_SAFE_INTEGER } };
  if (kind === 'corridor') {
    const v = validateCorridor(g, SUGGEST.corridor);
    return v.ok ? v.cells : null;
  }
  const rect = kind === 'ward' ? SUGGEST.ward : SUGGEST.station;
  return validateRoomPlacement(g, kind, rect).ok ? rectCells(rect) : null;
}

export const STEPS: TutorialStep[] = [
  { id: 'welcome', info: true, targets: [], done: (c) => c.ack.has('welcome') },
  {
    id: 'corridor_tool',
    targets: ['tool-corridor', 'm-build'],
    done: (c) => c.tool.kind === 'corridor' || c.summary.corridorTiles >= 6,
  },
  {
    id: 'corridor_draw',
    targets: ['map'],
    done: (c) => c.summary.corridorTiles >= 6,
    hint: (c) => hintIfFree(c, 'corridor'),
  },
  {
    id: 'ward_tool',
    params: { room: 'ward' },
    targets: ['tool-room-ward', 'm-build'],
    done: (c) => (c.tool.kind === 'room' && c.tool.roomType === 'ward') || !!ward(c),
  },
  {
    id: 'ward_draw',
    params: { room: 'ward' },
    targets: ['map'],
    done: (c) => !!ward(c) && !!c.summary.statuses.get(ward(c)!.id)?.door,
    hint: (c) => (ward(c) ? null : hintIfFree(c, 'ward')),
  },
  {
    id: 'ward_select',
    targets: ['map'],
    done: (c) => c.selectedRoomId === ward(c)?.id || operational(c, ward(c)?.id),
    hint: (c) => cellsOf(ward(c)),
  },
  {
    id: 'ward_equip',
    // Reached only while the ward is selected (deselecting returns to ward_select).
    targets: ['equip-care_bed', 'equip-call_system', 'm-info'],
    done: (c) => operational(c, ward(c)?.id) && (ward(c)?.equipment.care_bed ?? 0) >= 4,
  },
  {
    id: 'station',
    params: { room: 'nursing_station' },
    targets: (c) => {
      const st = station(c);
      if (!st) return toolIs(c, 'nursing_station') ? ['map'] : ['tool-room-nursing_station', 'm-build'];
      return c.selectedRoomId === st.id ? ['equip-nurse_desk', 'equip-med_cart', 'm-info'] : ['map'];
    },
    variant: (c) => {
      const st = station(c);
      if (!st) return toolIs(c, 'nursing_station') ? 'draw' : 'tool';
      return c.selectedRoomId === st.id ? 'equip' : 'select';
    },
    done: (c) => operational(c, station(c)?.id),
    hint: (c) => {
      const st = station(c);
      if (!st) return hintIfFree(c, 'nursing_station');
      return c.selectedRoomId === st.id ? null : cellsOf(st);
    },
  },
  { id: 'hire_rn', targets: ['hire-rn', 'tab-hire', 'nav-manage'], done: (c) => c.game.employees.some((e) => e.role === 'rn') },
  { id: 'hire_cg', targets: ['hire-caregiver', 'tab-hire', 'nav-manage'], done: (c) => c.game.employees.some((e) => e.role === 'caregiver') },
  { id: 'admit', targets: ['admit', 'tab-admit', 'nav-manage'], done: (c) => c.game.residents.length > 0 },
  {
    id: 'care_plan',
    targets: ['create-plan', 'view-residents', 'nav-residents'],
    done: (c) => c.game.residents.length > 0 && c.game.residents.every((r) => r.carePlan),
  },
  {
    id: 'roster',
    targets: (c) => {
      const slot = slotAt(c.game.minute);
      const onShift = new Set(c.game.shifts.map((x) => x.employeeId));
      const rnOn = c.game.employees.some((e) => e.role === 'rn' && onShift.has(e.id));
      return ['roster-pick', `roster-add-${rnOn ? 'caregiver' : 'rn'}-${slot}`, 'view-roster', 'nav-roster'];
    },
    done: (c) => {
      const onShift = new Set(c.game.shifts.map((s) => s.employeeId));
      const staffed = c.game.employees.filter((e) => onShift.has(e.id));
      return staffed.some((e) => e.role === 'rn') && staffed.some((e) => e.role === 'caregiver');
    },
  },
  { id: 'play', targets: ['speed-1', 'speed-2'], done: (c) => c.game.speed > 0 || c.ack.has('play') },
  { id: 'finish', info: true, targets: ['save', 'view-finance', 'nav-finance'], done: (c) => c.ack.has('finish') },
];

export function stepTargets(step: TutorialStep, c: TutorialCtx): string[] {
  return typeof step.targets === 'function' ? step.targets(c) : step.targets;
}

/** i18n key stem for a step's text in its current sub-stage. */
export function stepKey(step: TutorialStep, c: TutorialCtx): string {
  const v = step.variant?.(c);
  return v ? `tut.${step.id}.${v}` : `tut.${step.id}`;
}

export function tutorialCtx(game: GameState, ui: Omit<TutorialCtx, 'game' | 'summary'>, summary = summarize(game)): TutorialCtx {
  return { game, summary, ...ui };
}

/** Index of the first unfinished step, or -1 when the tutorial is complete. */
export function currentStep(c: TutorialCtx): number {
  return STEPS.findIndex((s) => !s.done(c));
}
