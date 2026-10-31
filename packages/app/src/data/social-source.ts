// The social source (#952, #957): what the social features read and write, on one source that the mock answers today and the
// chain and a service answer later (#956). The base (#952) gives the players' public profiles and the player search; the
// guilds (#953), the follows (#954) and the messages (#955) each add their part.

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

/** The social features' reads and writes. */
export interface SocialSource {
  /** The public profile of `address`, or null when no player has that ID. */
  profile(address: string): Promise<PublicProfile | null>;
  /**
   * The players a query finds (game-core's `searchPlayers`): by name, from the start of a word and whatever the case, or the
   * one player of an ID. The source may answer the connected player too: `usePlayerSearch` leaves them out.
   */
  searchPlayers(query: string): Promise<PublicProfile[]>;
}
