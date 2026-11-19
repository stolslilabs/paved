import type { FairSeason, SeededMove } from "@paved/game-core";
import type { PuzzleGameRecord } from "./puzzle-source";
import type { PublicProfile } from "./social-source";

// The Fair's source (the weekly individual event, game-core's `fair.ts`): the week as a player sees it (the stall, their tries, their
// best and its place, last week's result), the live ranking and its bars, a try (its draft, then its game) and the player's writes.
// The mock's ledger answers it today (`data/mock/fair.ts`): the whole event runs on the client, nothing on chain. Without one (the
// chain) the hooks answer `unavailable` and Play shows no Fair card.

/** Where a try is: its draft, its game (the deck built), or left during its draft (spent, with no score). */
export type FairStage = "draft" | "game" | "abandoned";

/** The viewer's try still open: its stage, the tiles of its deck so far, its game's score. */
export interface FairOpenTry {
  id: number;
  stage: "draft" | "game";
  /** The offers answered or passed so far, of `FAIR_OFFERS`. */
  offers: number;
  tiles: number;
  score: number;
}

/** The viewer's own week: their tries of today, their try still open, their best and where it stands. */
export interface FairMe {
  /** The tries started today, and those left (`FAIR_TRIES` a day, none carried over). */
  triesToday: number;
  triesLeft: number;
  open: FairOpenTry | null;
  /** Their best try's score this week; null: none finished. */
  best: number | null;
  /** Its place among the counted players and its tier (an index of `FAIR_TIERS`); null: no best, or one under `FAIR_FLOOR`. */
  place: number | null;
  tier: number | null;
}

/** A week's champion: their best try and its deck (market cards, in pick order). */
export interface FairChampion {
  profile: PublicProfile;
  score: number;
  cards: number[];
}

/** A finished week as the viewer lived it: their best, its place and tier, their Cobbles, and the champion with their deck. */
export interface FairResult {
  week: number;
  season: FairSeason;
  /** The players whose best counted. */
  players: number;
  best: number | null;
  place: number | null;
  tier: number | null;
  /** The Cobbles the viewer wins (0: no counted try), and whether they claimed them. */
  cobbles: number;
  claimed: boolean;
  champion: FairChampion | null;
}

/** The week's Fair as `viewer` sees it. */
export interface FairState {
  week: number;
  /** The season of the week's stall. */
  season: FairSeason;
  /** The day of the week, 0 Monday to 6 Sunday. */
  day: number;
  /** The next UTC midnight: the tries come back. */
  dayEndsAt: number;
  /** Sunday 24:00 UTC: the week ends, the next one starts. */
  endsAt: number;
  /** The players whose best counts so far. */
  players: number;
  /** Null: no viewer. */
  me: FairMe | null;
  /** Last week's result; null: the viewer finished no try in it (or no viewer). */
  result: FairResult | null;
}

/** A player of the live ranking: their best try, its place and tier, and its deck's size and mythics. */
export interface FairEntry {
  profile: PublicProfile;
  score: number;
  place: number;
  tier: number;
  tiles: number;
  mythics: number;
}

/** How many first places the live ranking lists. */
export const FAIR_RANKING_LIMIT = 10;

/** One of the viewer's tries of the week, as their own list shows it. */
export interface FairTryLine {
  id: number;
  /** The day of the week it started, 0 Monday to 6 Sunday, and its number among that day's. */
  day: number;
  try: number;
  stage: FairStage;
  over: boolean;
  score: number;
  tiles: number;
  mythics: number;
  /** The week's best so far. */
  best: boolean;
}

/**
 * The week's ranking so far: its first places (`FAIR_RANKING_LIMIT`), the viewer's own and, when they stand past those, the places
 * around them (`around`: the one above, their own, the one below); each tier's bar (its least score; null: nobody in it yet); the
 * viewer among their friends (the mutual follows, places 1 first among them); and the viewer's own tries of the week, the oldest first.
 */
export interface FairRanking {
  week: number;
  players: number;
  entries: FairEntry[];
  around: FairEntry[];
  me: { place: number; score: number; tier: number } | null;
  bars: (number | null)[];
  friends: FairEntry[];
  tries: FairTryLine[];
}

/**
 * One try: a Puzzle game's record (its own random, its moves, its score) with its week, its draft and its deck. `cards` are the deck's
 * market cards in pick order, the game's deck once the draft is over (`stage: "game"`); `deckSeed` is unused (the deck is the draft's).
 */
export interface FairTryRecord extends PuzzleGameRecord {
  week: number;
  season: FairSeason;
  /** The try's number among its player's of its day, 1 first. */
  try: number;
  stage: FairStage;
  /** The draft's choices (0 to 2), one per offer answered: with `seed`, the whole draft (`FairDraft.replay`). */
  picks: number[];
  cards: number[];
  /** When its week ends: the try counts only when its game ends before. */
  endsAt: number;
}

/** What a finished try did: the player's best before and after it, where that stands now, and their tries left today. */
export interface FairTryResult {
  tryId: number;
  score: number;
  try: number;
  left: number;
  bestBefore: number | null;
  bestAfter: number | null;
  /** The best after it counts (`FAIR_FLOOR` or more): its place among the counted players, and its tier. */
  place: number | null;
  tier: number | null;
  players: number;
  /** The game ended after its week: it counts nowhere. */
  late: boolean;
}

/** The Fair's reads and the player's writes. */
export interface FairSource {
  state(viewer: string | null): Promise<FairState>;
  ranking(viewer: string | null): Promise<FairRanking>;
  /** A try by its id; refused (`game-not-found`) for an id with no try. */
  game(tryId: number): Promise<FairTryRecord>;
  /** A finished try's effect; refused for a try still open. */
  result(tryId: number): Promise<FairTryResult>;
  /** A new try for the player, spent from its first offer; refused past today's tries or while one is open. */
  start(player: string): Promise<FairTryRecord>;
  /** Takes tile `choice` (0 to 2) of offer `offer` of the player's draft; refused when that offer is not the one on the table. */
  pick(player: string, tryId: number, offer: number, choice: number): Promise<FairTryRecord>;
  /** Leaves a try during its draft: it is spent, with no score. */
  abandon(player: string, tryId: number): Promise<void>;
  /** One move of the try's game; a build or a discard past the week's end is refused, a surrender is not. */
  play(player: string, tryId: number, move: SeededMove): Promise<void>;
  /** The Cobbles of a finished week the player has a counted try in. */
  claim(player: string, week: number): Promise<{ cobbles: number }>;
}
