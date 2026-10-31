import type { FollowRefusal } from "@paved/game-core";

// The social source (#952, #957): what the social features read and write, on one source that the mock answers today and the
// chain and a service answer later (#956). The base (#952) gives the players' public profiles and the player search; the
// follows (#954) add `follows`; the guilds (#953) and the messages (#955) each add their part.

import type { GuildDraft, GuildEmblem, GuildFilters, GuildJoinType, GuildRank, GuildRefusal, GuildRequirements, GuildSettings } from "@paved/game-core";

/** Another player as anyone may see them (#952): what their public profile and a search result show. */
export interface PublicProfile {
  /** Their player ID. */
  address: string;
  /** Null: they have none (shown by their short address). */
  name: string | null;
  /** The avatar they saved, or the one the source gives them; null: their initial. */
  look: bigint | null;
  level: number;
  crowns: number;
  /** Their league on chain (0 Wood to 22 Grand Master, `Matchmaker.league`). */
  league: number;
  /** Their village's score. */
  score: number;
  /** When they were last seen, in seconds since the epoch: online within the last 5 minutes (`isOnline`, game-core). */
  lastSeen: number;
}

/** A player on one of the follow lists (#954): their public profile, and since when (the follow, the friendship or the block). */
export interface FollowRow {
  profile: PublicProfile;
  /** In seconds since the epoch: when the follow began (a friend: the later of the two follows; a blocked player: the block). */
  since: number;
  /** A follower who began to follow after the player last saw their followers (`seeFollowers`): marked until seen. */
  isNew: boolean;
}

/** The connected player's own lists (#954, open point 2's default: no one else's lists are read, only their counts). */
export interface FollowLists {
  /** The mutual follows; online first, then the most recently seen (game-core's `byPresence`), as the next two. */
  friends: FollowRow[];
  following: FollowRow[];
  followers: FollowRow[];
  /** The followers marked new: the Friends tab's badge and the Social button's (#952). */
  newFollowers: number;
  /** The players the player blocks, the latest block first. Their own to see only. */
  blocked: FollowRow[];
  /**
   * When the lists will next change by themselves, in seconds (the mock: a follow back due), or null. The hook reads them again
   * then, once: no polling.
   */
  nextChangeAt: number | null;
}

/** Another player as the connected player's profile sheet shows them (#954). Never says whether that player blocks them. */
export interface FollowStatus {
  /** The player follows them. */
  following: boolean;
  /** They follow the player: the "Follows you" mark. */
  followsYou: boolean;
  /** Both: the "Friend" mark. */
  friend: boolean;
  /** The player blocks them. */
  blocking: boolean;
  /** Their counts, which every profile shows. */
  followers: number;
  followed: number;
}

/** Why a follow write was refused: game-core's rule, or `unknown-player` for an ID no player has. */
export type FollowWriteRefusal = FollowRefusal | "unknown-player";

/**
 * A follow write the rules refused (#954). A `blocked` refusal is never shown as such: the block stays hidden from the blocked
 * player, so the page says only that the action is not available.
 */
export class FollowRefusedError extends Error {
  constructor(readonly reason: FollowWriteRefusal) {
    super(`Refused: ${reason}`);
    this.name = "FollowRefusedError";
  }
}

// --- The guilds (#953), on the same source (`guildSource`) ----------------------------------------------------------------

/** A guild as its card, the search, the suggestions and the ranking show it. */
export interface GuildSummary {
  id: number;
  /** Its tag, made from its ID (game-core's `guildTag`): `#` and its digits. */
  tag: string;
  name: string;
  emblem: GuildEmblem;
  description: string;
  joinType: GuildJoinType;
  requirements: GuildRequirements;
  /** Its member count, out of `GUILD_MAX_MEMBERS`. */
  members: number;
  /** The sum of its members' crowns. */
  score: number;
  /** Its members online now or seen within the last day: what "the most active first" sorts by. */
  active: number;
}

/** A player's guild as their profiles show it: its emblem, name and rank. */
export interface GuildBadge {
  id: number;
  tag: string;
  name: string;
  emblem: GuildEmblem;
  rank: GuildRank;
}

/** A member on the guild's page. */
export interface GuildMember {
  profile: PublicProfile;
  rank: GuildRank;
  /** When they joined, in seconds since the epoch. */
  joinedAt: number;
}

/** An announcement: plain text, pinned at the top of the guild's page. */
export interface GuildAnnouncement {
  id: number;
  author: string;
  /** The author's name when posted, or null: their short address. */
  authorName: string | null;
  text: string;
  at: number;
  /** When it was last edited, or null. */
  editedAt: number | null;
}

/** What the log records. */
export type GuildLogKind = "created" | "joined" | "left" | "kicked" | "promoted" | "demoted" | "leader" | "settings" | "announcement";

/** One line of the guild's log (#955 shows them in the guild's chat). */
export interface GuildLogEntry {
  kind: GuildLogKind;
  at: number;
  /** Who did it (joined, left: the player themselves; the leader by the rotation: the new leader). */
  actor: string;
  actorName: string | null;
  /** On whom (kicked, promoted, demoted, leader), else null. */
  target: string | null;
  targetName: string | null;
  /** A kick's reason, or null. */
  reason: string | null;
}

/** A join request, as the officers and the leader see it. */
export interface GuildRequest {
  profile: PublicProfile;
  /** Its message, or "". */
  message: string;
  sentAt: number;
}

/** An invitation the guild sent, as the officers and the leader see it. */
export interface GuildSentInvitation {
  profile: PublicProfile;
  inviter: string;
  sentAt: number;
  /** When it lapses (7 days on). */
  expiresAt: number;
}

/** A guild's page: its card, its members; for its members, the announcements and the log; for officers and the leader, the requests and invitations. */
export interface GuildView extends GuildSummary {
  /** By rank, then by crowns (game-core's `sortGuildMembers`). */
  roster: GuildMember[];
  /** The viewer's rank, or null when they are not a member. */
  rank: GuildRank | null;
  /** Newest first; null for a viewer outside the guild. */
  announcements: GuildAnnouncement[] | null;
  /** Oldest first, the last `GUILD_LOG_KEPT`; null for a viewer outside the guild. */
  log: GuildLogEntry[] | null;
  /** Oldest first; null below Officer. */
  requests: GuildRequest[] | null;
  /** Newest first; null below Officer. */
  invitations: GuildSentInvitation[] | null;
  /** When the viewer may kick next (an officer's 20 minutes), in seconds; null when they may not kick. */
  nextKickAt: number | null;
}

/** An invitation a player holds. */
export interface GuildInvitation {
  guild: GuildSummary;
  inviter: string;
  inviterName: string | null;
  sentAt: number;
  expiresAt: number;
}

/** The connected player's guild state: what the Guild tab opens on, and its badge. */
export interface PlayerGuild {
  /** Their guild's page, or null: guildless. */
  guild: GuildView | null;
  /** Their pending join request, or null. */
  request: { guild: GuildSummary; message: string; sentAt: number } | null;
  /** The invitations they hold, open ones only, newest first. */
  invitations: GuildInvitation[];
  /** Their guild's announcements they have not read. */
  unread: number;
  /** The Guild tab's badge: the invitations, the unread announcements and, for officers and the leader, the requests. */
  badge: number;
}

/** The guild search: a query (by name or tag; "" lists every guild) and its filters. */
export interface GuildQuery {
  query: string;
  joinType?: GuildJoinType;
  /** "Requirements I meet": the connected player's ID. */
  meetsFor?: string;
  minMembers?: GuildFilters["minMembers"];
  maxMembers?: GuildFilters["maxMembers"];
}

/** A guild write refused by game-core's rules (`packages/game-core/src/social/guild.ts`): the page shows its reason. */
export class GuildRefusedError extends Error {
  constructor(readonly reason: GuildRefusal) {
    super(`guild: ${reason}`);
    this.name = "GuildRefusedError";
  }
}

/**
 * The follows, friends and blocks (#954), by game-core's rules (`social/follow.ts`). Each write is the connected player's
 * (`player`), resolves once kept, and refuses with a `FollowRefusedError`; a no-op (following twice, unfollowing a player not
 * followed) resolves as a write.
 */
export interface FollowSource {
  /** The player's own lists. */
  lists(player: string): Promise<FollowLists>;
  /** Another player as `player` sees them: the marks and their counts. */
  status(player: string, other: string): Promise<FollowStatus>;
  /**
   * Whom `player` may follow (game-core's `suggestFollows`): the followers not followed back, the guild's members (#953), the
   * recent PvP opponents, then the community.
   */
  suggestions(player: string): Promise<PublicProfile[]>;
  follow(player: string, target: string): Promise<void>;
  unfollow(player: string, target: string): Promise<void>;
  /** Ends `follower`'s follow of the player; they are not told. */
  removeFollower(player: string, follower: string): Promise<void>;
  /** Blocks `target`: each one's follow of the other ends. */
  block(player: string, target: string): Promise<void>;
  unblock(player: string, target: string): Promise<void>;
  /** The player saw their followers: none is marked new any more. */
  seeFollowers(player: string): Promise<void>;
}

/**
 * The guilds' reads and writes (#953). `player` is the connected player: the mock trusts it, a service will authenticate it
 * (#956). A write resolves once applied, or rejects with a `GuildRefusedError`.
 */
export interface GuildSource {
  playerGuild(player: string): Promise<PlayerGuild>;
  /** A guild's page as `viewer` sees it (null: anyone), or null when no guild has that ID. */
  guild(id: number, viewer: string | null): Promise<GuildView | null>;
  /** The guild `address` is in, as their profiles show it, or null. */
  guildOf(address: string): Promise<GuildBadge | null>;
  /** The guilds a query finds and its filters pass (game-core's `searchGuilds` and `filterGuilds`); "" lists them by score. */
  searchGuilds(query: GuildQuery): Promise<GuildSummary[]>;
  /** The guilds `player` may join, the most active first (game-core's `suggestGuilds`). */
  suggestedGuilds(player: string): Promise<GuildSummary[]>;
  /** The guilds by score (game-core's `rankGuilds`). */
  guildRanking(): Promise<GuildSummary[]>;
  /** Creates a guild; the player becomes its Leader. Resolves with its ID. */
  createGuild(player: string, draft: GuildDraft): Promise<number>;
  editGuild(player: string, settings: GuildSettings): Promise<void>;
  joinGuild(player: string, guild: number): Promise<void>;
  requestToJoin(player: string, guild: number, message: string): Promise<void>;
  cancelRequest(player: string): Promise<void>;
  answerRequest(player: string, applicant: string, accept: boolean): Promise<void>;
  invite(player: string, target: string): Promise<void>;
  /** Accepts or declines an invitation; accepting from another guild needs `leaving` (the player confirmed leaving it). */
  answerInvitation(player: string, guild: number, accept: boolean, leaving?: boolean): Promise<void>;
  kick(player: string, target: string, reason: string): Promise<void>;
  promote(player: string, target: string): Promise<void>;
  demote(player: string, target: string): Promise<void>;
  makeLeader(player: string, target: string): Promise<void>;
  /** Leaves the guild; its last member disbands it. */
  leaveGuild(player: string): Promise<void>;
  postAnnouncement(player: string, text: string): Promise<void>;
  editAnnouncement(player: string, id: number, text: string): Promise<void>;
  deleteAnnouncement(player: string, id: number): Promise<void>;
  /** Marks the guild's announcements read (the Guild tab's badge). */
  readAnnouncements(player: string): Promise<void>;
  /** The player opened the Guild tab: the mock's invitation comes a minute after the first visit (open point 10's default). */
  visitGuildTab(player: string): Promise<void>;
}

/** The social features' reads and writes. */
export interface SocialSource {
  /** The public profile of `address`, or null when no player has that ID. */
  profile(address: string): Promise<PublicProfile | null>;
  /**
   * The players a query finds (game-core's `searchPlayers`): by name, from the start of a word and whatever the case, or the
   * one player of an ID. The source may answer the connected player too: `usePlayerSearch` leaves them out.
   */
  searchPlayers(query: string): Promise<PublicProfile[]>;
  /** The follows, friends and blocks (#954); left out, their hooks answer `unavailable`. */
  follows?: FollowSource;
}

/**
 * The guild part of a social source (#953), or null when it serves none (then the guild hooks answer `unavailable`). Its
 * methods sit on the source itself, as `layoutSlotViews` reads the views', so that the mock's lazy source serves them too.
 */
export function guildSource(social: SocialSource | null | undefined): GuildSource | null {
  const s = social as (SocialSource & Partial<GuildSource>) | null | undefined;
  return s && typeof s.playerGuild === "function" && typeof s.createGuild === "function" ? (s as SocialSource & GuildSource) : null;
}
