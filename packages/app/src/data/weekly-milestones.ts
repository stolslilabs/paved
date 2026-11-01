import type { WriteResult } from "@paved/chain";
import type { WeeklyMilestoneRefusal } from "@paved/game-core";

// The week's milestones (#976, the owner's decisions of 2026-11-01): five weeklies a week; 3 done pay 50 Cobbles and 5 done pay
// 100, each claimed once a UTC week (Monday to Sunday). The rules are game-core's (`WEEKLY_MILESTONES`,
// `weeklyMilestoneRefusal`, `weeklyMilestoneStates`); the mock ledger serves the read and the claim (`data/mock/ledger.ts`,
// MOCK-FIRST) until the contracts have them (#738), as it serves the day's (`daily-milestones.ts`). Values only from
// game-core: a value import of `@paved/chain` would bring starknet.js into the page's chunk.

/** A week's milestones as `weeklyMilestones` answers them: bit `step` of `claimed` is `WEEKLY_MILESTONES[step]` claimed. */
export interface WeeklyMilestonesView {
  /** The week number, as `weekOfDay` counts it (week 0 from Monday 1970-01-05). */
  week: number;
  claimed: number;
}

/** The read of the week's milestones: any week's, a player's. */
export interface WeeklyMilestoneViews {
  weeklyMilestones(playerId: string, week: number): Promise<WeeklyMilestonesView>;
}

/** The claim of a week's milestone, for the connected account. */
export interface WeeklyMilestoneWrites {
  /** Claims milestone `step` (an index of `WEEKLY_MILESTONES`) of `week`: its Cobbles, once that week. */
  claimWeeklyMilestone(week: number, step: number): Promise<WriteResult>;
}

/** A week's milestone claim the rules refused: its reason, and the receipt's hash when it was sent. */
export class WeeklyMilestoneRefusedError extends Error {
  constructor(
    readonly reason: WeeklyMilestoneRefusal,
    readonly transactionHash?: string,
  ) {
    super(`Refused: ${reason}`);
    this.name = "WeeklyMilestoneRefusedError";
  }
}
