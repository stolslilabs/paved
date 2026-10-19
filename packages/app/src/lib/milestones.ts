import type { TaskProgress } from "@paved/chain";

/**
 * Missions as milestone tracks (#595): the tiers of one task are one bar with several steps. The chain defines tiers as
 * separate definitions on one task (docs/architecture/quests.md, "Tasks are the unit"): Small, Public and Great Works are
 * three quests on `STRUCTURE_SCORED`. Live in the same window, they are one track; a mission with one target is a track of
 * one step. Pure: the scenes group what the indexer serves, nothing is read here.
 */

/** What a track groups: a quest or an achievement, its tasks and whether it is done. */
export interface Steppable {
  tasks: TaskProgress[];
  completed: boolean;
}

export interface MilestoneStep<T> {
  entry: T;
  /** The total of the step's task: where the step sits on the count. */
  target: number;
  /** The indexer says it is complete. */
  reached: boolean;
}

export interface MilestoneTrack<T> {
  /** The grouping key (`group` of `milestoneTracks`). */
  key: string;
  /** The task the steps count, or 0 for a mission of several tasks (its own track). */
  taskId: number;
  /** The task's count: the largest any step reports (each is saturated at its own total). */
  count: number;
  /** Lowest target first. */
  steps: MilestoneStep<T>[];
}

/**
 * The tracks of `entries`, in the order their first entry comes. Entries of one task under the same `group` key (a period,
 * a window) are one track, steps by target; an entry of several tasks is a track of its own, on its first task.
 */
export function milestoneTracks<T extends Steppable>(entries: readonly T[], group: (entry: T) => string): MilestoneTrack<T>[] {
  const tracks = new Map<string, MilestoneTrack<T>>();
  entries.forEach((entry, i) => {
    const task = entry.tasks[0];
    const single = entry.tasks.length === 1;
    const key = single ? `${group(entry)}:${task.taskId}` : `${group(entry)}:entry${i}`;
    const track = tracks.get(key) ?? { key, taskId: single ? task.taskId : 0, count: 0, steps: [] };
    track.count = Math.max(track.count, task?.count ?? 0);
    track.steps.push({ entry, target: task?.total ?? 0, reached: entry.completed });
    tracks.set(key, track);
  });
  return [...tracks.values()].map((t) => ({ ...t, steps: t.steps.sort((a, b) => a.target - b.target) }));
}

/**
 * How full the bar is, 0 to 1. The steps are evenly spaced (step i of n at (i + 1) / n, as mobile games draw their
 * milestones), and the fill runs linearly between two steps: 4 of 8 with steps at 4, 8 and 12 is 1/3 + 0 = 0.33;
 * 6 is half-way to the second step, 0.5.
 */
export function milestoneFill(count: number, targets: readonly number[]): number {
  const n = targets.length;
  if (n === 0) return 0;
  let previous = 0;
  for (let i = 0; i < n; i++) {
    const target = targets[i];
    if (count < target) return (i + Math.max(0, count - previous) / Math.max(1, target - previous)) / n;
    previous = target;
  }
  return 1;
}

/** The first step not reached, and what it still needs; null when every step is. */
export function nextStep<T>(track: MilestoneTrack<T>): { step: MilestoneStep<T>; left: number } | null {
  const step = track.steps.find((s) => !s.reached);
  return step ? { step, left: Math.max(0, step.target - track.count) } : null;
}
