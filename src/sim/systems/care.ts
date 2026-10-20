import { hasUpgrade, SMART_CALL_EXTRA_GRACE } from '../../data/shop';
import { carePlanSchedule, TASK_KINDS } from '../../data/patients';
import { parseBedId } from '../../domain/rules/beds';
import { allRoomStatuses } from '../../domain/rules/rooms';
import { isOnShift } from '../../domain/rules/shifts';
import type { CareTask, Employee, GameState, Resident } from '../../domain/types';
import { MINUTES_PER_DAY } from '../constants';
import { allocId } from '../helpers';
import { applyNeedDelta } from './needs';
import { recordService } from './billing';
import { EXHAUSTED_ENERGY } from './staffing';

/**
 * Care Plan Engine.
 * - A care plan turns a resident's group + level into a fixed daily task schedule.
 * - Each tick: finish in-progress tasks, mark overdue ones missed, then assign due tasks
 *   to qualified, on-shift, available staff who can reach the resident's room.
 * Everything is deterministic: tasks are processed in (dueAt, priority, resident
 * satisfaction, id) order and
 * staff are chosen by (fewest skills, highest energy, id).
 */

/** Create tasks for one resident for the day starting at `dayStart`, skipping times before `from`. */
export function generateTasksForDay(state: GameState, resident: Resident, dayStart: number, from: number): GameState {
  if (!resident.carePlan) return state;
  let s = state;
  const add: CareTask[] = [];
  for (const [kind, mod] of carePlanSchedule(resident.group, resident.careLevel)) {
    const dueAt = dayStart + mod;
    if (dueAt < from) continue;
    const def = TASK_KINDS[kind];
    let id: string;
    [s, id] = allocId(s, 'task');
    add.push({ id, residentId: resident.id, kind, skill: def.skill, dueAt, duration: def.duration, priority: def.priority, status: 'pending', assigneeId: null, finishAt: null });
  }
  return add.length ? { ...s, tasks: [...s.tasks, ...add] } : s;
}

export function generateAllTasksForDay(state: GameState, dayStart: number): GameState {
  let s = state;
  for (const r of state.residents) s = generateTasksForDay(s, r, dayStart, dayStart);
  return s;
}

/** Drop finished tasks older than the previous day so state stays small. */
export function pruneTasks(state: GameState): GameState {
  const cutoff = state.minute - MINUTES_PER_DAY;
  const tasks = state.tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress' || t.dueAt >= cutoff);
  return tasks.length === state.tasks.length ? state : { ...state, tasks };
}

/**
 * When staff are short, equal-priority tasks go to the least satisfied resident first,
 * so shortfalls rotate instead of always falling on the same (last-admitted) people.
 */
function taskOrder(residents: Map<string, Resident>) {
  const sat = (t: CareTask) => Math.floor(residents.get(t.residentId)?.needs.satisfaction ?? 100);
  return (a: CareTask, b: CareTask): number =>
    a.dueAt - b.dueAt || a.priority - b.priority || sat(a) - sat(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function staffOrder(a: Employee, b: Employee): number {
  return a.skills.length - b.skills.length || b.energy - a.energy || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** A routine task this close to being missed is taken by whoever is free. */
const RESERVE_URGENT_MINUTES = 30;

/** True when other work only `e` (not the task's narrowest staff) can do falls due before `t` would be finished. */
function reservedFor(e: Employee, t: CareTask, tasks: CareTask[], now: number, narrowSkills: Set<string>): boolean {
  return tasks.some((u) => u.status === 'pending' && !narrowSkills.has(u.skill) && e.skills.includes(u.skill) && u.dueAt <= now + t.duration);
}

export function careTick(state: GameState): GameState {
  if (state.tasks.length === 0) return state;
  const now = state.minute;
  const residents = new Map(state.residents.map((r) => [r.id, r]));
  const employees = new Map(state.employees.map((e) => [e.id, e]));
  let { done, missed } = state.today;
  let changed = false;

  const statuses = allRoomStatuses(state.site);
  const therapyOpen = state.site.rooms.some((r) => r.type === 'therapy' && statuses.get(r.id)?.operational);

  const tasks = state.tasks.map((t) => ({ ...t }));
  const smartCall = hasUpgrade(state, 'smart_call');
  const billable: Array<[string, 'therapy' | 'activity']> = [];

  // 1. Finish in-progress tasks.
  for (const t of tasks) {
    if (t.status !== 'in_progress' || t.finishAt === null || t.finishAt > now) continue;
    t.status = 'done';
    done++;
    changed = true;
    const r = residents.get(t.residentId);
    if (r) {
      const def = TASK_KINDS[t.kind];
      const scale = def.room === 'therapy' && !therapyOpen ? 0.4 : 1;
      residents.set(r.id, { ...r, needs: applyNeedDelta(r.needs, def.effects, scale) });
      if (t.kind === 'mobility_session') billable.push([r.id, 'therapy']);
      if (t.kind === 'activity') billable.push([r.id, 'activity']);
    }
    if (t.assigneeId) {
      const e = employees.get(t.assigneeId);
      if (e && e.taskId === t.id) employees.set(e.id, { ...e, taskId: null });
    }
  }

  // 2. Overdue pending tasks are missed.
  for (const t of tasks) {
    // Shop upgrade: a smart call system alerts staff earlier, so routine care can run a little later.
    if (t.status !== 'pending' || now <= t.dueAt + TASK_KINDS[t.kind].grace + (smartCall ? SMART_CALL_EXTRA_GRACE : 0)) continue;
    t.status = 'missed';
    missed++;
    changed = true;
    const r = residents.get(t.residentId);
    if (r) residents.set(r.id, { ...r, needs: applyNeedDelta(r.needs, TASK_KINDS[t.kind].missPenalty) });
  }

  // 3. Assign due tasks to qualified, available staff.
  const due = tasks.filter((t) => t.status === 'pending' && t.dueAt <= now).sort(taskOrder(residents));
  if (due.length) {
    for (const t of due) {
      const r = residents.get(t.residentId);
      if (!r) continue;
      const room = statuses.get(parseBedId(r.bedId).roomId);
      if (!room?.door) continue; // staff cannot reach the room
      const candidates = [...employees.values()]
        .filter((e) => !e.taskId && e.busyUntil <= now && e.energy >= EXHAUSTED_ENERGY && e.skills.includes(t.skill) && isOnShift(state, e.id, now))
        .sort(staffOrder);
      // Someone whose other skills are needed within the hour keeps free for that work, unless this
      // task is about to be missed. (Stops PNs doing 07:30 personal care while 08:00 vital signs wait.)
      // Only staff with a narrower colleague on shift for this task hold back.
      const urgent = now >= t.dueAt + TASK_KINDS[t.kind].grace - RESERVE_URGENT_MINUTES;
      const qualified = [...employees.values()].filter((x) => x.skills.includes(t.skill) && isOnShift(state, x.id, now));
      const narrowest = qualified.reduce<Employee | null>((a, x) => (!a || x.skills.length < a.skills.length ? x : a), null);
      const narrowSkills = new Set<string>(narrowest?.skills ?? []);
      const e = urgent ? candidates[0] : candidates.find((c) => c.skills.length === narrowest?.skills.length || !reservedFor(c, t, tasks, now, narrowSkills));
      if (!e) continue;
      const duration = e.energy < 30 ? Math.round(t.duration * 1.5) : t.duration;
      t.status = 'in_progress';
      t.assigneeId = e.id;
      t.finishAt = now + duration;
      employees.set(e.id, { ...e, taskId: t.id, busyUntil: now + duration });
      changed = true;
    }
  }

  if (!changed) return state;
  let out: GameState = {
    ...state,
    tasks,
    residents: state.residents.map((r) => residents.get(r.id)!),
    employees: state.employees.map((e) => employees.get(e.id)!),
    today: { done, missed },
  };
  for (const [rid, stream] of billable) out = recordService(out, rid, stream);
  return out;
}
