// The alliance rules (ALLIANCES), pure: what an alliance is, who may do what in it, and its limits. An alliance is a union of
// guilds (the Leaderboard's Alliances icon: two guilds' shields over a laurel): up to `ALLIANCE_MAX_GUILDS` guilds under one name
// and emblem, ranked together by the sum of their scores. A player is in one through their guild, and a guild in one at most.
// Guild leaders act for their guilds; the founding guild is the alliance's head, and its leader leads the alliance (so the guild's
// own rules, Make leader and the leader's rotation, carry the alliance's leadership too). The mock applies the rules today
// (`packages/app/src/data/mock/alliances.ts`); the contract mirrors them later. Every check answers null when the action is
// allowed, else its typed reason (`AllianceRefusal`), which the source returns and the pages show.

import { GUILD_NAME_MAX, GUILD_NAME_MIN, GUILD_RANK, guildNameKey, normalGuildName, validEmblem, type GuildEmblem, type GuildRank } from "./guild";
import { nameMatches, normalQuery } from "./search";

// --- Limits ----------------------------------------------------------------------------------------------------------

/**
 * The most guilds of an alliance (ALLIANCES' proposal): five, so at most 250 players. Small enough that the ranking rewards strong
 * guilds over many guilds, and that the alliance's page lists its guilds without a search.
 */
export const ALLIANCE_MAX_GUILDS = 5;
/** An alliance's name: as a guild's, 3 to 20 characters, letters, digits and spaces, unique among the alliances. */
export const ALLIANCE_NAME_MIN = GUILD_NAME_MIN;
export const ALLIANCE_NAME_MAX = GUILD_NAME_MAX;
/** An alliance's description, at most (a guild's). */
export const ALLIANCE_DESCRIPTION_MAX = 150;
/** How long an invitation to a guild stays open, in seconds: 7 days, as a guild's to a player. */
export const ALLIANCE_INVITE_TTL_S = 7 * 86_400;
/** The most alliances a search or the ranking answers. */
export const ALLIANCE_LIST_LIMIT = 30;
/** The guild rank that acts for its guild in an alliance: the Leader alone (Officers have no alliance right in this step). */
export const ALLIANCE_ACTOR_RANK: GuildRank = GUILD_RANK.leader;

// --- Shapes ----------------------------------------------------------------------------------------------------------

/** A guild's place in its alliance: the head (the founder, or the guild it was handed to) or a member. */
export type AllianceRole = "head" | "member";

/** An alliance's emblem: a guild emblem's parts (a charge and three colours, the same sets), drawn on the alliance's laurel. */
export type AllianceEmblem = GuildEmblem;

/** What the head guild's leader edits. */
export interface AllianceSettings {
  emblem: AllianceEmblem;
  description: string;
}

/** A new alliance: its name and its settings. */
export interface AllianceDraft extends AllianceSettings {
  name: string;
}

/** A player acting for their guild: their guild (null: none), their rank in it, the guild's alliance and its role there. */
export interface AllianceActor {
  guild: number | null;
  rank: GuildRank | null;
  alliance: number | null;
  role: AllianceRole | null;
}

/** An alliance as the checks read it: its ID and its guild count. */
export interface AllianceOpening {
  id: number;
  guilds: number;
}

/** Why an action is refused. */
export type AllianceRefusal =
  /** The player is in no guild. */
  | "not-in-guild"
  /** The player does not lead their guild: only a guild's Leader acts for it. */
  | "not-leader"
  /** The guild is in an alliance already (creating, requesting, accepting; a guild invited while it is in one). */
  | "in-alliance"
  /** The guild is in no alliance, or the target guild not in the actor's. */
  | "not-in-alliance"
  /** The guild is in this alliance already. */
  | "member-already"
  /** Only the head guild's leader may (invite, answer, remove, hand over, edit). */
  | "not-head"
  | "name-length"
  | "name-chars"
  | "name-taken"
  | "description-length"
  | "emblem"
  | "full"
  /** The guild's request waits at an alliance already: one at a time. */
  | "request-pending"
  | "no-request"
  | "invited-already"
  | "invite-expired"
  /** The target guild is the actor's own (removing it, handing it the head). */
  | "self"
  /** The head guild leaves while other guilds remain: it hands the head to one of them first. */
  | "head-must-transfer"
  /** No alliance, guild, request or invitation of that ID. */
  | "not-found";

// --- Names and settings ----------------------------------------------------------------------------------------------

/** A name as the alliance keeps it: trimmed, its runs of spaces made one (a guild name's rule). */
export const normalAllianceName = normalGuildName;

/** A name's key for uniqueness: "Stone Pact" and "stone  pact" are one name. */
export const allianceNameKey = guildNameKey;

/** Why a name is refused (taken: `taken` holds its key), or null. */
export function allianceNameRefusal(name: string, taken: (key: string) => boolean = () => false): AllianceRefusal | null {
  const normal = normalAllianceName(name);
  if (normal.length < ALLIANCE_NAME_MIN || normal.length > ALLIANCE_NAME_MAX) return "name-length";
  if (!/^[A-Za-z0-9 ]+$/.test(normal)) return "name-chars";
  if (taken(allianceNameKey(normal))) return "name-taken";
  return null;
}

/** Why settings are refused, or null: the emblem's indexes in the guild emblems' sets, the description at most 150 characters. */
export function allianceSettingsInvalid(s: AllianceSettings): AllianceRefusal | null {
  if (!validEmblem(s.emblem)) return "emblem";
  if (s.description.length > ALLIANCE_DESCRIPTION_MAX) return "description-length";
  return null;
}

// --- Who acts --------------------------------------------------------------------------------------------------------

/** Why a player may not act for their guild (in none, or not its Leader), or null. */
export function actorRefusal(actor: Pick<AllianceActor, "guild" | "rank">): AllianceRefusal | null {
  if (actor.guild === null || actor.rank === null) return "not-in-guild";
  if (actor.rank < ALLIANCE_ACTOR_RANK) return "not-leader";
  return null;
}

/** Why a player may not act for the alliance (not the head guild's leader), or null. */
export function headRefusal(actor: AllianceActor): AllianceRefusal | null {
  const refused = actorRefusal(actor);
  if (refused) return refused;
  if (actor.alliance === null) return "not-in-alliance";
  if (actor.role !== "head") return "not-head";
  return null;
}

/** Whether a player leads the alliance: the head guild's leader. */
export const leadsAlliance = (actor: AllianceActor): boolean => headRefusal(actor) === null;

// --- Creating and editing ----------------------------------------------------------------------------------------------

/** Creating an alliance: a guild's leader, for a guild in no alliance, with a free name and valid settings. Free in this step. */
export function createAllianceRefusal(actor: AllianceActor, draft: AllianceDraft, taken?: (key: string) => boolean): AllianceRefusal | null {
  const refused = actorRefusal(actor);
  if (refused) return refused;
  if (actor.alliance !== null) return "in-alliance";
  return allianceNameRefusal(draft.name, taken) ?? allianceSettingsInvalid(draft);
}

/** Editing the emblem and the description: the head guild's leader. The name stays (as a guild's). */
export function editAllianceRefusal(actor: AllianceActor, settings: AllianceSettings): AllianceRefusal | null {
  return headRefusal(actor) ?? allianceSettingsInvalid(settings);
}

// --- Joining ---------------------------------------------------------------------------------------------------------

/** Whether an alliance is full. */
export const allianceFull = (alliance: Pick<AllianceOpening, "guilds">): boolean => alliance.guilds >= ALLIANCE_MAX_GUILDS;

/**
 * A guild's request to join (its leader, from the alliance's page): for a guild in no alliance, one pending request at a time
 * (`pending`: the alliance the guild's request waits at, or null), while the alliance has room. No message and no requirement in
 * this step: the head guild's leader sees the guild's page.
 */
export function requestAllianceRefusal(actor: AllianceActor, alliance: AllianceOpening, pending: number | null): AllianceRefusal | null {
  const refused = actorRefusal(actor);
  if (refused) return refused;
  if (actor.alliance !== null) return actor.alliance === alliance.id ? "member-already" : "in-alliance";
  if (pending !== null) return "request-pending";
  if (allianceFull(alliance)) return "full";
  return null;
}

/** Cancelling the guild's request: its leader, while there is one. */
export function cancelAllianceRequestRefusal(actor: AllianceActor, pending: number | null): AllianceRefusal | null {
  return actorRefusal(actor) ?? (pending === null ? "no-request" : null);
}

/** Answering a request: the head guild's leader; accepting, while the alliance has room and the guild is still in none. */
export function answerAllianceRequestRefusal(actor: AllianceActor, alliance: AllianceOpening, applicant: { alliance: number | null }, accept: boolean): AllianceRefusal | null {
  const refused = headRefusal(actor);
  if (refused || !accept) return refused;
  if (applicant.alliance !== null) return "in-alliance";
  if (allianceFull(alliance)) return "full";
  return null;
}

/**
 * Inviting a guild (from its page): the head guild's leader, a guild other than their own, in no alliance, not invited by this
 * alliance already, while the alliance has room.
 */
export function inviteGuildRefusal(actor: AllianceActor, alliance: AllianceOpening, target: { id: number; alliance: number | null; invited: boolean }): AllianceRefusal | null {
  const refused = headRefusal(actor);
  if (refused) return refused;
  if (target.id === actor.guild) return "self";
  if (target.alliance === alliance.id) return "member-already";
  if (target.alliance !== null) return "in-alliance";
  if (target.invited) return "invited-already";
  if (allianceFull(alliance)) return "full";
  return null;
}

/** Whether an invitation sent at `sentAt` is still open at `now` (seconds): it lapses after 7 days. */
export const allianceInvitationOpen = (sentAt: number, now: number): boolean => now - sentAt < ALLIANCE_INVITE_TTL_S;

/** Accepting an invitation: the invited guild's leader, while it is open, the guild still in no alliance and the alliance not full. */
export function acceptAllianceInvitationRefusal(actor: AllianceActor, invitation: { sentAt: number }, now: number, alliance: AllianceOpening): AllianceRefusal | null {
  const refused = actorRefusal(actor);
  if (refused) return refused;
  if (!allianceInvitationOpen(invitation.sentAt, now)) return "invite-expired";
  if (actor.alliance !== null) return actor.alliance === alliance.id ? "member-already" : "in-alliance";
  if (allianceFull(alliance)) return "full";
  return null;
}

/** Declining an invitation: the invited guild's leader. */
export const declineAllianceInvitationRefusal = (actor: AllianceActor): AllianceRefusal | null => actorRefusal(actor);

// --- Acting on guilds --------------------------------------------------------------------------------------------------

/** Removing a guild from the alliance (from its page): the head guild's leader, another guild of the alliance. */
export function removeGuildRefusal(actor: AllianceActor, target: { id: number; alliance: number | null }): AllianceRefusal | null {
  const refused = headRefusal(actor);
  if (refused) return refused;
  if (target.id === actor.guild) return "self";
  if (target.alliance !== actor.alliance) return "not-in-alliance";
  return null;
}

/** Handing the head to another guild of the alliance (from its page): the head guild's leader; their guild becomes a member. */
export const makeHeadRefusal = removeGuildRefusal;

/** Leaving: a guild's leader takes their guild out; the head guild only when alone, which disbands the alliance. */
export function leaveAllianceRefusal(actor: AllianceActor, guilds: number): AllianceRefusal | null {
  const refused = actorRefusal(actor);
  if (refused) return refused;
  if (actor.alliance === null) return "not-in-alliance";
  if (actor.role === "head" && guilds > 1) return "head-must-transfer";
  return null;
}

/** Whether a guild's leaving disbands the alliance: it is its last guild. */
export const leaveDisbandsAlliance = (guilds: number): boolean => guilds <= 1;

// --- The guilds of an alliance -----------------------------------------------------------------------------------------

/** A guild as the alliance's list and its succession read it. */
export interface AllianceGuildEntry {
  id: number;
  role: AllianceRole;
  score: number;
  /** When it joined the alliance, in seconds. */
  joinedAt: number;
}

/** The guilds as the alliance's page lists them: the head first, then by score, then the longest-serving. */
export const sortAllianceGuilds = <T extends AllianceGuildEntry>(guilds: readonly T[]): T[] =>
  [...guilds].sort((a, b) => (a.role === b.role ? 0 : a.role === "head" ? -1 : 1) || b.score - a.score || a.joinedAt - b.joinedAt || a.id - b.id);

/**
 * The head's successor when the head guild is gone (it disbanded, its last member having left): the longest-serving guild left, the
 * lowest ID first on a tie. Null when no guild is left (the alliance goes with it).
 */
export function nextHeadGuild(guilds: readonly Pick<AllianceGuildEntry, "id" | "joinedAt">[]): number | null {
  const first = [...guilds].sort((a, b) => a.joinedAt - b.joinedAt || a.id - b.id)[0];
  return first?.id ?? null;
}

/** An alliance's score: the sum of its guilds' scores, so of every member's crowns (the points the Players and Guilds tabs rank). */
export const allianceScore = (guilds: readonly { score: number }[]): number => guilds.reduce((sum, g) => sum + g.score, 0);

// --- Finding and ranking -------------------------------------------------------------------------------------------------

/** An alliance as the search and the ranking read it. */
export interface AllianceListing extends AllianceOpening {
  name: string;
  score: number;
}

/** The alliances' ranking: by score, then by guilds, then the oldest (the lowest ID) first. */
export const rankAlliances = <T extends AllianceListing>(alliances: readonly T[], limit = ALLIANCE_LIST_LIMIT): T[] =>
  [...alliances].sort((a, b) => b.score - a.score || b.guilds - a.guilds || a.id - b.id).slice(0, Math.max(0, limit));

/**
 * The alliances `query` finds by name, from the start of a word and whatever the case (`nameMatches`), those whose name starts with
 * it first; an empty query lists them by score (`rankAlliances`).
 */
export function searchAlliances<T extends AllianceListing>(alliances: readonly T[], query: string, limit = ALLIANCE_LIST_LIMIT): T[] {
  const q = normalQuery(query);
  if (q === "") return rankAlliances(alliances, limit);
  const matched = rankAlliances(alliances, alliances.length).filter((a) => nameMatches(a.name, q));
  const starts = (a: T) => a.name.toLowerCase().startsWith(q);
  return [...matched.filter(starts), ...matched.filter((a) => !starts(a))].slice(0, Math.max(0, limit));
}

/**
 * An alliance's place in the whole ranking (`rankAlliances`' order, 1 first), past `ALLIANCE_LIST_LIMIT` too, with its listing: the
 * viewer's own row, pinned when the list ends before it. Null when no alliance has that ID.
 */
export function alliancePlace<T extends AllianceListing>(alliances: readonly T[], id: number): { place: number; alliance: T } | null {
  const ranked = rankAlliances(alliances, alliances.length);
  const index = ranked.findIndex((a) => a.id === id);
  return index < 0 ? null : { place: index + 1, alliance: ranked[index]! };
}
