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
export type { EngineConfig, Placement, Scored, MoveResult, PlacedTile, Counters } from "./game";
export { DECKS } from "./decks";
export type { EngineDeck, DeckRules } from "./decks";
export { drawFromBitmap, withdrawExtra, poseidon, popcount } from "./draw";
