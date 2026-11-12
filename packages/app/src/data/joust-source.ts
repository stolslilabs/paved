import type { GuildEmblem, JoustOutcome, JoustPhase, ScoreBoost, SeededMove } from "@paved/game-core";
import type { PuzzleGameRecord } from "./puzzle-source";
import type { PublicProfile } from "./social-source";

// The Joust's source (the weekly allegiance event, game-core's `joust.ts`): the week as a player sees it (their allegiance, its
// registration, the match and both top 10, their own games, last week's result), the allegiances' rating, the games and the player's
// writes. The mock's ledger answers it today (`data/mock/joust.ts`): the whole event runs on the client, nothing on chain. Without one
// (the chain) the hooks answer `unavailable` and Play shows no Joust card.

/** An allegiance as the Joust shows it: its emblem and its name. */
export interface JoustGuild {
  id: number;
  name: string;
  emblem: GuildEmblem;
}

/** A jouster of a side's top 10: their best game and how many of their games they played (`JOUST_GAMES` at most). */
export interface JoustJouster {
  profile: PublicProfile;
  best: number;
  played: number;
}

/** One side of a match: its total (the sum of its ten best), its jousters who played, the games its members have left, its top 10. */
export interface JoustSide {
  guild: JoustGuild;
  rating: number;
  total: number;
  jousters: number;
  gamesLeft: number;
  top: JoustJouster[];
}

/** The week's match of the viewer's allegiance: both sides and the share it is expected to win. A bye has no opponent. */
export interface JoustMatch {
  own: JoustSide;
  opponent: JoustSide | null;
  /** Between 0 and 1, from the ratings; 1 on a bye. */
  expected: number;
}

/** The viewer's own joust: whether they may play, their games, their best and its place in their side, their game still open. */
export interface JoustMe {
  /** A member since before Friday 00:00: only they joust this week. */
  eligible: boolean;
  played: number;
  left: number;
  best: number | null;
  /** Their best's place among their allegiance's jousters, 1 first; null without a best. */
  place: number | null;
  open: { id: number; score: number } | null;
}

/** A finished joust as the viewer's allegiance lived it: the totals, the rating's move, the viewer's part and their Cobbles. */
export interface JoustResult {
  week: number;
  own: { guild: JoustGuild; total: number };
  opponent: { guild: JoustGuild; total: number } | null;
  outcome: JoustOutcome | "bye";
  ratingBefore: number;
  ratingAfter: number;
  /** The share the allegiance was expected to win, between 0 and 1. */
  expected: number;
  /** The viewer's best game and its place in their side; null: they did not joust. */
  best: number | null;
  place: number | null;
  /** The side's best game: its jouster's name and score. */
  champion: { name: string; score: number } | null;
  /** The Cobbles the viewer wins (0: they did not joust), and whether they claimed them. */
  cobbles: number;
  claimed: boolean;
}

/** The week's Joust as `viewer` sees it. */
export interface JoustState {
  week: number;
  phase: JoustPhase;
  /** The structure this joust doubles. */
  boost: ScoreBoost;
  /** Friday 00:00 UTC: the registration closes, the opponents are drawn. */
  opensAt: number;
  /** Sunday 24:00 UTC: the joust ends, the next week's registration opens. */
  endsAt: number;
  /** Today's deck seed, a felt's hex: the 38 cards of every game started today. */
  deckSeed: string;
  /** The viewer's allegiance; null: they are in none (or no viewer). */
  guild: (JoustGuild & { rating: number; /** Its members who may joust this week. */ members: number; /** The viewer may register it (an Officer or the Leader). */ canRegister: boolean }) | null;
  registered: boolean;
  /** From Friday, for a registered allegiance. */
  match: JoustMatch | null;
  me: JoustMe | null;
  /** Last week's joust of the viewer's allegiance; null: it did not joust. */
  result: JoustResult | null;
}

/** An allegiance of the Joust ranking: its rating and its last joust's move (null: it sat the last one out). */
export interface JoustRankingEntry {
  place: number;
  guild: JoustGuild;
  rating: number;
  change: number | null;
}

/** The allegiances by rating, after `jousts` jousts; the viewer's own and its peak rating (null: none). */
export interface JoustRanking {
  jousts: number;
  entries: JoustRankingEntry[];
  own: number | null;
  peak: number | null;
}

/** One joust game: a Puzzle game's record (its day's deck, its own draws), with its week, its allegiance, its boost and its number. */
export interface JoustGameRecord extends PuzzleGameRecord {
  week: number;
  guild: number;
  boost: ScoreBoost;
  /** The game's number among its player's of the week, 1 first. */
  game: number;
  /** When its joust ends: the game counts only when it ends before. */
  endsAt: number;
}

/** What a finished game did: the player's best and their allegiance's total before and after it, and their games left. */
export interface JoustGameResult {
  gameId: number;
  score: number;
  game: number;
  left: number;
  bestBefore: number | null;
  bestAfter: number | null;
  totalBefore: number;
  totalAfter: number;
  /** The game ended after its joust: it counts nowhere. */
  late: boolean;
}

/** The Joust's reads and the player's writes. */
export interface JoustSource {
  state(viewer: string | null): Promise<JoustState>;
  ranking(viewer: string | null): Promise<JoustRanking>;
  /** A game by its id; refused (`game-not-found`) for an id with no game. */
  game(gameId: number): Promise<JoustGameRecord>;
  /** A finished game's effect; refused for a game still open. */
  result(gameId: number): Promise<JoustGameResult>;
  /** Registers the player's allegiance for this week's joust: an Officer's or the Leader's, during the registration. */
  register(player: string): Promise<void>;
  /** A new game for the player; refused outside the joust, without a match, past their games, or while one is open. */
  start(player: string): Promise<JoustGameRecord>;
  /** One move of the player's open game; a build or a discard past the joust's end is refused, a surrender is not. */
  play(player: string, gameId: number, move: SeededMove): Promise<void>;
  /** The Cobbles of a finished joust the player played in. */
  claim(player: string, week: number): Promise<{ cobbles: number }>;
}
