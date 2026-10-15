// The game sessions (P2): Training's `LocalSession` and its save, the scripted tutorial run and its save, and the
// `PageSession` shape a board drives. No chain, no DOM: the chain's `GameSession` satisfies `PageSession` structurally.

export type { BoardTile, Closure, MoveSenders, PageSession, PageState, PlaceMove, ScoredStructure, Send } from "./types";
export { browserStore, windowStore } from "./storage";
export type { KeyValueStore } from "./storage";
export { randomSeed } from "./seed";
export { TRAINING_KEY, clearGame, loadGame, saveGame } from "./training-storage";
export type { SavedGame, SavedMove } from "./training-storage";
export { LocalSession, openTraining, replayTraining, savedTrainingStatus } from "./local-session";
export {
  BURN_TEXT,
  NOT_A_BUILD,
  NOT_A_DISCARD,
  START_SEED,
  TutorialRun,
  WRONG_ORIENTATION,
  WRONG_SQUARE,
  attempt,
  back,
  closuresOf,
  finalScore,
  followTutorial,
  initialOrientation,
  orientationCode,
  orientationName,
  planCode,
  presetPlacement,
  replayTutorial,
  rotate,
  scriptedMoves,
  tutorialSteps,
} from "./tutorial-run";
export type { Attempt, TutorialMove, TutorialStep, TutorialView } from "./tutorial-run";
export { TUTORIAL_STORAGE_KEY, loadMoves, saveMoves } from "./tutorial-storage";
