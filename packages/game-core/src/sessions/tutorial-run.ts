import { CENTER, EngineGame } from "../engine";
import type { MoveResult, Placement } from "../engine";
import { CategoryType } from "../types/category";
import { OrientationType } from "../types/orientation";
import { PlanType } from "../types/plan";
import { TUTORIAL_STAGES, type TutorialStage } from "../types/tutorial-stage";
import type { Closure } from "./types";

/**
 * The scripted tutorial (D-21, P-49), as pure logic over the off-chain engine: no chain, no clock, no
 * storage. A run is the list of the moves played so far; the engine, the score and the stage follow from it.
 */

/** A move of the player: a build at a position relative to the starter, or the discard of the burned tile. */
export type TutorialMove = { kind: "build"; orientation: number; x: number; y: number } | { kind: "discard" };

export interface TutorialStep {
  /** `build`: place the tile in hand where the stage says. `burn`: the tile fits nowhere and is discarded. */
  kind: "build" | "burn";
  /** The scripted placement of a build step (relative to the starter), `null` for a burn. */
  placement: Placement | null;
  /** The stage whose text and preset a build step shows, `null` for a burn. */
  stage: TutorialStage | null;
  /** The text shown while the step is current. */
  text: string;
}

export const BURN_TEXT = "THIS TILE FITS NOWHERE: DISCARD IT. A DISCARD COSTS 50 POINTS.";
export const START_SEED = 0n;

const ORIENTATIONS = Object.values(OrientationType);
const PLANS = Object.values(PlanType);
const CATEGORIES = Object.values(CategoryType);

export const orientationName = (code: number): OrientationType => ORIENTATIONS[code] ?? OrientationType.None;
export const orientationCode = (orientation: OrientationType): number => ORIENTATIONS.indexOf(orientation);
export const planCode = (plan: PlanType): number => PLANS.indexOf(plan);

/** A stage's preset in the engine's terms: orientation, and a position relative to the starter. */
export function presetPlacement(stage: TutorialStage): Placement {
  const { orientation, x, y } = stage.presetTransaction;
  return { orientation: orientationName(orientation ?? 0), x: x - CENTER, y: y - CENTER };
}

const same = (a: Placement, b: Placement) => a.orientation === b.orientation && a.x === b.x && a.y === b.y;

function freshGame(): EngineGame {
  return EngineGame.start({ deck: "tutorial", seed: START_SEED });
}

let cached: TutorialStep[] | null = null;

/**
 * The steps of the tutorial: the stages in order, with a burn step wherever the engine's deck has no
 * placement for the tile in hand. Walked on the engine itself, and it throws, naming the stage, when a
 * preset is not the engine's scripted placement or is not legal on the board.
 */
export function tutorialSteps(): readonly TutorialStep[] {
  if (cached) return cached;
  const game = freshGame();
  const steps: TutorialStep[] = [];
  let next = 0;
  while (!game.over) {
    const scripted = game.scriptedPlacement();
    if (!scripted) {
      steps.push({ kind: "burn", placement: null, stage: null, text: BURN_TEXT });
      game.discard();
      continue;
    }
    const stage = TUTORIAL_STAGES[next];
    if (!stage) throw new Error(`Tutorial: no stage for the tile ${game.hand?.id}`);
    const placement = presetPlacement(stage);
    if (!same(placement, scripted)) {
      throw new Error(`Tutorial: stage ${next + 1} is not the engine's scripted placement`);
    }
    const refused = game.refusal(placement);
    if (refused) throw new Error(`Tutorial: stage ${next + 1} is not legal on the engine: ${refused}`);
    steps.push({ kind: "build", placement, stage, text: stage.textboxText });
    game.build(placement);
    next += 1;
  }
  if (next !== TUTORIAL_STAGES.length) throw new Error("Tutorial: a stage is left unused");
  cached = steps;
  return steps;
}

export interface TutorialView {
  game: EngineGame;
  /** The last move's result (its closures, its points), `null` before the first move. */
  last: MoveResult | null;
  /** The step to play, `null` once the tutorial is over. */
  step: TutorialStep | null;
  over: boolean;
}

/** Plays the move on `game` as step `index`. Throws when it is not that step's move. */
function playStep(game: EngineGame, index: number, move: TutorialMove): MoveResult {
  const step = tutorialSteps()[index];
  if (!step) throw new Error("Tutorial: more moves than steps");
  if (move.kind === "discard") {
    if (step.kind !== "burn") throw new Error("Tutorial: not a discard step");
    return game.discard();
  }
  if (step.kind !== "build" || !step.placement) throw new Error("Tutorial: not a build step");
  const placement = { orientation: orientationName(move.orientation), x: move.x, y: move.y };
  if (!same(placement, step.placement)) throw new Error("Tutorial: not the scripted placement");
  return game.build(placement);
}

/** Plays the moves on a fresh engine (a resume). Throws when a move is not the next step's. */
export function replayTutorial(moves: readonly TutorialMove[]): TutorialView {
  const steps = tutorialSteps();
  if (moves.length > steps.length) throw new Error("Tutorial: more moves than steps");
  const game = freshGame();
  let last: MoveResult | null = null;
  moves.forEach((move, i) => {
    last = playStep(game, i, move);
  });
  return { game, last, step: steps[moves.length] ?? null, over: game.over };
}

const sameMove = (a: TutorialMove, b: TutorialMove) =>
  a.kind === "discard" || b.kind === "discard"
    ? a.kind === b.kind
    : a.orientation === b.orientation && a.x === b.x && a.y === b.y;

/**
 * A tutorial run that keeps its engine game between moves: `sync` to a run that extends the current one plays only
 * the new moves; it replays from the start only to resume, or to go back (the engine has no undo). Each view it
 * returns holds its own copy of the engine game, so a view never changes after it is returned.
 */
export class TutorialRun {
  private game = freshGame();
  private moves: TutorialMove[] = [];
  private last: MoveResult | null = null;
  private current: TutorialView | null = null;
  /** How many times the run started over from a fresh engine (resume or back), for tests. */
  replays = 0;

  /** The run at `moves`. Throws, leaving the run as it was, when a move is not the next step's. */
  sync(moves: readonly TutorialMove[]): TutorialView {
    const extends_ = this.moves.length <= moves.length && this.moves.every((m, i) => sameMove(m, moves[i] as TutorialMove));
    if (extends_ && this.current && this.moves.length === moves.length) return this.current;
    if (extends_) {
      const game = this.game.clone();
      let last = this.last;
      for (let i = this.moves.length; i < moves.length; i++) last = playStep(game, i, moves[i] as TutorialMove);
      this.game = game;
      this.last = last;
    } else {
      const view = replayTutorial(moves);
      this.replays += 1;
      this.game = view.game;
      this.last = view.last;
    }
    this.moves = [...moves];
    this.current = {
      game: this.game.clone(),
      last: this.last,
      step: tutorialSteps()[moves.length] ?? null,
      over: this.game.over,
    };
    return this.current;
  }
}

const pageRun = new TutorialRun();

/** The run of the tutorial page (one per page): `TutorialRun.sync` on a run kept for the page's whole life. */
export const followTutorial = (moves: readonly TutorialMove[]): TutorialView => pageRun.sync(moves);

export type Attempt = { ok: true; moves: TutorialMove[] } | { ok: false; reason: string };

export const WRONG_SQUARE = "Not this move: place the tile on the highlighted square.";
export const WRONG_ORIENTATION = "Not this move: rotate the tile to match the example, then confirm.";
export const NOT_A_DISCARD = "Not this move: this tile is placed on the highlighted square, not discarded.";
export const NOT_A_BUILD = "Not this move: this tile fits nowhere, discard it.";

/** Accepts only the current step's move. Anything else is refused with the reason, and the run does not change. */
export function attempt(moves: readonly TutorialMove[], move: TutorialMove): Attempt {
  const step = tutorialSteps()[moves.length];
  if (!step) return { ok: false, reason: "The tutorial is over." };
  if (move.kind === "discard") {
    return step.kind === "burn" ? { ok: true, moves: [...moves, move] } : { ok: false, reason: NOT_A_DISCARD };
  }
  if (step.kind !== "build" || !step.placement) return { ok: false, reason: NOT_A_BUILD };
  if (move.x !== step.placement.x || move.y !== step.placement.y) return { ok: false, reason: WRONG_SQUARE };
  if (orientationName(move.orientation) !== step.placement.orientation) return { ok: false, reason: WRONG_ORIENTATION };
  return { ok: true, moves: [...moves, move] };
}

/** Back: the run without its last move (the stage is played again). */
export const back = (moves: readonly TutorialMove[]): TutorialMove[] => moves.slice(0, -1);

/** The orientation a stage shows the tile in when it starts. */
export const initialOrientation = (step: TutorialStep | null): number => step?.stage?.initialOrientation ?? 1;

/** The next quarter turn, 1 (North) to 4 (West). */
export const rotate = (orientation: number): number => (orientation % 4) + 1;

/** The final score of a finished run. */
export const finalScore = (moves: readonly TutorialMove[]): number => replayTutorial(moves).game.score;

/** The moves the scripted game plays from the first stage to the last (what the page records). */
export function scriptedMoves(): TutorialMove[] {
  return tutorialSteps().map((step): TutorialMove =>
    step.kind === "burn" || !step.placement
      ? { kind: "discard" }
      : { kind: "build", orientation: orientationCode(step.placement.orientation), x: step.placement.x, y: step.placement.y },
  );
}

/** A move's `Scored` events as the closures list shows them (category as its code). */
export const closuresOf = (result: MoveResult | null): Closure[] | null =>
  result ? result.scored.map(({ category, size, points }) => ({ category: CATEGORIES.indexOf(category), size, points })) : null;
