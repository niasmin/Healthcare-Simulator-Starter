/**
 * Core domain types. Everything here is plain, JSON-serialisable data so the
 * whole GameState can be saved, hashed and compared for determinism.
 *
 * Units:
 *  - money is always integer satang (1 THB = 100 satang)
 *  - time is always simulation minutes since the game started (day 1, 00:00).
 *    The engine advances in ticks of 10 minutes (144 ticks per day).
 */

export type Satang = number;
export type SimMinute = number;

export interface Cell {
  x: number;
  y: number;
}

/** Axis-aligned rectangle on the site grid, in cells. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type RoomType = 'ward' | 'nursing_station' | 'therapy' | 'staff_room';

export type EquipmentId =
  | 'care_bed'
  | 'call_system'
  | 'med_cart'
  | 'nurse_desk'
  | 'exercise_mat'
  | 'parallel_bars'
  | 'lockers'
  | 'rest_sofa';

export interface Room {
  id: string;
  type: RoomType;
  rect: Rect;
  /** Installed equipment counts. Missing key = 0. */
  equipment: Partial<Record<EquipmentId, number>>;
  builtAt: SimMinute;
}

export interface Site {
  id: string;
  organizationId: string;
  width: number;
  height: number;
  /** Fixed main entrance cell on the lot edge. Always a corridor. */
  entrance: Cell;
  /** Row-major corridor layer: 1 = corridor tile, 0 = empty. */
  corridor: number[];
  rooms: Room[];
}

export interface Organization {
  id: string;
  name: string;
  type: 'nursing_home';
  /** Cached balance; must always equal the sum of ledger entries. */
  cashSatang: Satang;
  /** 0..100. Static until quality systems arrive (Phase 3). */
  reputation: number;
}

export type LedgerCategory =
  | 'capital'
  | 'construction'
  | 'equipment'
  | 'refund'
  | 'upkeep'
  | 'payroll';

// ---------------------------------------------------------------------------
// People (Phase 2). All names and stats are fictional; no real patient data.
// ---------------------------------------------------------------------------

/** Localised display name. */
export interface PersonName {
  th: string;
  en: string;
}

export type StaffRole = 'rn' | 'pn' | 'caregiver' | 'pt' | 'ot';

/**
 * Abstract qualifications. Clinical work is modelled only as "who is allowed
 * to do which kind of task" — never as treatment advice.
 */
export type Skill = 'assessment' | 'vital_signs' | 'med_round' | 'personal_care' | 'feeding' | 'mobility' | 'activity';

export type ShiftSlot = 'morning' | 'afternoon' | 'night';

/** A recurring daily shift. start/end are minute-of-day; end < start means it crosses midnight. */
export interface Shift {
  id: string;
  employeeId: string;
  siteId: string;
  slot: ShiftSlot;
  start: number;
  end: number;
}

export interface Employee {
  id: string;
  name: PersonName;
  role: StaffRole;
  skills: Skill[];
  /** 0..100 */
  energy: number;
  /** 0..100 */
  morale: number;
  wageMonthlySatang: Satang;
  hiredAt: SimMinute;
  /** Busy with a task until this minute (exclusive). */
  busyUntil: SimMinute;
  taskId: string | null;
}

export interface StaffCandidate {
  id: string;
  name: PersonName;
  role: StaffRole;
  experienceYears: number;
}

export type CareGroup = 'active_aging' | 'stroke_rehab' | 'bedridden';

export type NeedKey = 'physical' | 'mobility' | 'mental' | 'happiness' | 'satisfaction' | 'nutrition';
export type Needs = Record<NeedKey, number>;

export interface CarePlan {
  createdAt: SimMinute;
  /** Employee (assessment-qualified) who wrote the plan. */
  authorId: string;
}

export interface Resident {
  id: string;
  name: PersonName;
  age: number;
  group: CareGroup;
  /** Abstract acuity 1 (independent) .. 4 (full assistance). Drives workload. */
  careLevel: number;
  needs: Needs;
  bedId: string;
  admittedAt: SimMinute;
  carePlan: CarePlan | null;
}

export interface ResidentCandidate {
  id: string;
  name: PersonName;
  age: number;
  group: CareGroup;
  careLevel: number;
  needs: Needs;
}

export type TaskKind = 'vital_signs' | 'med_round' | 'personal_care' | 'meal_assist' | 'repositioning' | 'mobility_session' | 'activity';
export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'missed';

export interface CareTask {
  id: string;
  residentId: string;
  kind: TaskKind;
  skill: Skill;
  dueAt: SimMinute;
  duration: number;
  /** 1 = highest */
  priority: number;
  status: TaskStatus;
  assigneeId: string | null;
  finishAt: SimMinute | null;
}

export interface DayStats {
  day: number;
  done: number;
  missed: number;
  /** Average resident wellbeing at day end, 0..100 (-1 when no residents). */
  wellbeing: number;
  residents: number;
  beds: number;
}

/** Immutable, append-only financial record. Positive = money in. */
export interface LedgerEntry {
  id: string;
  organizationId: string;
  amountSatang: Satang;
  category: LedgerCategory;
  at: SimMinute;
  /** Optional reference to the entity that caused the entry (room id, …). */
  ref?: string;
  /** i18n key + params describing the entry. */
  memo: string;
  memoParams?: Record<string, string | number>;
}

export type GameSpeed = 0 | 1 | 2 | 4;

export type ScheduledEventKind = 'day_end';

/** Deterministic event queue item; ordered by (at, seq). */
export interface ScheduledEvent {
  at: SimMinute;
  seq: number;
  kind: ScheduledEventKind;
}

export type LogLevel = 'info' | 'warn' | 'good';

export interface LogItem {
  id: string;
  at: SimMinute;
  level: LogLevel;
  key: string;
  params?: Record<string, string | number>;
}

export interface GameState {
  schemaVersion: 2;
  seed: number;
  /** Current PRNG state (mulberry32). Advancing the RNG updates this. */
  rngState: number;
  /** Simulation clock in minutes since day 1 00:00. Always a multiple of 10. */
  minute: SimMinute;
  speed: GameSpeed;
  /** Monotonic counter for deterministic ids. */
  nextId: number;
  /** Monotonic counter for event-queue ordering. */
  nextSeq: number;
  organization: Organization;
  site: Site;
  ledger: LedgerEntry[];
  queue: ScheduledEvent[];
  log: LogItem[];
  // Phase 2
  employees: Employee[];
  shifts: Shift[];
  residents: Resident[];
  tasks: CareTask[];
  applicants: StaffCandidate[];
  waitlist: ResidentCandidate[];
  /** Running counters for the current day. */
  today: { done: number; missed: number };
  /** Closed days, oldest first (kept for the last 60 days). */
  history: DayStats[];
}

export type ReasonCode =
  | 'out_of_bounds'
  | 'too_small'
  | 'too_large'
  | 'overlap'
  | 'insufficient_funds'
  | 'nothing_to_build'
  | 'not_found'
  | 'cannot_remove_entrance'
  | 'equipment_not_allowed'
  | 'equipment_limit'
  | 'equipment_none'
  | 'equipment_required'
  | 'invalid_speed'
  | 'no_free_bed'
  | 'room_occupied'
  | 'bed_occupied'
  | 'shift_overlap'
  | 'shift_too_long'
  | 'no_assessor'
  | 'plan_exists';

export type CommandResult =
  | { ok: true; id?: string; costSatang?: Satang }
  | { ok: false; reason: ReasonCode; params?: Record<string, string | number> };
