import type { WriteResult } from "@paved/chain";
import type { TutorialCounts, TutorialStepRefusal } from "@paved/game-core";

// The Tutorial's steps (#977, the owner's decisions of 2026-11-01): eight first actions of the game, done in order, each unlocked
// by the completion of the one before, each paying its Cobbles once. The rules are game-core's (`TUTORIAL_STEPS`,
// `tutorialStates`, `tutorialStepRefusal`); the mock ledger serves the read and the claim (`data/mock/ledger.ts`, MOCK-FIRST)
// until the contracts have them (#738). Not First Stone's `claimTutorial` (D-21), the achievement's report, which stays apart.
// Values only from game-core: a value import of `@paved/chain` would bring starknet.js into the page's chunk.

/** A player's Tutorial as `tutorialSteps` answers it: each task's count, and bit `id - 1` of `claimed` for step `id` claimed. */
export interface TutorialView {
  counts: TutorialCounts;
  claimed: number;
}

/** The read of the Tutorial: a player's. */
export interface TutorialViews {
  tutorialSteps(playerId: string): Promise<TutorialView>;
}

/** The claim of a step, for the connected account. */
export interface TutorialWrites {
  /** Claims step `id` (1 to 8, `TUTORIAL_STEPS`): its Cobbles, once. */
  claimTutorialStep(id: number): Promise<WriteResult>;
}

/** A step's claim the rules refused: its reason, and the receipt's hash when it was sent. */
export class TutorialStepRefusedError extends Error {
  constructor(
    readonly reason: TutorialStepRefusal,
    readonly transactionHash?: string,
  ) {
    super(`Refused: ${reason}`);
    this.name = "TutorialStepRefusedError";
  }
}
