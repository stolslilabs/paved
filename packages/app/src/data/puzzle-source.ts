import type { SeededMove } from "@paved/game-core";
import type { PublicProfile } from "./social-source";

// The Puzzle's source (Play's Limited mode, `docs/architecture/puzzle-mode.md`): the day and its leaderboard, the player's games
// and their results, the prizes the day's first places win and their claims. The mock's ledger answers it today (`data/mock/
// puzzle.ts`); the chain's Puzzle system and the indexer will, behind the same interface. Without one (the chain today) the
// hooks answer `unavailable` and Play's card stays "Coming soon".

/** A player of a day's leaderboard: their profile, their best score of the day and their place, 1 first. */
export interface PuzzleEntry {
  profile: PublicProfile;
  score: number;
  place: number;
}

/** The leaderboard of a day: its first places (`PUZZLE_STANDING_LIMIT`), how many played, and the viewer's own place. */
export interface PuzzleStanding {
  day: number;
  /** When the day ends, in seconds since the epoch: its games rank until then. */
  endsAt: number;
  /** The day's seed, as a felt's hex: its deck (`puzzleDeck`). */
  seed: string;
  entries: PuzzleEntry[];
  /** Every player with a result that day. */
  players: number;
  /** The viewer's place and best score; null when they have no result that day (or no viewer). */
  me: { place: number; score: number } | null;
}

/** How many players a day's leaderboard lists. */
export const PUZZLE_STANDING_LIMIT = 50;

/** One Puzzle game: its day, its player, its own random (the draws), its moves, its score and its end (0 while open). */
export interface PuzzleGameRecord {
  id: number;
  day: number;
  player: string;
  /** The game's random, a felt's hex: its draws (`SeededChallenge`'s seed). */
  seed: string;
  /** The day's seed, a felt's hex: its deck. */
  deckSeed: string;
  moves: SeededMove[];
  score: number;
  over: boolean;
  start: number;
  end: number;
}

/** What a finished game did to its player's day: their best and their place before and after it. */
export interface PuzzleGameResult {
  gameId: number;
  day: number;
  score: number;
  /** The player's best of the day before this game; null: their first result of the day. */
  bestBefore: number | null;
  /** Their best after it; null: none (a first game that ended past its day). */
  bestAfter: number | null;
  /** Their place before this game; null: no result before. */
  placeBefore: number | null;
  /** Their place after it; null: no result. */
  placeAfter: number | null;
  /** Every player with a result that day, the player included once they have one. */
  players: number;
  /** The game ended after its day: it ranks nowhere. */
  late: boolean;
}

/** A day the player finished first: its score, the day's players and first ten, and whether its Cobbles were claimed. */
export interface PuzzlePrize {
  day: number;
  score: number;
  players: number;
  /** The day's final first places, the player's own among them. */
  top: PuzzleEntry[];
  claimed: boolean;
}

/** How many players a prize's mail lists. */
export const PUZZLE_PRIZE_TOP = 10;

/** The Puzzle's reads and the player's writes. */
export interface PuzzleSource {
  /** A day's leaderboard (`day` null: today's, by the source's clock) as `viewer` sees it. */
  standing(day: number | null, viewer: string | null): Promise<PuzzleStanding>;
  /** The player's game of today still open, or null. */
  activeGame(player: string): Promise<PuzzleGameRecord | null>;
  /** A game by its id; refused (`game-not-found`) for an id with no game. */
  game(gameId: number): Promise<PuzzleGameRecord>;
  /** A finished game's effect on its player's day; refused for a game still open. */
  result(gameId: number): Promise<PuzzleGameResult>;
  /** The days the player finished first, the newest first, claimed or not. */
  prizes(player: string): Promise<PuzzlePrize[]>;
  /** The player's visit to the Puzzle or the mailbox (the mock's welcome: a prize waiting, as its starting rewards). */
  visit(player: string): Promise<void>;
  /** A new game of today for the player; refused while one of today is open. */
  start(player: string): Promise<PuzzleGameRecord>;
  /** One move of the player's open game; refused when not legal, when the game is over, past its day (but a surrender). */
  play(player: string, gameId: number, move: SeededMove): Promise<void>;
  /** The Cobbles of the prizes of `days`, each a day the player finished first and has not claimed. */
  claim(player: string, days: readonly number[]): Promise<{ cobbles: number }>;
}
