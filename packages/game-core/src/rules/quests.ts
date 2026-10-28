// The quests' rewards (PvP v2, #732, #738). The owner's decisions of 2026-10-24: finishing every quest of a week gives bonus
// Cobbles instead of a free Challenge game, so the economy holds without PAVED, vPAVED and the Challenge (which still counts
// towards quests). The owner's decisions of 2026-10-28 (#869): five dailies a day, none paying on its own, and no bonus for the
// whole day; the day pays at two milestones instead, each claimed once a day. The lifetime quests keep their Cobbles.

/** The dailies live each UTC day (#869): Daily Run and four rotating ones. */
export const DAILY_QUESTS = 5;

/** A milestone of the day: `cobbles` once `done` dailies of that day are done. */
export interface DailyMilestone {
  done: number;
  cobbles: number;
}

/** The day's milestones (#869), in order: 3 dailies done give 10 Cobbles, 5 give 15, 25 a day in all. A step is an index here. */
export const DAILY_MILESTONES: readonly DailyMilestone[] = [
  { done: 3, cobbles: 10 },
  { done: 5, cobbles: 15 },
];

/** The bonus Cobbles of finishing every weekly quest (#738 open point 1: 60 a week). The day has none since #869. */
export const QUEST_BONUS_COBBLES = { weekly: 60 } as const;

/** Why a milestone cannot be claimed: no such step, too few dailies done, or already claimed that day. */
export type DailyMilestoneRefusal = "no-milestone" | "not-reached" | "milestone-claimed";

/** Where a milestone stands for a day: not reached yet, reached and to claim, or claimed. */
export type DailyMilestoneState = "locked" | "claimable" | "claimed";

/** Bit `step` of a day's claimed word: the milestone claimed. */
export const dailyMilestoneClaimed = (claimed: number, step: number): boolean => ((claimed >>> step) & 1) === 1;

/** Why milestone `step` of a day with `done` dailies done and `claimed` (a word, bit `step` per milestone) cannot be claimed; null when it can. */
export function dailyMilestoneRefusal(step: number, done: number, claimed: number): DailyMilestoneRefusal | null {
  const milestone = Number.isInteger(step) ? DAILY_MILESTONES[step] : undefined;
  if (!milestone) return "no-milestone";
  if (dailyMilestoneClaimed(claimed, step)) return "milestone-claimed";
  if (done < milestone.done) return "not-reached";
  return null;
}

/** Each milestone's state for a day with `done` dailies done and `claimed` (a word, bit `step` per milestone). */
export function dailyMilestoneStates(done: number, claimed: number): DailyMilestoneState[] {
  return DAILY_MILESTONES.map((m, step) => (dailyMilestoneClaimed(claimed, step) ? "claimed" : done >= m.done ? "claimable" : "locked"));
}
