import type { SeededMove, TournamentPhase } from "@paved/game-core";
import type { PuzzleGameRecord } from "./puzzle-source";

// The Tournament's source (the weekly individual event, game-core's `tournament.ts`): the week as a player sees it (their league,
// the registration, their run through their bracket round by round, the last eight, last week's run), the games and the player's
// writes. The mock's ledger answers it today (`data/mock/tournament.ts`): the whole event runs on the client, nothing on chain.
// Without one (the chain) the hooks answer `unavailable` and Play shows no Tournament card.

/** A player of a bracket: their name, and whether they have a profile to open (the mock's field has none). */
export interface TournamentPlayer {
  address: string;
  name: string;
  profile: boolean;
}

/** A game of a round as the bracket counts it: its score (an unfinished game's at its last move), when it was played, whether it is over. */
export interface TournamentPlayed {
  score: number;
  at: number;
  over: boolean;
}

/**
 * One round of a player's run. `bye`: the seat opposite was empty at the draw, the round is skipped. `duel`: an opponent, one game
 * each. `walkover`: the match opposite was played by nobody, the player goes through by playing the round's game.
 */
export interface TournamentStep {
  round: number;
  kind: "bye" | "duel" | "walkover";
  opponent: TournamentPlayer | null;
  own: TournamentPlayed | null;
  theirs: TournamentPlayed | null;
  /** `pending` until the round's day is over; `skipped`: a bye. */
  outcome: "won" | "lost" | "skipped" | "pending";
}

/** A match of the last eight (the quarter-finals on): both sides (null: an empty seat) and, once its day is over, who went through. */
export interface TournamentMatch {
  round: number;
  a: { player: TournamentPlayer; score: number | null } | null;
  b: { player: TournamentPlayer; score: number | null } | null;
  winner: "a" | "b" | null;
}

/**
 * Where a run stands. `waiting`: a bye today, the first duel is later. `to-play`: today's game is to play. `playing`: it is open.
 * `played`: it is over, the day decides. `out`: a duel lost. `champion`: the final won.
 */
export type TournamentStatus = "waiting" | "to-play" | "playing" | "played" | "out" | "champion";

/** A player's run through their bracket: a week's, as far as its rounds went. */
export interface TournamentRun {
  week: number;
  /** The league group the player plays in, and the one they registered in when it was carried down (else the same). */
  league: string;
  registeredIn: string;
  /** Their bracket's number among the group's, 1 first, and its players. */
  bracket: number;
  brackets: number;
  players: number;
  /** Each round they were in, the first to the last reached. */
  path: TournamentStep[];
  status: TournamentStatus;
  /** The last round reached. */
  reached: number;
  /** The round of their first duel, known from the draw (a bye skips the rounds before); null: alone in the bracket. */
  firstDuel: number | null;
  /** Their game still open: a tap resumes it. */
  open: { id: number; score: number } | null;
  /** The Cobbles the run has won so far; claimed once it is over (the day after the last match). */
  cobbles: number;
  claimable: boolean;
  claimed: boolean;
  /** The last eight of their bracket, as far as it is known: the quarter-finals, the semi-finals, the final. */
  finals: TournamentMatch[];
}

/** The week's Tournament as `viewer` sees it. */
export interface TournamentState {
  week: number;
  phase: TournamentPhase;
  /** Today's round: 0 on Monday (the registration), 1 (Tuesday) to 6 (Sunday's final). */
  round: number;
  /** 24:00 UTC today: the registration closes, or the round ends. */
  endsAt: number;
  /** The viewer's league group now, by name: where they register. Null: no viewer. */
  league: string | null;
  registered: boolean;
  /** The players registered in the viewer's league group so far. */
  entrants: number;
  /** Today's round's deck seed, a felt's hex: the 38 cards of every game of the round. Null on Monday. */
  deckSeed: string | null;
  /** The viewer's run this week, from Tuesday; null: not registered. */
  run: TournamentRun | null;
  /** Their run of last week; null: they were not in it. */
  last: TournamentRun | null;
}

/** One tournament game: a Puzzle game's record (its round's deck, its own draws), with its week, its round and its round's end. */
export interface TournamentGameRecord extends PuzzleGameRecord {
  week: number;
  round: number;
  /** When its round ends: a build or a discard past it is refused. */
  endsAt: number;
  /** The opponent's score when the game was read, the target to pass; null: they have not played (or there is none). */
  target: number | null;
}

/**
 * What a finished game did. `waiting`: the opponent has not played yet. `ahead`, `behind`: against their game, the day not over.
 * `won`, `lost`: the day is over.
 */
export interface TournamentGameResult {
  gameId: number;
  score: number;
  round: number;
  opponent: TournamentPlayer | null;
  theirs: TournamentPlayed | null;
  standing: "waiting" | "ahead" | "behind" | "won" | "lost";
  /** The Cobbles going through secures: the next round's, the champion's after the final. */
  secures: number;
}

/** The Tournament's reads and the player's writes. */
export interface TournamentSource {
  state(viewer: string | null): Promise<TournamentState>;
  /** A game by its id; refused (`game-not-found`) for an id with no game. */
  game(gameId: number): Promise<TournamentGameRecord>;
  /** A finished game's standing in its duel; refused for a game still open. */
  result(gameId: number): Promise<TournamentGameResult>;
  /** Registers the player in their league's group: on Monday, once. */
  register(player: string): Promise<void>;
  /** The player's game of today's round; refused outside the rounds, without a duel today, once out, or after their one game. */
  start(player: string): Promise<TournamentGameRecord>;
  /** One move of the player's open game; a build or a discard past the round's end is refused, a surrender is not. */
  play(player: string, gameId: number, move: SeededMove): Promise<void>;
  /** The Cobbles of a run that is over. */
  claim(player: string, week: number): Promise<{ cobbles: number }>;
}
