import type { PlayerQuest, PlayerQuests } from "@paved/chain";

/**
 * The window rule of a quest (docs/architecture/quests-v2.md 1.2, the rule Nums and Glitchbomb mirror in their clients and
 * the indexer applies to each event's block time): a quest with a `start`, an `interval` and a `duration` is active at `now`
 * when `(now - start) % interval < duration`; its interval id is `floor((now - start) / interval)`; its window ends at
 * `start + id * interval + duration`. Pure: the scenes take `now` as a prop, the route passes the indexer's clock (P9).
 */

export const DAY_S = 86_400;
export const WEEK_S = 7 * DAY_S;

/**
 * A quest's schedule, in seconds since the epoch (quests-v2.md 2.1: `start` a multiple of 86,400, `duration` 86,400,
 * `interval` 3 x 86,400 for a rotating daily, 7 x 86,400 for a weekly: v2a, on main since #423, defines them so, the weeklies
 * from Monday 1970-01-05, `start` 345,600).
 *
 * `@paved/chain`'s `PlayerQuest` does not carry them: `usePlayerQuests` joins them from the quest's definition (`startTime`,
 * `interval`, `duration`). The field names are those of quests-v2.md.
 */
export interface QuestSchedule {
  start: number;
  interval: number;
  duration: number;
}

/** A quest as the scenes read it: the indexer's `PlayerQuest` and its definition's schedule (see `QuestSchedule`). */
export type ScheduledQuest = PlayerQuest & QuestSchedule;

/** A player's quests of one UTC day, each with its schedule. */
export type ScheduledQuests = Omit<PlayerQuests, "quests"> & { quests: ScheduledQuest[] };

export interface QuestWindow {
  /** Whether `now` falls in a live window of the schedule. */
  active: boolean;
  /** `floor((now - start) / interval)`; -1 before the schedule starts. */
  intervalId: number;
  /** Where the interval's live window opens and closes (seconds). Before the first window these are the first window's. */
  opensAt: number;
  endsAt: number;
}

/**
 * The window of `schedule` at `now`. An `interval` of 0 is a one-off quest: one window of `duration` from `start`
 * (the indexer reads it as interval id 0, `PlayerQuest.intervalId`). The end is exclusive: at `endsAt` the window is over
 * (and, when `duration === interval`, the next one has opened).
 */
export function questWindow(schedule: QuestSchedule, now: number): QuestWindow {
  const { start, interval, duration } = schedule;
  if (now < start) return { active: false, intervalId: -1, opensAt: start, endsAt: start + duration };
  if (interval <= 0) return { active: now - start < duration, intervalId: 0, opensAt: start, endsAt: start + duration };
  const elapsed = now - start;
  const intervalId = Math.floor(elapsed / interval);
  const opensAt = start + intervalId * interval;
  return { active: elapsed % interval < duration, intervalId, opensAt, endsAt: opensAt + duration };
}

/** Whether the quest is live at `now`. */
export const isLive = (schedule: QuestSchedule, now: number): boolean => questWindow(schedule, now).active;

/** Whether the quest is live at some second of the UTC `day` (a day number: seconds / 86,400), as the indexer lists a day's quests (indexer.md:529-531). */
export function isLiveOnDay(schedule: QuestSchedule, day: number): boolean {
  const from = day * DAY_S;
  const to = from + DAY_S;
  if (to <= schedule.start) return false;
  const first = Math.max(from, schedule.start);
  // A window that opens inside the day, or one already open at its start.
  const w = questWindow(schedule, first);
  if (w.active) return true;
  const next = schedule.interval > 0 ? w.opensAt + schedule.interval : Infinity;
  return next < to;
}

/** Monday 1970-01-05, where week 0 of the Cobbles ledger opens (`setup.cairo` `WEEK_START`). */
export const WEEK_START_S = 345_600;

/**
 * The week number of a UTC day as `Setup`'s ledger counts it (Monday to Sunday, week 0 from 1970-01-05): a weekly quest's
 * claim period and its free game's. Null before week 0. `@paved/chain`'s `weekOfDay`, repeated here so the quests' route
 * brings no starknet.js (a test checks they agree).
 */
export function weekOfDay(day: number): number | null {
  const time = day * DAY_S;
  return time < WEEK_START_S ? null : Math.floor((time - WEEK_START_S) / WEEK_S);
}

export type QuestPeriod = "daily" | "weekly";

/** A quest lasting a day or less is a daily; a longer one is a weekly (v2a: 86,400 and 7 x 86,400). The chain stores no label. */
export const questPeriod = (schedule: QuestSchedule): QuestPeriod => (schedule.duration <= DAY_S ? "daily" : "weekly");

/** The next UTC midnight after `now`: the end of the UTC day a game counts for. */
export const endOfUtcDay = (now: number): number => (Math.floor(now / DAY_S) + 1) * DAY_S;

/**
 * When the live window closes for a list of quests: the soonest end among those live at `now`, or null when none is live.
 * A weekly's week is read from the definitions (`start`, `interval`, `duration`), never assumed to start on a Monday.
 */
export function windowEnd(quests: readonly QuestSchedule[], now: number): number | null {
  let end: number | null = null;
  for (const q of quests) {
    const w = questWindow(q, now);
    if (w.active && (end === null || w.endsAt < end)) end = w.endsAt;
  }
  return end;
}
