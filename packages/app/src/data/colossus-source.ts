import type { ColossusCard, ColossusSeason } from "@paved/game-core";
import type { PublicProfile } from "./social-source";

// The Colossus's source (the weekly collective event, game-core's `colossus.ts`): the week's site as a player sees it (its gauge and
// tiers, its lots, the day's hard holes, the builders, their own hand and stones, last week's result), one board of it, and the
// player's writes. The mock's ledger answers it today (`data/mock/colossus.ts`): the whole event runs on the client, nothing on
// chain. Without one (the chain) the hooks answer `unavailable` and Play shows no Colossus card.

/** A builder of the ranking by stones set: their place (1 first), their week, and the Cobbles the place pays (0 past the 10th). */
export interface ColossusBuilderRow {
  place: number;
  profile: PublicProfile;
  tiles: number;
  stones: number;
  cobbles: number;
  /** The viewer's own row. */
  me: boolean;
}

/** A tier of the gauge: its share in percent, the stones it asks, its Cobbles, when it was reached, and whether the viewer claimed it. */
export interface ColossusTierState {
  share: number;
  stones: number;
  cobbles: number;
  /** Seconds since the epoch; null: not reached. */
  reachedAt: number | null;
  claimed: boolean;
}

/** A lot of the site's map: a district, or one of the heart's four (board 0). */
export interface ColossusLotState {
  board: number;
  name: string;
  col: number;
  row: number;
  heart: boolean;
  /** The board's cells, stones and holes left (the whole heart's for each of its four lots). */
  cells: number;
  stones: number;
  holes: number;
}

/** A hard hole of the day: where it is, the deck's cards that fit it, and how many builders hold one today (the viewer too). */
export interface ColossusHardHoleState {
  board: number;
  lot: string;
  x: number;
  y: number;
  cards: number;
  holders: number;
  mine: boolean;
}

/** The viewer's own week: their hand, their tiles and stones, their place, and what they can claim now. */
export interface ColossusMe {
  hand: ColossusCard[];
  tiles: number;
  stones: number;
  /** Their place among the builders; null: no tile laid yet. */
  place: number | null;
  /** The stones the 10th builder has more than them; 0: they are in the top 10 (or it is not full); null: no tile laid yet. */
  behind: number | null;
  /** Their name wears the season's stone: `COLOSSUS_NAME_TILES` tiles laid this week. */
  named: boolean;
  /** The Cobbles of the tiers reached and not claimed; 0: nothing, or no tile laid. */
  toClaim: number;
}

/** A finished Colossus as the viewer lived it: the gauge it reached, its plaque (the top 10 and the capstone), their own part. */
export interface ColossusResult {
  week: number;
  season: ColossusSeason;
  monument: string;
  /** The stone a builder's name wears. */
  stone: string;
  stones: number;
  cells: number;
  builders: number;
  /** When it was completed; null: the week ended first. */
  completedAt: number | null;
  /** Whoever laid the completing tile; null: not completed. */
  capstone: string | null;
  plaque: ColossusBuilderRow[];
  tiers: ColossusTierState[];
  /** The viewer's week; null: they laid no tile (and are paid nothing). */
  me: { place: number; tiles: number; stones: number; named: boolean; /** Tiers and top 10 together. */ cobbles: number; /** What is left to claim. */ toClaim: number } | null;
}

/** The week's Colossus as `viewer` sees it. */
export interface ColossusState {
  week: number;
  /** 0 Monday to 6 Sunday. */
  day: number;
  /** Sunday 24:00 UTC: the site closes, the next one opens. */
  endsAt: number;
  /** The next 00:00 UTC: three new tiles. */
  nextDayAt: number;
  season: ColossusSeason;
  monument: string;
  stone: string;
  /** The lots a side of the site's map. */
  side: number;
  cells: number;
  stones: number;
  builders: number;
  heartOpen: boolean;
  completedAt: number | null;
  capstone: string | null;
  tiers: ColossusTierState[];
  lots: ColossusLotState[];
  hardHoles: ColossusHardHoleState[];
  /** The ten first builders, then the viewer's own row when it is past them. */
  top: ColossusBuilderRow[];
  me: ColossusMe | null;
  /** Last week's Colossus. */
  result: ColossusResult;
}

/** A tile of a board as the viewer sees it: pre-built, a builder's or their own, a stone or not yet. */
export interface ColossusTileState {
  x: number;
  y: number;
  plan: number;
  orientation: number;
  stone: boolean;
  prebuilt: boolean;
  mine: boolean;
}

/** One board of the site: the heart or a district, its tiles, its sealed holes, and the viewer's hand. */
export interface ColossusBoardState {
  week: number;
  board: number;
  name: string;
  heart: boolean;
  /** Its side in cells; (0, 0) is the south-west corner. */
  size: number;
  /** It takes tiles: the week runs, the Colossus is not complete, and for the heart the gauge reached 50%. */
  open: boolean;
  tiles: ColossusTileState[];
  sealed: { x: number; y: number }[];
  holes: number;
  stones: number;
  hand: ColossusCard[];
}

/** Where a tile of the hand may go on a board: each cell and turn with the stones it would set, and the cells fair play refuses. */
export interface ColossusOptions {
  placements: { x: number; y: number; orientation: number; stones: number }[];
  /** The cells the tile's edges fit but where every turn would leave a hole (or two) that no card fills. */
  refused: { x: number; y: number }[];
}

/** A tile to lay: the hand's card, the board, the cell and the turn. */
export interface ColossusPlace {
  card: number;
  board: number;
  x: number;
  y: number;
  orientation: number;
}

/** What a tile laid did: its stones, the gauge before and after, the tiers reached, and the builder's totals and place after it. */
export interface ColossusPlaced {
  stones: number;
  before: number;
  after: number;
  cells: number;
  /** The shares (in percent) of the tiers the tile reached. */
  tiers: number[];
  heartOpened: boolean;
  completed: boolean;
  sealed: number;
  mine: { tiles: number; stones: number; place: number; builders: number };
}

/** The Colossus's reads and the player's writes. */
export interface ColossusSource {
  state(viewer: string | null): Promise<ColossusState>;
  /** Every builder of the week by stones set. */
  builders(viewer: string | null): Promise<ColossusBuilderRow[]>;
  /** A board of this week's site; refused (`not-available`) for a board the site does not have. */
  board(viewer: string | null, board: number): Promise<ColossusBoardState>;
  /** Where the viewer's tile `card` may go on `board`. */
  options(viewer: string, board: number, card: number): Promise<ColossusOptions>;
  /** Lays a tile of the player's hand; refused where the rules refuse it (the tile then stays in hand). */
  place(player: string, tile: ColossusPlace): Promise<ColossusPlaced>;
  /** The Cobbles the player can claim for `week`: this week's tiers reached, or last week's tiers and top 10. */
  claim(player: string, week: number): Promise<{ cobbles: number }>;
}
