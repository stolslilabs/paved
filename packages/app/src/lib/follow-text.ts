import { FOLLOW_LIMIT, formatInteger } from "@paved/game-core";
import { FollowRefusedError, type FollowWriteRefusal } from "../data/social-source";

/**
 * Each follow refusal in words (#954). `blocked` says only that the action is not available: the block is never shown to the
 * blocked player (the issue's proposal 6), so its words are the same as for any action that cannot be done.
 */
export const FOLLOW_REFUSALS: Record<FollowWriteRefusal, string> = {
  self: "You cannot follow yourself.",
  blocking: "You block this player: unblock them first.",
  blocked: "This is not available.",
  limit: `You follow ${formatInteger(FOLLOW_LIMIT)} players, the most: unfollow one first.`,
  "unknown-player": "This player is not there any more.",
};

/** A failed follow write in words: its refusal's, else its message. */
export const followErrorText = (error: unknown): string => (error instanceof FollowRefusedError ? FOLLOW_REFUSALS[error.reason] : error instanceof Error ? error.message : "Something went wrong.");
