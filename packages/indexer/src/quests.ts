// The quest and achievement rules of quiver 0.2.0 (event mode), applied to the events the indexer stored. The contract only
// reports increments (`QuestProgressed`, `AchievementProgressed`): in event mode nothing enforces a window, a retirement or a
// completion, so the indexer does, exactly as the packages state it (`quiver_quest` README, "Schedules" and the mode table;
// `quiver_achievement` README, "Event mode only", `WindowTrait::is_active`; `ScheduleTrait::{is_active, interval_id}`):
//
// - an event counts for a quest when its block's time is in the quest's schedule, in the interval `interval_id(time)`, and
//   its position in the chain is before the quest's retirement; for an achievement when its block's time is in the window
//   (`start <= time`, `end == 0 || time < end`) and before the retirement;
// - per task, the sum of the counts counted, saturated at the task's total; the quest (or the achievement) is complete when
//   every task is at its total; once complete it stays complete.
//
// Not applied: the prerequisites (`conditions`) of a quest, which in event mode depend on acceptances that emit no event
// (Paved defines none; they are served as defined). Pure functions here; the SQL is in queries.ts.
import type { TaskTarget } from "./events.ts";

/** The task the game never reports and the indexer credits from the `tournament` view (quests.md, "On the Podium"). */
export const PODIUM_TASK = 8;

/** The only task Tutorial reports (quests.md, TUTORIAL_FINISHED). */
export const TUTORIAL_TASK = 10;

/**
 * Whether a definition's tasks are consistent: no total of 0 (complete before any report, with no completion time) and no
 * task id repeated (two entries under one key). The contract refuses both since P-30, but a definition made before, or
 * through quiver directly, can still be on chain: the indexer excludes it (queries.ts) and counts it (`GET /v1/head`).
 */
export const consistent = (tasks: readonly TaskTarget[]): boolean =>
  tasks.every((task) => task.total > 0) && new Set(tasks.map((task) => task.taskId)).size === tasks.length;

/** A quest's schedule (`QuestSchedule`): `end` 0 never ends, `duration` and `period` (the package's `interval`) 0 one-off. */
export type Schedule = { start: number; end: number; duration: number; period: number };

/** `ScheduleTrait::interval_id`: null when the schedule is not active at `time`, 0 for a one-off quest. */
export function intervalId(schedule: Schedule, time: number): number | null {
  if (time < schedule.start || (schedule.end !== 0 && time >= schedule.end)) return null;
  if (schedule.period === 0) return 0;
  const offset = (time - schedule.start) % schedule.period;
  return offset < schedule.duration ? Math.floor((time - schedule.start) / schedule.period) : null;
}

/** The first second of `[from, to)` at which the schedule is active, or null when it is never. */
export function firstActive(schedule: Schedule, from: number, to: number): number | null {
  const time = Math.max(from, schedule.start);
  if (time >= to || (schedule.end !== 0 && time >= schedule.end)) return null;
  if (schedule.period === 0) return time;
  const offset = (time - schedule.start) % schedule.period;
  if (offset < schedule.duration) return time;
  const next = time - offset + schedule.period;
  return next < to && (schedule.end === 0 || next < schedule.end) ? next : null;
}

/** The seconds `[from, to)` of one interval of the schedule (to = Number.MAX_SAFE_INTEGER when it has no end). */
export function intervalSpan(schedule: Schedule, id: number): { from: number; to: number } {
  const unbounded = Number.MAX_SAFE_INTEGER;
  if (schedule.period === 0) {
    return { from: schedule.start, to: schedule.end === 0 ? unbounded : schedule.end };
  }
  const from = schedule.start + id * schedule.period;
  const to = from + schedule.duration;
  return { from, to: schedule.end === 0 ? to : Math.min(to, schedule.end) };
}

/** `WindowTrait::is_active`. */
export const inWindow = (start: number, end: number, time: number) =>
  start <= time && (end === 0 || time < end);

export type ProgressRow = { taskId: number; count: number; time: number };

export type TaskProgress = { task_id: number; total: number; count: number };

/**
 * The progress of one quest interval or one achievement from its rows (those that count, in chain order): per task the sum
 * saturated at the total, and when the last task reached its total (the time of the event that did, null while incomplete).
 */
export function replay(
  tasks: readonly TaskTarget[],
  rows: Iterable<ProgressRow>,
): { tasks: TaskProgress[]; completed: boolean; completedAt: number | null } {
  const counts = new Map(tasks.map((task) => [task.taskId, 0]));
  const reached = () => tasks.every((task) => counts.get(task.taskId)! >= task.total);
  let completedAt: number | null = null;
  let completed = reached();
  for (const row of rows) {
    const total = tasks.find((task) => task.taskId === row.taskId)?.total;
    if (total === undefined || completed) continue;
    counts.set(row.taskId, Math.min(total, counts.get(row.taskId)! + row.count));
    if (reached()) {
      completed = true;
      completedAt = row.time;
    }
  }
  return {
    tasks: tasks.map((task) => ({ task_id: task.taskId, total: task.total, count: counts.get(task.taskId)! })),
    completed,
    completedAt,
  };
}
