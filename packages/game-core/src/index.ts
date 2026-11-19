// Types
export { OrientationType, Orientation } from "./types/orientation";
export { AreaType, Area } from "./types/area";
export { DirectionType, Direction } from "./types/direction";
export { SpotType, Spot } from "./types/spot";
export { Move } from "./types/move";
export { CategoryType, Category } from "./types/category";
export { ModeType, Mode } from "./types/mode";
export type { FeltLike, GameConfigInput, GameCreateOptions } from "./types/game-config";
export { validateGameConfigInput } from "./types/game-config";
export { PlanType, Plan } from "./types/plan";
export { Layout } from "./types/layout";

// Models
export { Game } from "./models/game";
export type { GameData } from "./models/game";
export { Player } from "./models/player";
export type { PlayerData } from "./models/player";
export { Tile } from "./models/tile";
export type { TileData } from "./models/tile";
export { Tournament } from "./models/tournament";
export type { TournamentData } from "./models/tournament";

// Layouts (re-export for direct access)
export { Configuration as CccccccccLayout } from "./layouts/ccccccccc";
export { Configuration as CccccfffcLayout } from "./layouts/cccccfffc";
export { Configuration as CccccfrfcLayout } from "./layouts/cccccfrfc";
export { Configuration as CfffcfffcLayout } from "./layouts/cfffcfffc";
export { Configuration as FfcfffcffLayout } from "./layouts/ffcfffcff";
export { Configuration as FfcfffffcLayout } from "./layouts/ffcfffffc";
export { Configuration as FfffcccffLayout } from "./layouts/ffffcccff";
export { Configuration as FfffffcffLayout } from "./layouts/ffffffcff";
export { Configuration as RfffrfcfrLayout } from "./layouts/rfffrfcfr";
export { Configuration as RfffrfffrLayout } from "./layouts/rfffrfffr";
export { Configuration as RfrfcccfrLayout } from "./layouts/rfrfcccfr";
export { Configuration as RfrfffcfrLayout } from "./layouts/rfrfffcfr";
export { Configuration as RfrfffffrLayout } from "./layouts/rfrfffffr";
export { Configuration as RfrfrfcffLayout } from "./layouts/rfrfrfcff";
export { Configuration as SfrfrfcfrLayout } from "./layouts/sfrfrfcfr";
export { Configuration as SfrfrfffrLayout } from "./layouts/sfrfrfffr";
export { Configuration as SfrfrfrfrLayout } from "./layouts/sfrfrfrfr";
export { Configuration as WffffffffLayout } from "./layouts/wffffffff";
export { Configuration as WfffffffrLayout } from "./layouts/wfffffffr";

// Decks
export { Base } from "./elements/decks/base";
export { Tutorial } from "./elements/decks/tutorial";
export { baseDeckPlans, deckSheetCounts, deckSheetOrder } from "./deck-sheet";
export type { DeckSheetCounts, DeckSheetOrder, DeckSheetPlan, DeckSheetSlot, DeckSheetSlotState } from "./deck-sheet";

// Game logic
export { Store } from "./store";
export type { Tiles } from "./store";

// Constants
export {
  ROAD_BASE_POINTS,
  FOREST_BASE_POINTS,
  CITY_BASE_POINTS,
  WONDER_BASE_POINTS,
  TOURNAMENT_ID_OFFSET,
  TOURNAMENT_DURATION,
} from "./constants";

// Utilities
export { getColor, offset, other_offset } from "./utils";

// Asset key helpers
export { getPlanKey, getTilePath } from "./asset-keys";

// Economy helpers
export {
  FP_SCALE_DEFAULT,
  fpToMultiplier,
  computeAdjustedReward,
  burnShare,
  guardedPaved,
  referenceReward,
  estimatedReference,
  rewardOf,
  winningScore,
  capScore,
  MEAN_SCALE,
  MEAN_MIN_SCORE,
  INITIAL_MEAN,
  newEma,
  emaMean,
  emaPush,
  dayAdd,
  dayMean,
  dayAverage,
  thresholdOfMean,
} from "./economy";
export type { Ema, MeanDay } from "./economy";

// Off-chain game engine (E1)
export {
  EngineGame,
  EngineError,
  multiplier as engineMultiplier,
  drawFromBitmap,
  withdrawExtra,
  poseidon,
  DECKS as ENGINE_DECKS,
  gameStats,
  SCORING_CATEGORIES,
  DISCARD_POINTS,
  VILLAGE_MAX_CELLS_LIMIT,
  VILLAGE_START_CELLS,
  VILLAGE_MAX_PARCELS,
  PARCEL_COBBLES,
  startTerritory,
  parcelPrice,
  parcelLevel,
  DEMOLITION_COBBLES,
  demolitionPrice,
  demolitionPayable,
  MAX_DEMOLITION_PRICE,
  ALL_AREAS,
} from "./engine";
export type {
  EngineConfig,
  ScoreBoost,
  EngineDeck,
  Placement as EnginePlacement,
  Scored as EngineScored,
  MoveResult as EngineMoveResult,
  PlacedTile as EnginePlacedTile,
  Counters as EngineCounters,
  ClosedStructure,
  ClosedAreas,
  TileAreas,
  OpenStructure,
  GameStats,
  CategoryStats,
  ScoringCategory,
  TerritoryCell,
} from "./engine";
// The starter's coordinates on chain (the contracts' `CENTER`)
export { CENTER } from "./engine";
// The structure state (a union-find over the placed tiles' areas), for a view that draws a structure across its tiles
export { StructureBoard } from "./engine/structures";
export type { StructureAreas, StructureTileInput } from "./engine/structures";

// Game sessions (P2): Training, Challenge's predicted session, the page session's shape
export * from "./sessions";

// The Puzzle (Play's Limited mode): the day, its deck, its prize and its ranking
export { PUZZLE_DAY_S, PUZZLE_PRIZE_COBBLES, PUZZLE_TILES, comparePuzzle, puzzleDayEnd, puzzleDayOf, puzzleDeck, puzzlePlaceAmong, rankPuzzle } from "./puzzle";
export type { PuzzleResult } from "./puzzle";
// The Joust (the weekly allegiance event): the calendar, the score, the rating, the pairing and the rewards
export {
  JOUST_BAND,
  JOUST_GAMES,
  JOUST_K,
  JOUST_LOSS_COBBLES,
  JOUST_REGISTRATION_S,
  JOUST_START_RATING,
  JOUST_TILES,
  JOUST_TOP,
  JOUST_WEEK_S,
  JOUST_WIN_COBBLES,
  joustBandOf,
  joustBoostOf,
  joustEndsAt,
  joustExpected,
  joustOpensAt,
  joustOutcome,
  joustPairs,
  joustPhaseOf,
  joustRatingChange,
  joustScore,
  joustWeekOf,
  joustWeekStart,
} from "./joust";
export type { JoustOutcome, JoustPhase, JoustScore } from "./joust";
// The Expedition (the weekly individual event): the calendar, the ration, the maps and their trail, the objectives and the tiers
export {
  EXPEDITION_BAG,
  EXPEDITION_BOUNDS,
  EXPEDITION_DAYS,
  EXPEDITION_DAY_S,
  EXPEDITION_HAND,
  EXPEDITION_LEVEL,
  EXPEDITION_MAPS,
  EXPEDITION_RATION,
  EXPEDITION_TIERS,
  EXPEDITION_WEEK_S,
  Expedition,
  expeditionBag,
  expeditionCells,
  expeditionDayOf,
  expeditionEndsAt,
  expeditionNextTier,
  expeditionOrder,
  expeditionSeasonOf,
  expeditionTierOf,
  expeditionWeekOf,
  expeditionWeekStart,
} from "./expedition";
export type {
  ExpeditionCard,
  ExpeditionDay,
  ExpeditionEntry,
  ExpeditionMap,
  ExpeditionMove,
  ExpeditionObjective,
  ExpeditionObjectiveId,
  ExpeditionProgress,
  ExpeditionSeason,
  ExpeditionSite,
  ExpeditionTier,
  ExpeditionTile,
} from "./expedition";
// The Masterpiece (the weekly individual event): the calendar, the day's cards, the masterpiece and its score, the ranking and its tiers
export {
  MASTERPIECE_DAILY,
  MASTERPIECE_DAYS,
  MASTERPIECE_DAY_S,
  MASTERPIECE_FLOOR,
  MASTERPIECE_KINDS,
  MASTERPIECE_TIERS,
  MASTERPIECE_TILES,
  MASTERPIECE_WEEK_S,
  Masterpiece,
  compareMasterpiece,
  masterpieceBars,
  masterpieceCards,
  masterpieceCounted,
  masterpieceDayOf,
  masterpieceEndsAt,
  masterpieceKindOf,
  masterpieceOf,
  masterpieceOrder,
  masterpiecePlaceAmong,
  masterpieceScore,
  masterpieceSeasonOf,
  masterpieceTierOf,
  masterpieceTierPlaces,
  masterpieceWeekOf,
  masterpieceWeekStart,
  masterpieceWorth,
} from "./masterpiece";
export type { MasterpieceEntry, MasterpieceKind, MasterpieceMove, MasterpiecePiece, MasterpieceProspect, MasterpieceResult, MasterpieceSeason, MasterpieceTier } from "./masterpiece";
// The Colossus (the weekly collective event): the calendar, the site, the hands, the placement, the stones and the rewards
export * from "./colossus";
// The Conquest (the season's finale, an allegiance event): the calendar, the world, the Offerings, the exploration, the placement, the majority, the tree and the rewards
export * from "./conquest";
// The Tournament (the weekly individual event): the calendar, the leagues' groups, the draw, who goes through and the rewards
export {
  TOURNAMENT_BYE,
  TOURNAMENT_CHAMPION_COBBLES,
  TOURNAMENT_COBBLES,
  TOURNAMENT_DAY_S,
  TOURNAMENT_LEAGUES,
  TOURNAMENT_MIN_GROUP,
  TOURNAMENT_ROUNDS,
  TOURNAMENT_SEATS,
  TOURNAMENT_TILES,
  TOURNAMENT_VACANT,
  TOURNAMENT_WEEK_S,
  tournamentBracketCount,
  tournamentCobbles,
  tournamentDraw,
  tournamentDuel,
  tournamentFirstRound,
  tournamentGroups,
  tournamentLeagueGroup,
  tournamentNextRound,
  tournamentPhaseOf,
  tournamentPlayersIn,
  tournamentPlaysIn,
  tournamentRoundDay,
  tournamentRoundEnd,
  tournamentRoundName,
  tournamentRoundOf,
  tournamentRoundStart,
  tournamentSeatOf,
  tournamentWeekOf,
  tournamentWeekStart,
  tournamentWinner,
} from "./tournament";
export type { TournamentGame, TournamentPhase } from "./tournament";

// Story mode (#546): campaigns, levels, runs and the device progress
export * from "./story";

// Formatting: every number and date on screen goes through here (P-66, en-US)
export {
  LOCALE,
  formatAgo,
  formatBoundary,
  formatBps,
  formatCompact,
  formatDate,
  formatFixed,
  formatInteger,
  formatNumber,
  formatPercent,
  formatRelative,
  formatUnits,
} from "./format";
export type { NumberOptions, RelativeOptions } from "./format";

// PvP v2 (#732, #741): the free village, slots and XP, starter layouts, the attack's deck and queue, chests, the daily shop
export * from "./rules";

// The social rules (#952, #957): the player search, who shows as online, the guilds (#953), the follows, friends and blocks (#954) and the messages (#955)
export * from "./social";
