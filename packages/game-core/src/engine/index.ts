// The off-chain game engine (E1): the rules of the contracts after D-18 and D-19, pure TypeScript.
// See `README.md` in this folder.

export {
  EngineGame,
  EngineError,
  multiplier,
  CENTER,
  DISCARD_POINTS,
  ROAD_BASE_POINTS,
  CITY_BASE_POINTS,
  FOREST_BASE_POINTS,
  WONDER_BASE_POINTS,
  BIG_SIZE,
  PREPLACED_ID,
} from "./game";
export type { EngineConfig, Placement, Scored, MoveResult, PlacedTile, Counters, ClosedStructure, OpenStructure } from "./game";
export { gameStats, SCORING_CATEGORIES } from "./stats";
export type { GameStats, CategoryStats, ScoringCategory } from "./stats";
export { DECKS } from "./decks";
export type { EngineDeck, DeckRules } from "./decks";
export { drawFromBitmap, withdrawExtra, poseidon, popcount } from "./draw";
export {
  VILLAGE_MAX_CELLS,
  VILLAGE_START_CELLS,
  VILLAGE_MAX_PARCELS,
  PARCEL_COBBLES,
  startTerritory,
  parcelPrice,
  parcelLevel,
  DEMOLITION_COBBLES,
  demolitionPrice,
} from "./village";
export type { Cell as TerritoryCell } from "./village";
