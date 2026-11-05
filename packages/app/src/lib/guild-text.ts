import { GUILD_RANK, formatNumber, type GuildJoinType, type GuildRank, type GuildRefusal, type GuildRequirements } from "@paved/game-core";
import type { UiIconName } from "../components/elements/ui-art";
import { GuildRefusedError, type GuildLogEntry } from "../data/social-source";

// The guilds' words (#953): the ranks, the join types, the requirements, the log's lines and why an action is refused, as the
// Guild tab, the guild's page and the profiles say them. Game-core holds the rules; this is how the pages read them.

/** The ranks' names (GUILD-PAGE's five, the owner's choice of 2026-11-05). */
const RANK_NAMES: Record<GuildRank, string> = {
  [GUILD_RANK.recruit]: "Recruit",
  [GUILD_RANK.member]: "Member",
  [GUILD_RANK.veteran]: "Veteran",
  [GUILD_RANK.officer]: "Officer",
  [GUILD_RANK.leader]: "Leader",
};

/** A rank's name. */
export const rankName = (rank: GuildRank): string => RANK_NAMES[rank] ?? "Member";

/** Each rank's painted icon (GUILD-PAGE): the Recruit's sprout, the Member's bust, the Veteran's medal, the Officer's star, the Leader's crown. */
/** A rank's painted art (its own type: the Font Awesome subset's scan reads the literals of a block opened on a line naming an icon). */
type RankArt = Record<GuildRank, UiIconName>;
export const RANK_ART: RankArt = {
  [GUILD_RANK.recruit]: "sprout",
  [GUILD_RANK.member]: "user",
  [GUILD_RANK.veteran]: "medal",
  [GUILD_RANK.officer]: "star",
  [GUILD_RANK.leader]: "crown",
};

/** What each rank may do, as a promotion's confirmation says it: the rights it adds to those under it. */
export const RANK_RIGHTS: Record<GuildRank, string> = {
  [GUILD_RANK.recruit]: "Recruits read the announcements and chat with the guild.",
  [GUILD_RANK.member]: "Members also invite players.",
  [GUILD_RANK.veteran]: "Veterans also answer the requests and post announcements.",
  [GUILD_RANK.officer]: "Officers also kick, and promote up to Veteran.",
  [GUILD_RANK.leader]: "The leader also edits the settings and promotes Officers.",
};

/**
 * Each join type: its name, its painted icon (GUILD-PAGE: Codex's open padlock and sealed letter, the HUD's padlock) and what it means
 * for a player who wants in.
 */
type JoinTypeText = { label: string; art: UiIconName; line: string };
export const JOIN_TYPES: Record<GuildJoinType, JoinTypeText> = {
  open: { label: "Open", art: "unlock", line: "Anyone who meets the requirements joins at once." },
  request: { label: "By request", art: "letter", line: "Send a request: a Veteran, an Officer or the leader answers it." },
  invite: { label: "Invite only", art: "lock", line: "Only an invitation brings a player in: from a Member or above." },
};

/** The requirements as a short line: "Level 5, 300 crowns", or "None". */
export function requirementsText(r: GuildRequirements): string {
  const parts = [r.level > 0 && `Level ${formatNumber(r.level)}`, r.crowns > 0 && `${formatNumber(r.crowns)} crowns`].filter(Boolean);
  return parts.length === 0 ? "None" : parts.join(", ");
}

/** Who a line names: their name, else "A player". */
const who = (name: string | null): string => name ?? "A player";

/** One line of the guild's log, as #955 will show it in the guild's chat. */
export function logLine(e: GuildLogEntry): string {
  const actor = who(e.actorName);
  const target = who(e.targetName);
  switch (e.kind) {
    case "created":
      return `${actor} founded the guild`;
    case "joined":
      return `${actor} joined`;
    case "left":
      return `${actor} left`;
    case "kicked":
      return `${actor} kicked ${target}${e.reason ? `: “${e.reason}”` : ""}`;
    case "promoted":
      return `${actor} promoted ${target} to ${rankName(e.rank ?? GUILD_RANK.officer)}`;
    case "demoted":
      return `${actor} demoted ${target} to ${rankName(e.rank ?? GUILD_RANK.member)}`;
    case "leader":
      return e.target === null || e.target === e.actor ? `${actor} became the leader` : `${actor} made ${target} the leader`;
    case "settings":
      return `${actor} changed the settings`;
    case "announcement":
      return `${actor} posted an announcement`;
  }
}

/** Why an action is refused, in the player's words (game-core's `GuildRefusal`). */
export const REFUSALS: Record<GuildRefusal, string> = {
  "in-guild": "You are in a guild already.",
  "not-in-guild": "You are not in this guild.",
  "member-already": "This player is in the guild already.",
  "name-length": "A name has 3 to 20 characters.",
  "name-chars": "A name has letters, digits and spaces only.",
  "name-taken": "Another guild has this name.",
  "description-length": "The description is too long.",
  emblem: "Pick an emblem.",
  "join-type": "Pick how players join.",
  requirements: "The requirements are out of range.",
  full: "The guild is full.",
  "level-low": "Your level is below the guild's requirement.",
  "crowns-low": "Your crowns are below the guild's requirement.",
  open: "This guild is open: join it.",
  "by-request": "This guild takes requests.",
  "invite-only": "This guild is invite only.",
  "request-pending": "You have a request waiting at another guild.",
  "no-request": "You have no request waiting.",
  "message-length": "The message is too long.",
  rank: "Your rank does not allow it.",
  "rank-not-above": "You can act only on members below your rank.",
  self: "You cannot do this to yourself.",
  "kick-cooldown": "Officers kick once every 20 minutes.",
  "reason-length": "The reason is too long.",
  "top-rank": "They cannot rise above the rank under yours.",
  "bottom-rank": "A Recruit cannot be demoted.",
  "leader-must-transfer": "Make another member leader first.",
  "announcement-empty": "Write something first.",
  "announcement-length": "The announcement is too long.",
  "not-author": "Only the leader edits another's announcements.",
  "invited-already": "This player has an invitation from the guild already.",
  blocked: "This player does not take invitations from you.",
  "invite-expired": "This invitation has lapsed.",
  "not-found": "It is not there any more.",
};

/** A failed guild write in words: its refusal's, else its message. */
export const guildErrorText = (error: unknown): string => (error instanceof GuildRefusedError ? REFUSALS[error.reason] : error instanceof Error ? error.message : "Something went wrong.");
