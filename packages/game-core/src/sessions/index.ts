// The game sessions (P2): Training's `LocalSession` and its save, Challenge's
// `PredictedSession` (P5), and the `PageSession` shape a board drives. No chain, no DOM: the chain's `GameSession`
// satisfies `PageSession` structurally.

export type { BoardTile, Closure, MoveSenders, PageSession, PageState, PlaceMove, ScoredStructure, Send } from "./types";
export { browserStore } from "./storage";
export type { KeyValueStore } from "./storage";
export { randomSeed } from "./seed";
export { TRAINING_KEY, clearGame, loadGame, saveGame } from "./training-storage";
export type { SavedGame, SavedMove } from "./training-storage";
export { LocalSession, openTraining, replayTraining, savedTrainingStatus } from "./local-session";
export { MAX_UNCONFIRMED, PredictedSession, replayChallenge } from "./predicted-session";
export type { ChainGame, ChainTile, Mismatch, MoveReceipt, PredictedOptions, PredictedState, PredictedViews } from "./predicted-session";
