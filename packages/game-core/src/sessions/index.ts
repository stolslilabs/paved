// The game sessions (P2): Training's `LocalSession` and its save, Challenge's
// `PredictedSession` (P5), and the `PageSession` shape a board drives. No chain, no DOM: the chain's `GameSession`
// satisfies `PageSession` structurally.

export type { BoardTile, ClosedTileAreas, Closure, MoveSenders, PageSession, PageState, PlaceMove, ScoredStructure, Send } from "./types";
export { browserStore } from "./storage";
export type { KeyValueStore } from "./storage";
export { randomSeed } from "./seed";
export { closedOf } from "./closed";
export { TRAINING_KEY, TRAINING_VERSION, clearGame, loadGame, saveGame } from "./training-storage";
export type { SavedGame, SavedMove, SavedVersion } from "./training-storage";
export { LocalSession, TRAINING_LOOKAHEAD, openTraining, replayTraining, savedTrainingStatus, startTraining } from "./local-session";
export { MAX_UNCONFIRMED, PredictedSession, replayChallenge, replayVrfChallenge, supplyKnown } from "./predicted-session";
export type { ChainDraw, ChainGame, ChainTile, Mismatch, MoveReceipt, PredictedOptions, PredictedState, PredictedViews } from "./predicted-session";
export { offerPlans, placeInVillage, villageGame, villageRefusal } from "./village";
export type { VillageTileCodes } from "./village";
