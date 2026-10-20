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

export type RoomType = 'ward' | 'nursing_station' | 'therapy' | 'staff_room' | 'villa' | 'homecare_office' | 'training_room' | 'neuro_clinic' | 'stroke_unit' | 'pharmacy' | 'dining_room' | 'laundry_room' | 'reception' | 'storage_room' | 'bathroom';

export type EquipmentId =
  | 'care_bed'
  | 'call_system'
  | 'med_cart'
  | 'nurse_desk'
  | 'exercise_mat'
  | 'parallel_bars'
  | 'lockers'
  | 'rest_sofa'
  | 'door_sensor'
  | 'feeding_pump'
  | 'suction_unit'
  | 'care_van'
  | 'training_manikin'
  | 'whiteboard'
  | 'exam_desk'
  | 'waiting_chairs'
  | 'vital_monitor'
  | 'medicine_shelf'
  | 'dining_table'
  | 'washer'
  | 'reception_desk'
  | 'storage_rack'
  | 'bath_set';

export interface Room {
  id: string;
  type: RoomType;
  rect: Rect;
  /** Installed equipment counts. Missing key = 0. */
  equipment: Partial<Record<EquipmentId, number>>;
  builtAt: SimMinute;
}

export type DecorType = 'tree' | 'sakura' | 'tree2' | 'flowers' | 'hedge' | 'planter' | 'lamp' | 'umbrella' | 'fountain' | 'gazebo';

export interface Decor {
  id: string;
  type: DecorType;
  cell: Cell;
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
  /** Garden and decoration items, one tile each (Phase 4 visual upgrade). */
  decor: Decor[];
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
  | 'payroll'
  | 'revenue'
  /** Prepaid room & care handed back for days not used after a resident leaves (negative revenue). */
  | 'fee_refund'
  | 'food'
  | 'supplies'
  | 'event'
  | 'training'
  | 'branch';

// ---------------------------------------------------------------------------
// Billing (Phase 3). Fees are FICTIONAL game balancing values.
// ---------------------------------------------------------------------------

export type PriceLevel = 'value' | 'standard' | 'premium';

/** Revenue streams, used for invoice lines and the revenue-mix chart. */
export type RevenueStream = 'room_care' | 'therapy' | 'activity' | 'special' | 'homecare' | 'workforce' | 'hospital' | 'network';

export interface InvoiceLine {
  stream: RevenueStream;
  /** i18n key + params describing the line. */
  memo: string;
  memoParams?: Record<string, string | number>;
  qty: number;
  unitSatang: Satang;
  amountSatang: Satang;
}

export interface Invoice {
  id: string;
  /** admission = pro-rated first month; monthly = start of month; final = services at discharge; homecare = a day of home visits. */
  kind: 'admission' | 'monthly' | 'final' | 'homecare' | 'b2b' | 'opd' | 'ipd' | 'branch';
  /** Resident billed (the family pays). */
  clientId: string;
  clientName: PersonName;
  /** Billing month number (month 1 = days 1–30). */
  month: number;
  lines: InvoiceLine[];
  totalSatang: Satang;
  status: 'issued' | 'paid';
  issuedAt: SimMinute;
  /** Day number on which the family pays. */
  payDay: number;
  paidAt: SimMinute | null;
}

// ---------------------------------------------------------------------------
// Events (Phase 3): data-driven definitions live in data/events.ts; state only
// stores ids so it stays JSON-serialisable.
// ---------------------------------------------------------------------------

export type EventDefId = 'family_visit' | 'resident_change' | 'staff_resign' | 'referral';

export interface ActiveEvent {
  id: string;
  defId: EventDefId;
  firedAt: SimMinute;
  /** Unanswered events resolve with their default choice at this minute. */
  expiresAt: SimMinute;
  residentId?: string;
  employeeIds?: string[];
  /** Game speed before the auto-pause, restored after a choice. */
  speedBefore: GameSpeed;
}

export interface EventsState {
  active: ActiveEvent | null;
  /** Day number until which each event cannot fire again. */
  cooldownUntil: Partial<Record<EventDefId, number>>;
  history: Array<{ defId: EventDefId; choiceId: string; day: number; auto: boolean }>;
}

// ---------------------------------------------------------------------------
// People (Phase 2). All names and stats are fictional; no real patient data.
// ---------------------------------------------------------------------------

/** Localised display name. */
export interface PersonName {
  th: string;
  en: string;
  /** Used only to pick a portrait. */
  gender?: 'f' | 'm';
}

export type StaffRole = 'rn' | 'pn' | 'caregiver' | 'pt' | 'ot' | 'doctor' | 'pharmacist' | 'nutritionist' | 'cleaner' | 'receptionist' | 'security';

/**
 * Abstract qualifications. Clinical work is modelled only as "who is allowed
 * to do which kind of task" — never as treatment advice.
 */
export type Skill = 'assessment' | 'vital_signs' | 'med_round' | 'personal_care' | 'feeding' | 'mobility' | 'activity' | 'tube_feeding' | 'airway_care' | 'consult' | 'cleaning' | 'front_desk' | 'security';

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
  /** Training certificates earned (Chapter 5). */
  certs?: CourseId[];
  /** Placed with a partner organisation on this contract (Chapter 5): off the home's roster. */
  placement?: string;
  /** Manages this branch (Chapter 7): moved off the home's roster for good. */
  branch?: string;
}

export interface StaffCandidate {
  id: string;
  name: PersonName;
  role: StaffRole;
  experienceYears: number;
}

/** Chapter 1 groups plus the Chapter 2 specialised programmes (abstract care categories, never treatments). */
export type CareGroup = 'active_aging' | 'stroke_rehab' | 'bedridden' | 'dementia' | 'tube_feeding' | 'airway';

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
  /** Premium (Tranquila) resident living in a private villa (Chapter 3). */
  premium?: boolean;
}

export interface ResidentCandidate {
  id: string;
  name: PersonName;
  age: number;
  group: CareGroup;
  careLevel: number;
  needs: Needs;
  /** Set for hospital referrals: must be admitted by this day or the partner is let down. */
  referralDeadline?: number;
  /** Wants a private villa (Chapter 3 premium tier). */
  premium?: boolean;
}

export type TaskKind =
  | 'vital_signs'
  | 'med_round'
  | 'personal_care'
  | 'meal_assist'
  | 'repositioning'
  | 'mobility_session'
  | 'activity'
  | 'tube_feed'
  | 'airway_care'
  | 'safety_round';
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
  /** Cash at the close of the day. */
  cash: Satang;
  /** Average resident satisfaction at day end (-1 when none). */
  satisfaction: number;
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

export type ScheduledEventKind = 'day_end' | 'event_check';

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

// ---------------------------------------------------------------------------
// Chapter challenge (Phase 4): the 30-day story goal, judged once by the engine.
// ---------------------------------------------------------------------------

export type ChapterCheckId =
  | 'solvent'
  | 'beds'
  | 'residents'
  | 'cashflow'
  | 'quality'
  | 'rn'
  | 'programmes'
  | 'premium'
  | 'premium_sat'
  | 'appeal'
  | 'clients'
  | 'visit_rate'
  | 'certified'
  | 'contracts'
  | 'opd_visits'
  | 'opd_rate'
  | 'discharges'
  | 'branches'
  | 'branch_kinds'
  | 'network_quality'
  | 'network_occupancy';

export interface ChapterCheck {
  id: ChapterCheckId;
  have: number;
  need: number;
  ok: boolean;
}

export interface ChapterResult {
  /** Chapter number (1 = First Care Home). */
  chapter: number;
  outcome: 'won' | 'failed';
  /** Day the verdict was reached. */
  day: number;
  /** complete = all targets met; bankrupt = cash fell below zero; targets = day 30 closed with targets missed. */
  reason: 'complete' | 'bankrupt' | 'targets';
  checks: ChapterCheck[];
}

// ---------------------------------------------------------------------------
// Home care (Chapter 4). Clients live at home; staff visit them by van.
// ---------------------------------------------------------------------------

/** caregiver = personal care visit; nurse = health check visit (vital signs). */
export type VisitPlan = 'caregiver' | 'nurse';

export interface HomeClient {
  id: string;
  name: PersonName;
  age: number;
  plan: VisitPlan;
  /** 0..100: drops when visits are missed; the family cancels below the churn line. */
  satisfaction: number;
  joinedAt: SimMinute;
  /** Daily appointment time (minute of day). */
  visitAt: number;
}

export interface HomeLead {
  id: string;
  name: PersonName;
  age: number;
  plan: VisitPlan;
}

export interface HomeVisit {
  id: string;
  clientId: string;
  skill: Skill;
  dueAt: SimMinute;
  /** Minutes away from the home, travel included. */
  duration: number;
  status: TaskStatus;
  assigneeId: string | null;
  finishAt: SimMinute | null;
}

export interface HomeCareState {
  clients: HomeClient[];
  leads: HomeLead[];
  visits: HomeVisit[];
  /** Visits completed today, per client, billed at midnight. */
  doneToday: Record<string, number>;
  /** Closed days (last 14): visits done and missed. */
  history: Array<{ day: number; done: number; missed: number }>;
  today: { done: number; missed: number };
}

// ---------------------------------------------------------------------------
// Workforce (Chapter 5): training courses and staff placements with partner organisations.
// ---------------------------------------------------------------------------

/** Abstract training courses: each grants a certificate, some also a qualification (never clinical advice). */
export type CourseId = 'care_cert' | 'tube_cert' | 'airway_cert';

export interface TrainingSession {
  id: string;
  employeeId: string;
  course: CourseId;
  /** Class minutes still to attend. */
  remaining: number;
}

/** A partner organisation asking for one staff member for a number of working days. */
export interface WorkforceOffer {
  id: string;
  org: PersonName;
  /** Kind of partner, for the icon and wording. */
  orgKind: 'clinic' | 'hospital' | 'company' | 'school';
  role: StaffRole;
  /** Certificate the partner requires, if any. */
  cert: CourseId | null;
  days: number;
  ratePerDay: Satang;
  /** Last day the offer can be accepted. */
  expiresDay: number;
}

export interface WorkforceContract extends Omit<WorkforceOffer, 'expiresDay'> {
  employeeId: string;
  /** First working day. */
  startDay: number;
  done: number;
  missed: number;
  /** Working days completed today, billed at midnight. */
  doneToday: number;
}

export interface WorkforceState {
  training: TrainingSession[];
  offers: WorkforceOffer[];
  contracts: WorkforceContract[];
  /** Finished contracts (last 20): completed on time or ended early. */
  past: Array<{ id: string; org: PersonName; outcome: 'completed' | 'ended'; done: number; missed: number; day: number }>;
}

// ---------------------------------------------------------------------------
// Neuro hospital (Chapter 6): outpatient clinic and a short-stay stroke unit.
// Everything is abstract: who may do which kind of work and when, never what treatment to give.
// ---------------------------------------------------------------------------

/** One unit of hospital work: an outpatient consultation, or a round for an inpatient. */
export interface HospitalTask {
  id: string;
  kind: 'consult' | 'nurse_round' | 'doctor_round';
  /** Outpatient name for consultations; the inpatient's id for rounds. */
  patientId: string;
  skill: Skill;
  dueAt: SimMinute;
  duration: number;
  grace: number;
  status: TaskStatus;
  assigneeId: string | null;
  finishAt: SimMinute | null;
}

/** A clinic patient the doctor referred for a short stay in the stroke unit. */
export interface IpdReferral {
  id: string;
  name: PersonName;
  age: number;
  stayDays: number;
  /** Last day a bed can be offered. */
  expiresDay: number;
}

export interface Inpatient {
  id: string;
  name: PersonName;
  age: number;
  bedId: string;
  admittedDay: number;
  stayDays: number;
  roundsDone: number;
  roundsMissed: number;
}

export interface HospitalState {
  tasks: HospitalTask[];
  referrals: IpdReferral[];
  inpatients: Inpatient[];
  /** Consultations completed today (billed at midnight). */
  today: { consults: number; missed: number };
  /** Closed days (last 120, enough to judge a whole chapter). */
  history: Array<{ day: number; consults: number; missed: number }>;
  /** Discharges (last 200): a smooth stay, or one with too many missed rounds. */
  discharged: Array<{ id: string; day: number; outcome: 'recovered' | 'complicated' }>;
}

// ---------------------------------------------------------------------------
// Network (Chapter 7): branch sites run at portfolio level from headquarters.
// ---------------------------------------------------------------------------

export type BranchKind = 'nursing' | 'homecare' | 'clinic';

export interface Branch {
  id: string;
  kind: BranchKind;
  /** Fictional district name. */
  name: PersonName;
  openedDay: number;
  managerId: string | null;
  /** Units in use: residents, clients, or daily visits. */
  occupancy: number;
  /** 0..100: drifts toward a target set by the manager and headquarters' support. */
  quality: number;
  /** Day a support visit may be paid for again. */
  supportReadyDay: number;
}

export interface NetworkState {
  branches: Branch[];
  /** Closed days (last 120): total network quality and occupancy, for the dashboard. */
  history: Array<{ day: number; quality: number; occupancy: number; capacity: number; net: number }>;
}

/** The running chapter. Each chapter is judged once, over days startDay .. startDay + days − 1. */
export interface ChapterState {
  id: number;
  startDay: number;
  result: ChapterResult | null;
  /** Verdicts of earlier chapters, oldest first. */
  past: ChapterResult[];
}

/** campaign = the 7-chapter story; sandbox = free play, everything unlocked, no verdicts; challenge = one judged scenario. */
export type GameMode = 'campaign' | 'sandbox' | 'challenge';
export type ChallengeId = 'tight_budget' | 'bad_name' | 'big_start';
/** Shop upgrades: permanent, bought once. */
export type UpgradeId = 'online_marketing' | 'staff_welfare' | 'central_kitchen' | 'family_app' | 'laundry_supply' | 'smart_call';

/** Autopilot switches (sim/autopilot.ts). Missing in older saves = all off. */
export interface AutoSettings {
  events: boolean;
  admit: boolean;
  carePlan: boolean;
  staff: boolean;
}

export interface GameState {
  schemaVersion: 10;
  auto?: AutoSettings;
  /** Missing in saves made before modes existed: those are campaign games. */
  mode?: GameMode;
  challenge?: ChallengeId;
  /** Shop upgrades owned (missing in older saves = none). */
  upgrades?: UpgradeId[];
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
  // Phase 3
  priceLevel: PriceLevel;
  invoices: Invoice[];
  /** Billable services delivered this month, per resident, not yet invoiced. */
  unbilled: Record<string, { therapy: number; activity: number; special: number }>;
  events: EventsState;
  // Phase 4
  chapter: ChapterState;
  // Phase 5 part 2
  homecare: HomeCareState;
  // Phase 6
  workforce: WorkforceState;
  hospital: HospitalState;
  network: NetworkState;
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
  | 'plan_exists'
  | 'no_event'
  | 'invalid_choice'
  | 'needs_rn_on_shift'
  | 'needs_ward_equipment'
  | 'chapter_locked'
  | 'already_done'
  | 'no_homecare_office'
  | 'no_training_room'
  | 'no_seat'
  | 'course_not_allowed'
  | 'already_certified'
  | 'employee_busy'
  | 'role_mismatch'
  | 'needs_cert'
  | 'employee_placed'
  | 'no_stroke_bed'
  | 'manager_role'
  | 'employee_branch'
  | 'support_cooldown'
  | 'branch_limit'
  | 'already_owned';

export type CommandResult =
  | { ok: true; id?: string; costSatang?: Satang }
  | { ok: false; reason: ReasonCode; params?: Record<string, string | number> };
