import type { AllianceRefusal, AllianceRole } from "@paved/game-core";
import { AllianceRefusedError } from "../data/social-source";
import { guildErrorText } from "./guild-text";

// The alliances' words (ALLIANCES): the guilds' roles and why an action is refused, as the alliance's page, the guild pages and the
// Leaderboard say them. Game-core holds the rules; this is how the pages read them.

/** A guild's role in its alliance, as its pill says it. */
export const ROLE_NAMES: Record<AllianceRole, string> = { head: "Head guild", member: "Member guild" };

/** Why an alliance action is refused, in the player's words (game-core's `AllianceRefusal`). */
export const ALLIANCE_REFUSALS: Record<AllianceRefusal, string> = {
  "not-in-guild": "You are in no guild.",
  "not-leader": "Only your guild's leader acts for it.",
  "in-alliance": "This guild is in an alliance already.",
  "not-in-alliance": "This guild is not in the alliance.",
  "member-already": "This guild is in the alliance already.",
  "not-head": "Only the head guild's leader can.",
  "name-length": "A name has 3 to 20 characters.",
  "name-chars": "A name has letters, digits and spaces only.",
  "name-taken": "Another alliance has this name.",
  "description-length": "The description is too long.",
  emblem: "Pick an emblem.",
  full: "The alliance is full.",
  "request-pending": "Your guild has a request waiting at another alliance.",
  "no-request": "Your guild has no request waiting.",
  "invited-already": "This guild has an invitation from the alliance already.",
  "invite-expired": "This invitation has lapsed.",
  self: "You cannot do this to your own guild.",
  "head-must-transfer": "Make another guild head first.",
  "not-found": "It is not there any more.",
};

/** A failed alliance write in words: its refusal's, else a guild's, else its message. */
export const allianceErrorText = (error: unknown): string => (error instanceof AllianceRefusedError ? ALLIANCE_REFUSALS[error.reason] : guildErrorText(error));
