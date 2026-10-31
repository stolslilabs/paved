// The game sessions (P2): Training's `LocalSession` (held in memory, never saved: #718), Challenge's
// `PredictedSession` (P5), the mock's seeded Challenge game (#927), and the `PageSession` shape a board drives. No chain, no DOM: the chain's `GameSession`
// satisfies `PageSession` structurally.

export type { BoardTile, ClosedTileAreas, Closure, MoveSenders, PageSession, PageState, PlaceMove, ScoredStructure, Send } from "./types";
export { browserStore } from "./storage";
export type { KeyValueStore } from "./storage";
export { randomSeed } from "./seed";
export { closedOf } from "./closed";
export { TRAINING_KEY, clearGame } from "./training-storage";
export { LocalSession, TRAINING_LOOKAHEAD, replayTraining, startTraining } from "./local-session";
export type { TrainingMove } from "./local-session";
export { MAX_UNCONFIRMED, PredictedSession, replayChallenge, replayVrfChallenge, supplyKnown } from "./predicted-session";
export type { ChainDraw, ChainGame, ChainTile, Mismatch, MoveReceipt, PredictedOptions, PredictedState, PredictedViews } from "./predicted-session";
export { offerPlans, placeInVillage, villageGame, villageRefusal } from "./village";
export type { VillageTileCodes } from "./village";
export { SEEDED_DRAW_SALT, SeededChallenge, seededBuild } from "./seeded-challenge";
export type { SeededGameView, SeededMove, SeededOutcome } from "./seeded-challenge";
export { AttackRun } from "./attack";
export type { AttackMoveCodes, AttackStepResult, PlacedCodes } from "./attack";
