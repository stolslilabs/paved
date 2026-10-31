import type { FollowRefusal } from "@paved/game-core";

// The social source (#952, #957): what the social features read and write, on one source that the mock answers today and the
// chain and a service answer later (#956). The base (#952) gives the players' public profiles and the player search; the
// follows (#954) add `follows`; the guilds (#953) and the messages (#955) each add their part.

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
