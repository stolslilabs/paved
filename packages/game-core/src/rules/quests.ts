// The quests' rewards (PvP v2, #732, #738). The owner's decisions of 2026-10-24: finishing every quest of a week gives bonus
// Cobbles instead of a free Challenge game, so the economy holds without PAVED, vPAVED and the Challenge (which still counts
// towards quests). The owner's decisions of 2026-10-28 (#869): five dailies a day, none paying on its own, and no bonus for the
// whole day; the day pays at two milestones instead, each claimed once a day. The owner's decisions of 2026-11-01 (#976): five
// weeklies a week, the week paying at its own two milestones, each claimed once a week. The lifetime quests keep their Cobbles.

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

/** The weeklies live each UTC week, Monday to Sunday (#976): Forester, Builder, Points, and the PvP's Raider and Stars. */
export const WEEKLY_QUESTS = 5;

/** A milestone of the week (#976): `cobbles` once `done` weeklies of that week are done. Each gift is worth more than any of the day's. */
export type WeeklyMilestone = DailyMilestone;

/** The week's milestones (#976, open point 2's default), in order: 3 weeklies done give 50 Cobbles, 5 give 100, 150 a week in all. */
export const WEEKLY_MILESTONES: readonly WeeklyMilestone[] = [
  { done: 3, cobbles: 50 },
  { done: 5, cobbles: 100 },
];

/** The bonus Cobbles of finishing every weekly quest (#738 open point 1: 60 a week). The day has none since #869. */
export const QUEST_BONUS_COBBLES = { weekly: 60 } as const;

/** Why a milestone cannot be claimed: no such step, too few quests of its period done, or already claimed in that period. */
export type DailyMilestoneRefusal = "no-milestone" | "not-reached" | "milestone-claimed";
/** Why a milestone of the week cannot be claimed (#976): the day's reasons, for the week. */
export type WeeklyMilestoneRefusal = DailyMilestoneRefusal;

/** Where a milestone stands for its period: not reached yet, reached and to claim, or claimed. */
export type DailyMilestoneState = "locked" | "claimable" | "claimed";
/** Where a milestone of the week stands (#976). */
export type WeeklyMilestoneState = DailyMilestoneState;

/** Bit `step` of a period's claimed word: the milestone claimed. The day's and the week's words read alike. */
export const dailyMilestoneClaimed = (claimed: number, step: number): boolean => ((claimed >>> step) & 1) === 1;
/** Bit `step` of a week's claimed word (#976): the milestone claimed. */
export const weeklyMilestoneClaimed = dailyMilestoneClaimed;

function milestoneRefusal(milestones: readonly DailyMilestone[], step: number, done: number, claimed: number): DailyMilestoneRefusal | null {
  const milestone = Number.isInteger(step) ? milestones[step] : undefined;
  if (!milestone) return "no-milestone";
  if (dailyMilestoneClaimed(claimed, step)) return "milestone-claimed";
  if (done < milestone.done) return "not-reached";
  return null;
}

const milestoneStates = (milestones: readonly DailyMilestone[], done: number, claimed: number): DailyMilestoneState[] =>
  milestones.map((m, step) => (dailyMilestoneClaimed(claimed, step) ? "claimed" : done >= m.done ? "claimable" : "locked"));

/** Why milestone `step` of a day with `done` dailies done and `claimed` (a word, bit `step` per milestone) cannot be claimed; null when it can. */
export function dailyMilestoneRefusal(step: number, done: number, claimed: number): DailyMilestoneRefusal | null {
  return milestoneRefusal(DAILY_MILESTONES, step, done, claimed);
}

/** Each milestone's state for a day with `done` dailies done and `claimed` (a word, bit `step` per milestone). */
export function dailyMilestoneStates(done: number, claimed: number): DailyMilestoneState[] {
  return milestoneStates(DAILY_MILESTONES, done, claimed);
}

/** Why milestone `step` of a week with `done` weeklies done and `claimed` (a word, bit `step` per milestone) cannot be claimed; null when it can (#976). */
export function weeklyMilestoneRefusal(step: number, done: number, claimed: number): WeeklyMilestoneRefusal | null {
  return milestoneRefusal(WEEKLY_MILESTONES, step, done, claimed);
}

/** Each milestone's state for a week with `done` weeklies done and `claimed` (a word, bit `step` per milestone) (#976). */
export function weeklyMilestoneStates(done: number, claimed: number): WeeklyMilestoneState[] {
  return milestoneStates(WEEKLY_MILESTONES, done, claimed);
}

/** The milestones reached and not claimed yet, of a period with `done` quests done and `claimed` (#976: for the home's Missions count). */
export function milestonesToClaim(milestones: readonly DailyMilestone[], done: number, claimed: number): number {
  return milestoneStates(milestones, done, claimed).filter((s) => s === "claimable").length;
}
