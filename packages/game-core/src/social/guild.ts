// The guild rules (#953), pure: who may do what in a guild, who may join it, and its limits. The mock applies them today
// (`packages/app/src/data/mock/guilds.ts`) and the contract mirrors them later (#956). Every check answers null when the
// action is allowed, else its typed reason (`GuildRefusal`), which the source returns and the pages show.
//
// One rule for every action on another member: the actor's rank must be strictly above the target's, as Cartridge's `fire`.

import { LEVEL_CAP } from "../rules/xp";
import { nameMatches, normalQuery } from "./search";

// --- Ranks -----------------------------------------------------------------------------------------------------------

/**
 * The ranks, as numbers in their order: the checks compare them. 3 is left free, so that a fourth rank (a Co-leader, #953
 * open point 1) can come in between Officer and Leader without changing a rule.
 */
export const GUILD_RANK = { member: 1, officer: 2, leader: 4 } as const;

/** A rank: one of `GUILD_RANK`'s values. */
export type GuildRank = (typeof GUILD_RANK)[keyof typeof GUILD_RANK];

/** Whether `value` is a rank. */
export const isGuildRank = (value: unknown): value is GuildRank => value === GUILD_RANK.member || value === GUILD_RANK.officer || value === GUILD_RANK.leader;

/** Whether `actor` ranks strictly above `target`: the condition of every action on another member. */
export const ranksAbove = (actor: GuildRank, target: GuildRank): boolean => actor > target;

// --- Limits ----------------------------------------------------------------------------------------------------------

/** The most members of a guild (open point 4's default, as Clash of Clans). */
export const GUILD_MAX_MEMBERS = 50;
/** A guild's name: 3 to 20 characters, letters, digits and spaces. */
export const GUILD_NAME_MIN = 3;
export const GUILD_NAME_MAX = 20;
/** A guild's description, at most. */
export const GUILD_DESCRIPTION_MAX = 150;
/** A join request's message, at most. */
export const GUILD_REQUEST_MESSAGE_MAX = 100;
/** A kick's reason, at most. */
export const GUILD_KICK_REASON_MAX = 100;
/** An announcement, at most: plain text. */
export const GUILD_ANNOUNCEMENT_MAX = 500;
/** The announcements kept: the latest. */
export const GUILD_ANNOUNCEMENTS_KEPT = 20;
/** The log's entries kept: the latest. */
export const GUILD_LOG_KEPT = 100;
/** How long an invitation stays open, in seconds: 7 days. */
export const GUILD_INVITE_TTL_S = 7 * 86_400;
/** An officer's wait between two kicks, in seconds (open point 6's default, as Clash Royale). The leader has none. */
export const GUILD_KICK_COOLDOWN_S = 20 * 60;
/** How long a leader may go without playing before the rotation names another, in seconds (open point 9's default). */
export const GUILD_LEADER_IDLE_S = 35 * 86_400;
/** The highest crowns a requirement may ask. */
export const GUILD_MAX_CROWNS_REQUIRED = 10_000;
/** The emblems (open point 7's default): a shield bearing one of `GUILD_EMBLEM_ICONS` game icons, in a pair of `GUILD_EMBLEM_COLOURS` colours. */
export const GUILD_EMBLEM_ICONS = 12;
export const GUILD_EMBLEM_COLOURS = 8;

// --- Shapes ----------------------------------------------------------------------------------------------------------

/** How a player joins: Open (at once), By request (an officer accepts), Invite only. */
export type GuildJoinType = "open" | "request" | "invite";
export const GUILD_JOIN_TYPES: readonly GuildJoinType[] = ["open", "request", "invite"];

/** What a player must have to join (an invitation waives it, open point 8's default). 0: no minimum. */
export interface GuildRequirements {
  level: number;
  crowns: number;
}

/** An emblem: the icon on the shield and the shield's two colours, as indexes into the client's sets. */
export interface GuildEmblem {
  icon: number;
  primary: number;
  secondary: number;
}

/** What the leader edits. */
export interface GuildSettings {
  emblem: GuildEmblem;
  description: string;
  joinType: GuildJoinType;
  requirements: GuildRequirements;
}

/** A new guild: its name and its settings. */
export interface GuildDraft extends GuildSettings {
  name: string;
}

/** A guild as the join checks read it. */
export interface GuildOpening {
  id: number;
  joinType: GuildJoinType;
  requirements: GuildRequirements;
  /** Its member count. */
  members: number;
}

/** A player as the join checks read them. */
export interface GuildCandidate {
  level: number;
  crowns: number;
  /** The guild they are in, or null. */
  guild: number | null;
}

/** A member as the checks on members read them. */
export interface GuildActor {
  address: string;
  rank: GuildRank;
}

/** Why an action is refused. */
export type GuildRefusal =
  /** The player is in a guild already (creating, joining, requesting; accepting an invitation without leaving first). */
  | "in-guild"
  /** The player is in no guild, or not in this one. */
  | "not-in-guild"
  /** The target is a member of this guild already (an invitation). */
  | "member-already"
  | "name-length"
  | "name-chars"
  | "name-taken"
  | "description-length"
  | "emblem"
  | "join-type"
  /** The requirements are not whole numbers in range. */
  | "requirements"
  | "full"
  | "level-low"
  | "crowns-low"
  /** An Open guild: join it, no request. */
  | "open"
  /** A By-request guild: send a request. */
  | "by-request"
  | "invite-only"
  | "request-pending"
  | "no-request"
  | "message-length"
  /** The actor's rank does not allow the action. */
  | "rank"
  /** The actor does not rank strictly above the target. */
  | "rank-not-above"
  /** The target is the actor. */
  | "self"
  | "kick-cooldown"
  | "reason-length"
  /** A promotion: the target is not a Member. */
  | "not-a-member"
  /** A demotion: the target is not an Officer. */
  | "not-an-officer"
  /** The leader leaves or accepts another guild while others remain: they make another member leader first. */
  | "leader-must-transfer"
  | "announcement-empty"
  | "announcement-length"
  /** An officer edits or deletes another's announcement. */
  | "not-author"
  | "invited-already"
  /** The target blocked the inviter (#954). */
  | "blocked"
  | "invite-expired"
  /** No guild, member, request or announcement of that ID. */
  | "not-found";

// --- Names, tags, settings -------------------------------------------------------------------------------------------

/** A name as the guild keeps it: trimmed, its runs of spaces made one. */
export const normalGuildName = (name: string): string => name.trim().replace(/\s+/g, " ");

/** A name's key for uniqueness: its normal form in small letters, so "Iron Quay" and "iron  quay" are one name. */
export const guildNameKey = (name: string): string => normalGuildName(name).toLowerCase();

/** Why a name is refused (taken: `taken` holds its key), or null. */
export function guildNameRefusal(name: string, taken: (key: string) => boolean = () => false): GuildRefusal | null {
  const normal = normalGuildName(name);
  if (normal.length < GUILD_NAME_MIN || normal.length > GUILD_NAME_MAX) return "name-length";
  if (!/^[A-Za-z0-9 ]+$/.test(normal)) return "name-chars";
  if (taken(guildNameKey(normal))) return "name-taken";
  return null;
}

/** The tags' digits, as Clash of Clans' (no 0/O, 1/I lookalikes beyond its own). */
const TAG_DIGITS = "0289PYLQGRJCUV";
const TAG_BASE = BigInt(TAG_DIGITS.length);

/** A guild's tag, made from its ID: `#` then its digits in base 14 (`TAG_DIGITS`), to find and share it. */
export function guildTag(id: number): string {
  let n = BigInt(Math.max(0, Math.floor(id)));
  let digits = "";
  do {
    digits = TAG_DIGITS[Number(n % TAG_BASE)]! + digits;
    n /= TAG_BASE;
  } while (n > 0n);
  return `#${digits}`;
}

/** The guild ID a tag names (with or without its `#`, whatever the case and the spaces around), or null when it is not a tag. */
export function parseGuildTag(text: string): number | null {
  const t = text.trim().toUpperCase().replace(/^#/, "");
  if (t === "" || t.length > 12) return null;
  let n = 0n;
  for (const c of t) {
    const d = TAG_DIGITS.indexOf(c);
    if (d < 0) return null;
    n = n * TAG_BASE + BigInt(d);
  }
  return Number(n);
}

const isCount = (n: number, max: number): boolean => Number.isInteger(n) && n >= 0 && n <= max;

/** Whether an emblem's indexes are in the sets. */
export const validEmblem = (e: GuildEmblem): boolean => isCount(e.icon, GUILD_EMBLEM_ICONS - 1) && isCount(e.primary, GUILD_EMBLEM_COLOURS - 1) && isCount(e.secondary, GUILD_EMBLEM_COLOURS - 1);

/** Whether requirements are whole numbers in range: a level up to `LEVEL_CAP`, crowns up to `GUILD_MAX_CROWNS_REQUIRED`. */
export const validRequirements = (r: GuildRequirements): boolean => isCount(r.level, LEVEL_CAP) && isCount(r.crowns, GUILD_MAX_CROWNS_REQUIRED);

/** Why settings are refused, or null. */
export function guildSettingsInvalid(s: GuildSettings): GuildRefusal | null {
  if (!validEmblem(s.emblem)) return "emblem";
  if (s.description.length > GUILD_DESCRIPTION_MAX) return "description-length";
  if (!GUILD_JOIN_TYPES.includes(s.joinType)) return "join-type";
  if (!validRequirements(s.requirements)) return "requirements";
  return null;
}

/** Creating a guild: only for a player in no guild, with a free name and valid settings. Free in this step (open point 5). */
export function createGuildRefusal(player: { guild: number | null }, draft: GuildDraft, taken?: (key: string) => boolean): GuildRefusal | null {
  if (player.guild !== null) return "in-guild";
  return guildNameRefusal(draft.name, taken) ?? guildSettingsInvalid(draft);
}

/** Editing the settings: the leader only (open point 3's default). */
export function editSettingsRefusal(actor: GuildRank, settings: GuildSettings): GuildRefusal | null {
  if (actor < GUILD_RANK.leader) return "rank";
  return guildSettingsInvalid(settings);
}

// --- Joining ---------------------------------------------------------------------------------------------------------

/** Whether a guild is full. */
export const guildFull = (guild: Pick<GuildOpening, "members">): boolean => guild.members >= GUILD_MAX_MEMBERS;

/** Why a player does not meet a guild's requirements (level first), or null. */
export function requirementsUnmet(player: Pick<GuildCandidate, "level" | "crowns">, r: GuildRequirements): GuildRefusal | null {
  if (player.level < r.level) return "level-low";
  if (player.crowns < r.crowns) return "crowns-low";
  return null;
}

/** Joining at once: an Open guild, not full, its requirements met, for a player in no guild. */
export function joinRefusal(player: GuildCandidate, guild: GuildOpening): GuildRefusal | null {
  if (player.guild !== null) return player.guild === guild.id ? "member-already" : "in-guild";
  if (guild.joinType === "request") return "by-request";
  if (guild.joinType === "invite") return "invite-only";
  if (guildFull(guild)) return "full";
  return requirementsUnmet(player, guild.requirements);
}

/**
 * Requesting to join: a By-request guild, not full, its requirements met, with a message of at most 100 characters; one
 * pending request at a time (`pending`: the guild the player's request waits at, or null).
 */
export function requestRefusal(player: GuildCandidate & { pending: number | null }, guild: GuildOpening, message = ""): GuildRefusal | null {
  if (player.guild !== null) return player.guild === guild.id ? "member-already" : "in-guild";
  if (guild.joinType === "open") return "open";
  if (guild.joinType === "invite") return "invite-only";
  if (player.pending !== null) return "request-pending";
  if (message.length > GUILD_REQUEST_MESSAGE_MAX) return "message-length";
  if (guildFull(guild)) return "full";
  return requirementsUnmet(player, guild.requirements);
}

/** Cancelling one's request: there must be one. */
export const cancelRequestRefusal = (pending: number | null): GuildRefusal | null => (pending === null ? "no-request" : null);

/** Which ranks invite and answer the requests: Officers and the Leader. */
const RECRUITS = GUILD_RANK.officer;

/** Accepting a request: an officer or the leader, while the guild has room and the applicant is still in no guild. */
export function acceptRequestRefusal(actor: GuildRank, guild: Pick<GuildOpening, "members">, applicant: { guild: number | null }): GuildRefusal | null {
  if (actor < RECRUITS) return "rank";
  if (applicant.guild !== null) return "in-guild";
  if (guildFull(guild)) return "full";
  return null;
}

/** Declining a request: an officer or the leader. */
export const declineRequestRefusal = (actor: GuildRank): GuildRefusal | null => (actor < RECRUITS ? "rank" : null);

/**
 * Inviting a player (from their profile or the search): an officer or the leader, for a player in no guild or in another one,
 * who did not block the inviter (#954) and holds no open invitation from this guild, while the guild has room.
 */
export function inviteRefusal(actor: GuildRank, guild: Pick<GuildOpening, "id" | "members">, target: { guild: number | null; blockedInviter: boolean; invited: boolean }): GuildRefusal | null {
  if (actor < RECRUITS) return "rank";
  if (target.guild === guild.id) return "member-already";
  if (target.blockedInviter) return "blocked";
  if (target.invited) return "invited-already";
  if (guildFull(guild)) return "full";
  return null;
}

/** Whether an invitation sent at `sentAt` is still open at `now` (seconds): it lapses after 7 days. */
export const invitationOpen = (sentAt: number, now: number): boolean => now - sentAt < GUILD_INVITE_TTL_S;

/**
 * Accepting an invitation: still open, the guild not full; the requirements waived (open point 8's default). A player in a
 * guild accepts only once they confirmed leaving it (`leaving`), and as its leader only when alone in it (they disband it).
 */
export function acceptInvitationRefusal(invitation: { sentAt: number }, now: number, guild: Pick<GuildOpening, "members">, player: { guild: number | null; rank: GuildRank | null; members: number }, leaving: boolean): GuildRefusal | null {
  if (!invitationOpen(invitation.sentAt, now)) return "invite-expired";
  if (player.guild !== null) {
    if (!leaving) return "in-guild";
    const refused = leaveRefusal(player.rank ?? GUILD_RANK.member, player.members);
    if (refused) return refused;
  }
  if (guildFull(guild)) return "full";
  return null;
}

// --- Acting on members -----------------------------------------------------------------------------------------------

/**
 * Kicking a member, with an optional reason of at most 100 characters: an officer or the leader, on a member they rank strictly
 * above. An officer kicks once per 20 minutes (`lastKick`: when they last kicked, in seconds, or null); the leader has no wait.
 */
export function kickRefusal(actor: GuildActor & { lastKick: number | null }, target: GuildActor, now: number, reason = ""): GuildRefusal | null {
  if (actor.address === target.address) return "self";
  if (actor.rank < GUILD_RANK.officer) return "rank";
  if (!ranksAbove(actor.rank, target.rank)) return "rank-not-above";
  if (reason.length > GUILD_KICK_REASON_MAX) return "reason-length";
  if (actor.rank < GUILD_RANK.leader && actor.lastKick !== null && now - actor.lastKick < GUILD_KICK_COOLDOWN_S) return "kick-cooldown";
  return null;
}

/** When an officer may kick again, in seconds (`lastKick` null, or the leader: now). */
export const nextKickAt = (actor: { rank: GuildRank; lastKick: number | null }, now: number): number =>
  actor.rank >= GUILD_RANK.leader || actor.lastKick === null ? now : Math.max(now, actor.lastKick + GUILD_KICK_COOLDOWN_S);

/** Promoting a Member to Officer: the leader only (open point 2's default). */
export function promoteRefusal(actor: GuildActor, target: GuildActor): GuildRefusal | null {
  if (actor.address === target.address) return "self";
  if (actor.rank < GUILD_RANK.leader) return "rank";
  if (target.rank !== GUILD_RANK.member) return "not-a-member";
  return null;
}

/** Demoting an Officer to Member: the leader only. */
export function demoteRefusal(actor: GuildActor, target: GuildActor): GuildRefusal | null {
  if (actor.address === target.address) return "self";
  if (actor.rank < GUILD_RANK.leader) return "rank";
  if (target.rank !== GUILD_RANK.officer) return "not-an-officer";
  return null;
}

/** Making another member leader: the leader only; the target becomes Leader, the actor an Officer. */
export function makeLeaderRefusal(actor: GuildActor, target: GuildActor): GuildRefusal | null {
  if (actor.address === target.address) return "self";
  if (actor.rank < GUILD_RANK.leader) return "rank";
  return null;
}

/** Leaving: any member; the leader only when alone (`members`: the guild's count, the leader included), which disbands it. */
export const leaveRefusal = (rank: GuildRank, members: number): GuildRefusal | null => (rank >= GUILD_RANK.leader && members > 1 ? "leader-must-transfer" : null);

/** Whether a member's leaving disbands the guild: they are its last member. */
export const leaveDisbands = (members: number): boolean => members <= 1;

// --- Announcements ---------------------------------------------------------------------------------------------------

/** Why an announcement's text is refused: blank, or over 500 characters. */
export function announcementTextRefusal(text: string): GuildRefusal | null {
  if (text.trim() === "") return "announcement-empty";
  if (text.length > GUILD_ANNOUNCEMENT_MAX) return "announcement-length";
  return null;
}

/** Posting an announcement: an officer or the leader. */
export function postAnnouncementRefusal(actor: GuildRank, text: string): GuildRefusal | null {
  if (actor < GUILD_RANK.officer) return "rank";
  return announcementTextRefusal(text);
}

/** Editing or deleting an announcement (`text` null: deleting): an officer their own, the leader all. */
export function editAnnouncementRefusal(actor: GuildActor, author: string, text: string | null): GuildRefusal | null {
  if (actor.rank < GUILD_RANK.officer) return "rank";
  if (actor.rank < GUILD_RANK.leader && actor.address !== author) return "not-author";
  return text === null ? null : announcementTextRefusal(text);
}

/** The announcements kept: the `GUILD_ANNOUNCEMENTS_KEPT` latest, newest first. */
export const keepAnnouncements = <T extends { at: number }>(list: readonly T[]): T[] => [...list].sort((a, b) => b.at - a.at).slice(0, GUILD_ANNOUNCEMENTS_KEPT);

/** The log kept: its `GUILD_LOG_KEPT` latest entries, oldest first. */
export const keepLog = <T>(log: readonly T[]): T[] => log.slice(Math.max(0, log.length - GUILD_LOG_KEPT));

/** How many announcements a member has not read: those after `readAt` (seconds) by someone else. */
export const unreadAnnouncements = (list: readonly { at: number; author: string }[], reader: string, readAt: number): number => list.filter((a) => a.at > readAt && a.author !== reader).length;

// --- Members ---------------------------------------------------------------------------------------------------------

/** A member as the list and the rotation read them. */
export interface GuildRosterEntry extends GuildActor {
  crowns: number;
  /** When they joined, in seconds. */
  joinedAt: number;
  /** When they last played, in seconds. */
  lastSeen: number;
}

/** The members as the guild's page lists them: by rank, then by crowns, then by who joined first. */
export const sortGuildMembers = <T extends Omit<GuildRosterEntry, "lastSeen">>(members: readonly T[]): T[] =>
  [...members].sort((a, b) => b.rank - a.rank || b.crowns - a.crowns || a.joinedAt - b.joinedAt || (a.address < b.address ? -1 : a.address > b.address ? 1 : 0));

/** A guild's score: the sum of its members' crowns. */
export const guildScore = (members: readonly { crowns: number }[]): number => members.reduce((sum, m) => sum + m.crowns, 0);

/**
 * The leader's rotation (open point 9's default, as Clash Royale): when the leader has not played for 35 days, the
 * longest-serving officer who played within them becomes leader, or else the longest-serving such member. Null: the leader
 * stays (they played, or no one else did).
 */
export function rotatedLeader(members: readonly GuildRosterEntry[], now: number): string | null {
  const leader = members.find((m) => m.rank >= GUILD_RANK.leader);
  if (!leader || now - leader.lastSeen < GUILD_LEADER_IDLE_S) return null;
  const active = members.filter((m) => m !== leader && now - m.lastSeen < GUILD_LEADER_IDLE_S);
  const first = (rank: GuildRank) =>
    active.filter((m) => m.rank === rank).sort((a, b) => a.joinedAt - b.joinedAt || (a.address < b.address ? -1 : 1))[0] ?? null;
  return (first(GUILD_RANK.officer) ?? first(GUILD_RANK.member))?.address ?? null;
}

// --- Finding guilds --------------------------------------------------------------------------------------------------

/** A guild as the search, the suggestions and the ranking read it. */
export interface GuildListing extends GuildOpening {
  name: string;
  score: number;
  /** How active it is: its members who played lately, as the source counts them. */
  active: number;
}

/** The most guilds a search or a list answers. */
export const GUILD_LIST_LIMIT = 30;

/**
 * The guilds `query` finds: by tag (`#` and its digits), the one guild of that tag; else by name, from the start of a word
 * and whatever the case (`nameMatches`), those whose name starts with the query first. An empty query finds nothing.
 */
export function searchGuilds<T extends GuildListing>(guilds: readonly T[], query: string, limit = GUILD_LIST_LIMIT): T[] {
  const trimmed = query.trim();
  if (trimmed.startsWith("#")) {
    const id = parseGuildTag(trimmed);
    const found = id === null ? undefined : guilds.find((g) => g.id === id);
    return found ? [found] : [];
  }
  const q = normalQuery(query);
  const matched = guilds.filter((g) => nameMatches(g.name, q));
  const starts = (g: T) => g.name.toLowerCase().startsWith(q);
  return [...matched.filter(starts), ...matched.filter((g) => !starts(g))].slice(0, Math.max(0, limit));
}

/** Whether a player may apply to a guild (join it, or request to): not Invite only, not full, its requirements met, not theirs. */
export const mayApply = (player: GuildCandidate, guild: GuildOpening): boolean =>
  player.guild !== guild.id && guild.joinType !== "invite" && !guildFull(guild) && requirementsUnmet(player, guild.requirements) === null;

/** The guilds suggested to a player: those they may apply to (`mayApply`), the most active first, then by score. */
export const suggestGuilds = <T extends GuildListing>(guilds: readonly T[], player: GuildCandidate, limit = GUILD_LIST_LIMIT): T[] =>
  guilds.filter((g) => mayApply(player, g)).sort((a, b) => b.active - a.active || b.score - a.score || a.id - b.id).slice(0, Math.max(0, limit));

/** The search's filters: a join type, "requirements I meet" (the player), a member count's range. Each one left out filters nothing. */
export interface GuildFilters {
  joinType?: GuildJoinType;
  meets?: Pick<GuildCandidate, "level" | "crowns">;
  minMembers?: number;
  maxMembers?: number;
}

/** The guilds that pass every filter, in their given order. */
export const filterGuilds = <T extends GuildListing>(guilds: readonly T[], f: GuildFilters): T[] =>
  guilds.filter(
    (g) =>
      (f.joinType === undefined || g.joinType === f.joinType) &&
      (f.meets === undefined || requirementsUnmet(f.meets, g.requirements) === null) &&
      (f.minMembers === undefined || g.members >= f.minMembers) &&
      (f.maxMembers === undefined || g.members <= f.maxMembers),
  );

/** The guilds' ranking: by score, then by members, then the oldest (the lowest ID) first. */
export const rankGuilds = <T extends GuildListing>(guilds: readonly T[], limit = GUILD_LIST_LIMIT): T[] =>
  [...guilds].sort((a, b) => b.score - a.score || b.members - a.members || a.id - b.id).slice(0, Math.max(0, limit));
