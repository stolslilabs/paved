import type { ExpeditionDay, ExpeditionEntry, ExpeditionObjectiveId, ExpeditionProgress, ExpeditionSeason, ExpeditionTier } from "@paved/game-core";

// The Expedition's source (the weekly individual event, game-core's `expedition.ts`): the week as a player sees it (the map, their
// board's day, hand and landmarks, last week's result), their board and their writes. The mock's ledger answers it today
// (`data/mock/expedition.ts`): the whole event runs on the client, nothing on chain. Without one (the chain) the hooks answer
// `unavailable` and Play shows no Expedition card.

/** A player's board of a week as stored: its own random (the order it draws the week's bag in) and its log, played again to show it. */
export interface ExpeditionBoardRecord {
  week: number;
  player: string;
  /** The board's random, a felt's hex. */
  seed: string;
  log: ExpeditionEntry[];
  /** Sunday 24:00 UTC: the board takes no tile after. */
  endsAt: number;
}

/** The viewer's board as the week's page shows it. */
export interface ExpeditionBoardState {
  score: number;
  /** The board's own points (its structures, less the discards) and the landmarks' bonuses. */
  boardScore: number;
  bonus: number;
  /** Tiles in hand, laid, and still to come in the week's bag. */
  hand: number;
  laid: number;
  toCome: number;
  /** What opening the board now brings: the rations due since the last day drawn, and those a full hand loses. */
  due: { drawn: number; lost: number };
  objectives: ExpeditionProgress[];
  /** The week's seven days, Monday first. */
  days: ExpeditionDay[];
  tier: ExpeditionTier | null;
  next: ExpeditionTier | null;
}

/** A landmark of a finished week: whether the viewer did it, and the share of the week's explorers who did (0 to 1). */
export interface ExpeditionLandmarkResult {
  id: ExpeditionObjectiveId;
  title: string;
  done: boolean;
  share: number;
}

/** A finished week as the viewer lived it: their score, their tier and its Cobbles, what everyone else reached. */
export interface ExpeditionResult {
  week: number;
  season: ExpeditionSeason;
  map: string;
  score: number;
  boardScore: number;
  bonus: number;
  tier: ExpeditionTier | null;
  landmarks: ExpeditionLandmarkResult[];
  /** The week's explorers. */
  explorers: number;
  /** The Cobbles of the tier (0: none reached), and whether they are claimed. */
  cobbles: number;
  claimed: boolean;
}

/** The week's Expedition as `viewer` sees it. */
export interface ExpeditionState {
  week: number;
  season: ExpeditionSeason;
  /** The map's name ("The Sacred Wood"). */
  map: string;
  /** Today in the week: 0 Monday to 6 Sunday. */
  day: number;
  /** Sunday 24:00 UTC: the week ends, the next one's board opens. */
  endsAt: number;
  /** The viewer's board; null: not opened this week (or no viewer). */
  board: ExpeditionBoardState | null;
  /** The viewer's level (the claim asks `EXPEDITION_LEVEL`); null without a viewer. */
  level: number | null;
  /** Last week's result; null: they had no board. */
  result: ExpeditionResult | null;
}

/** A move of a board: a tile of the hand laid or discarded (the day's draw is `open`'s). */
export type ExpeditionPlay = Exclude<ExpeditionEntry, { k: "draw" }>;

/** The Expedition's reads and the player's writes. */
export interface ExpeditionSource {
  state(viewer: string | null): Promise<ExpeditionState>;
  /** The player's board of this week; refused (`game-not-found`) when they have not opened it. */
  board(player: string): Promise<ExpeditionBoardRecord>;
  /** Opens the player's board of this week (the first visit writes the map) and draws the rations due today. */
  open(player: string): Promise<ExpeditionBoardRecord>;
  /** One move of the player's board of `week`; refused once the week is over. */
  play(player: string, week: number, move: ExpeditionPlay): Promise<void>;
  /** The Cobbles of a finished week's tier; refused under `EXPEDITION_LEVEL`. */
  claim(player: string, week: number): Promise<{ cobbles: number }>;
}
