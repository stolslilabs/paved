import type { MasterpieceEntry, MasterpieceKind, MasterpieceProspect, MasterpieceSeason, MasterpieceTier } from "@paved/game-core";

// The Masterpiece's source (the weekly individual event, game-core's `masterpiece.ts`): the week as a player sees it (the kind, the
// day, their board's masterpiece and its live place, last week's result), the live ranking with its bars and the Hall's records,
// their board and their writes. The mock's ledger answers it today (`data/mock/masterpiece.ts`): the whole event runs on the client,
// nothing on chain. Without one (the chain) the hooks answer `unavailable` and Play shows no Masterpiece card.

/** A player's board of a week as stored: its own random (the order it draws each day's cards in) and its log, played again to show it. */
export interface MasterpieceBoardRecord {
  week: number;
  player: string;
  /** The board's random, a felt's hex. */
  seed: string;
  log: MasterpieceEntry[];
  /** Sunday 24:00 UTC: the board freezes. */
  endsAt: number;
}

/** A masterpiece as the pages show it: its kind, its size and the engine's points for it. */
export interface MasterpieceShown {
  kind: MasterpieceKind;
  size: number;
  points: number;
}

/** A tier's bar as the week stands: the score that holds its last place; null while no masterpiece is counted. */
export interface MasterpieceBar {
  tier: MasterpieceTier;
  from: number | null;
}

/** The viewer's board as the week's page shows it. */
export interface MasterpieceBoardState {
  /** The masterpiece so far; null: no structure of the kind closed yet. */
  piece: MasterpieceShown | null;
  /** Its points less the discards'. */
  score: number;
  discards: number;
  /** Whether the percentiles count it (8 or more). */
  counted: boolean;
  /** The open structure of the kind worth the most if it closed now. */
  prospect: MasterpieceProspect | null;
  /** Tiles played (laid or discarded), laid, waiting today and still to come this week. */
  played: number;
  laid: number;
  waiting: number;
  toCome: number;
  /** Each day's tiles played, Monday first. */
  days: number[];
  /** The live place among the counted masterpieces and its tier; null while theirs is not counted. */
  place: number | null;
  tier: MasterpieceTier | null;
}

/** A finished week as the viewer lived it: their masterpiece, their place and tier, the week's master. */
export interface MasterpieceResult {
  week: number;
  season: MasterpieceSeason;
  kind: MasterpieceKind;
  piece: MasterpieceShown | null;
  score: number;
  discards: number;
  /** Their place among the week's counted masterpieces; null: theirs was not counted. */
  place: number | null;
  /** The week's counted masterpieces. */
  builders: number;
  tier: MasterpieceTier | null;
  /** The week's best masterpiece and its builder. */
  master: MasterpieceRow | null;
  /** The Cobbles of the tier (0: none), and whether they are claimed. */
  cobbles: number;
  claimed: boolean;
}

/** The week's Masterpiece as `viewer` sees it. */
export interface MasterpieceState {
  week: number;
  season: MasterpieceSeason;
  kind: MasterpieceKind;
  /** Today in the week: 0 Monday to 6 Sunday. */
  day: number;
  /** Sunday 24:00 UTC: the boards freeze, the next week's open. */
  endsAt: number;
  /** The counted masterpieces so far. */
  builders: number;
  /** The viewer's board; null: not opened this week (or no viewer). */
  board: MasterpieceBoardState | null;
  /** Last week's result; null: they had no board. */
  result: MasterpieceResult | null;
}

/** A line of the ranking: a builder's masterpiece and its place. */
export interface MasterpieceRow {
  place: number;
  name: string;
  size: number;
  score: number;
  /** The viewer's own line. */
  me: boolean;
}

/** A record of the Hall: a kind's best masterpiece of the weeks the source keeps. */
export interface MasterpieceRecord {
  kind: MasterpieceKind;
  season: MasterpieceSeason;
  week: number;
  name: string;
  size: number;
  score: number;
  me: boolean;
}

/** The week's live ranking: its first places, the viewer's line, the tiers' bars so far, and the Hall's records by kind. */
export interface MasterpieceRanking {
  week: number;
  kind: MasterpieceKind;
  builders: number;
  top: MasterpieceRow[];
  /** The viewer's line when it is not among `top`; null: there, or not counted. */
  me: MasterpieceRow | null;
  bars: MasterpieceBar[];
  hall: MasterpieceRecord[];
}

/** The first places the ranking lists. */
export const MASTERPIECE_TOP = 10;

/** The Masterpiece's reads and the player's writes. */
export interface MasterpieceSource {
  state(viewer: string | null): Promise<MasterpieceState>;
  ranking(viewer: string | null): Promise<MasterpieceRanking>;
  /** The player's board of this week; refused (`game-not-found`) when they have not opened it. */
  board(player: string): Promise<MasterpieceBoardRecord>;
  /** Opens the player's board of this week (the first visit creates it). */
  open(player: string): Promise<MasterpieceBoardRecord>;
  /** One move of the player's board of `week`: the tile in hand laid or discarded; refused with no tile waiting, or once the week is over. */
  play(player: string, week: number, move: MasterpieceEntry): Promise<void>;
  /** The Cobbles of a finished week's tier. */
  claim(player: string, week: number): Promise<{ cobbles: number }>;
}
