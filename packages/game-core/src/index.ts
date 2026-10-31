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
