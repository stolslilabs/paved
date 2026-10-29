import type { WriteResult } from "@paved/chain";
import type { DailyMilestoneRefusal } from "@paved/game-core";

// The day's milestones (#869, the owner's decisions of 2026-10-28): five dailies a day pay nothing on their own; 3 done pay 10
// Cobbles and 5 done pay 15, each claimed once a UTC day. The rules are game-core's (`DAILY_MILESTONES`,
// `dailyMilestoneRefusal`, `dailyMilestoneStates`); the mock ledger serves the read and the claim (`data/mock/ledger.ts`,
// MOCK-FIRST) until the contracts have them (#738). Values only from game-core: a value import of `@paved/chain` would bring
// starknet.js into the page's chunk.

/** A day's milestones as `dailyMilestones` answers them: bit `step` of `claimed` is `DAILY_MILESTONES[step]` claimed. */
export interface DailyMilestonesView {
  /** Days from the epoch, UTC. */
  day: number;
  claimed: number;
}

/** The read of the milestones: any day's, a player's. */
export interface DailyMilestoneViews {
  dailyMilestones(playerId: string, day: number): Promise<DailyMilestonesView>;
}

/** The claim of a milestone, for the connected account. */
export interface DailyMilestoneWrites {
  /** Claims milestone `step` (an index of `DAILY_MILESTONES`) of `day`: its Cobbles, once that day. */
  claimDailyMilestone(day: number, step: number): Promise<WriteResult>;
}

/** A milestone's claim the rules refused: its reason, and the receipt's hash when it was sent. */
export class DailyMilestoneRefusedError extends Error {
  constructor(
    readonly reason: DailyMilestoneRefusal,
    readonly transactionHash?: string,
  ) {
    super(`Refused: ${reason}`);
    this.name = "DailyMilestoneRefusedError";
  }
}
