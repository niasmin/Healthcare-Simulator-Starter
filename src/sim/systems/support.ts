import { hasUpgrade, LOUNGE_SATISFACTION_PER_DAY } from '../../data/shop';
import { allRoomStatuses } from '../../domain/rules/rooms';
import type { GameState, RoomType, StaffRole } from '../../domain/types';
import { clamp, r2 } from '../helpers';
import { makeApplicant } from './staffing';

/**
 * Optional support rooms and the staff who run them. None is required by any chapter or by the
 * roster advice; each just makes the home run better. All effects are fictional game balancing.
 * - Pharmacy + pharmacist: stock control cuts daily supplies; the pharmacist also does medication rounds.
 * - Dining room: residents who eat on their own get more from each meal together. With a nutritionist
 *   (who also helps at mealtimes), everyone is a little more satisfied each day.
 * - Laundry room + cleaner: in-house laundry and cleaning cut building upkeep and lift residents' mood.
 * - Reception + receptionist: a staffed front desk turns more calls into enquiries (+1 family a day).
 * - Reception + security guard: families feel their relatives are safe (satisfaction up a little each day).
 * - Storage room (no staff): stock bought in bulk cuts daily supplies a little.
 * - Bath & hygiene room (no staff): personal care (washing, dressing) takes a third less time.
 * - Accounting office + accountant: invoices are collected on the day they are issued, and the
 *   accountant's checks bring food, supplies and upkeep 3% lower.
 */

export const PHARMACY_SUPPLIES_PERCENT = 90;
export const DINING_MEAL_NUTRITION = 10;
export const DINING_MEAL_HAPPINESS = 2;
export const NUTRITIONIST_SATISFACTION_PER_DAY = 0.5;
export const LAUNDRY_UPKEEP_PERCENT = 80;
export const CLEANER_HAPPINESS_PER_DAY = 1;
export const RECEPTION_EXTRA_ENQUIRIES = 1;
export const SECURITY_SATISFACTION_PER_DAY = 0.3;
export const STORAGE_SUPPLIES_PERCENT = 95;
export const BATHROOM_CARE_PERCENT = 67;
/** An accountant on the roster: fees are collected on the billing day, and daily costs run 3% lower. */
export const ACCOUNTANT_COST_PERCENT = 97;

export const SUPPORT_ROOM: Partial<Record<StaffRole, RoomType>> = { pharmacist: 'pharmacy', nutritionist: 'dining_room', cleaner: 'laundry_room', receptionist: 'reception', security: 'reception', accountant: 'accounting_office' };

export function roomOpen(state: GameState, type: RoomType): boolean {
  const statuses = allRoomStatuses(state.site);
  return state.site.rooms.some((r) => r.type === type && statuses.get(r.id)?.operational);
}

/** Someone of this role is on the roster (has at least one shift). */
export function rostered(state: GameState, role: StaffRole): boolean {
  const ids = new Set(state.employees.filter((e) => e.role === role).map((e) => e.id));
  return state.shifts.some((s) => ids.has(s.employeeId));
}

/** The room is open and someone of its role is on the roster. */
export function supportActive(state: GameState, role: StaffRole): boolean {
  const room = SUPPORT_ROOM[role];
  return !!room && roomOpen(state, room) && rostered(state, role);
}

/** Daily refresh: once a support room exists, someone for it is always among the applicants. */
export function supportApplicants(state: GameState): GameState {
  let s = state;
  for (const [role, room] of Object.entries(SUPPORT_ROOM) as Array<[StaffRole, RoomType]>)
    if (s.site.rooms.some((r) => r.type === room) && !s.applicants.some((a) => a.role === role)) s = makeApplicant(s, role);
  return s;
}

/** Midnight: the nutritionist's, the security guard's and the cleaners' daily lift for every resident. */
export function supportDayEnd(state: GameState): GameState {
  const sat =
    (supportActive(state, 'nutritionist') ? NUTRITIONIST_SATISFACTION_PER_DAY : 0) +
    (supportActive(state, 'security') ? SECURITY_SATISFACTION_PER_DAY : 0) +
    (hasUpgrade(state, 'family_lounge') ? LOUNGE_SATISFACTION_PER_DAY : 0);
  const happy = supportActive(state, 'cleaner') ? CLEANER_HAPPINESS_PER_DAY : 0;
  if (!sat && !happy) return state;
  return {
    ...state,
    residents: state.residents.map((r) => ({ ...r, needs: { ...r.needs, satisfaction: r2(clamp(r.needs.satisfaction + sat)), happiness: r2(clamp(r.needs.happiness + happy)) } })),
  };
}
