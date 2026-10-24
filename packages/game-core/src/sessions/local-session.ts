import { CENTER, EngineGame } from "../engine";
import type { Scored } from "../engine";
import { CategoryType } from "../types/category";
import { OrientationType } from "../types/orientation";
import { PlanType } from "../types/plan";
import { closedOf } from "./closed";
import type { BoardTile, PageSession, PageState, PlaceMove, ScoredStructure } from "./types";

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);
const CATEGORIES = Object.values(CategoryType);

/** The player of a Training game: the engine's default, no account behind it. */
const PLAYER = "0x1";

/** One move of a Training game: the placement of the tile in hand, or a discard, or the surrender. */
export type TrainingMove = { k: "b"; o: number; x: number; y: number } | { k: "d" } | { k: "s" };

/** The tiles a Training game knows ahead, the tile in hand included: the VRF Challenge's queue (#645), so both play alike. */
export const TRAINING_LOOKAHEAD = 3;

/** A new engine game of Training of `seed`. */
export function startTraining(seed: bigint): EngineGame {
  return EngineGame.start({ deck: "simple", seed, lookahead: TRAINING_LOOKAHEAD });
}

/** Plays `moves` on a new engine game of `seed`: the tests' mirror of a game. */
export function replayTraining(seed: bigint, moves: readonly TrainingMove[]): EngineGame {
  const game = startTraining(seed);
  for (const move of moves) apply(game, move);
  return game;
}

function apply(game: EngineGame, move: TrainingMove): ReturnType<EngineGame["build"]> | null {
  if (move.k === "d") return game.discard();
  if (move.k === "s") {
    game.surrender();
    return null;
  }
  const orientation = ORIENTATIONS[move.o];
  if (!orientation) throw new Error("Orientation: not valid");
  return game.build({ orientation, x: move.x, y: move.y });
}

function scoredOf(scored: readonly Scored[]): ScoredStructure[] {
  return scored.map((s) => ({ category: CATEGORIES.indexOf(s.category), size: s.size, points: s.points }));
}

/**
 * A game of Training over the off-chain engine, in the shape the game page renders. Nothing here reaches a chain: the
 * `send` the page passes is never called. The engine game is kept between moves: a move is applied to it, never
 * replayed. Nothing is saved (#718): the game lives as long as the object, and every entry to Training starts a new one.
 */
export class LocalSession implements PageSession {
  private current: PageState;
  private readonly listeners = new Set<(state: PageState) => void>();

  private constructor(private readonly game: EngineGame) {
    this.current = this.project([], null);
  }

  /** A new game of this seed (see `randomSeed`). */
  static start(seed: bigint): LocalSession {
    return new LocalSession(startTraining(seed));
  }

  get state(): PageState {
    return this.current;
  }

  /** The engine's score, for tests and the page's final panel. */
  get score(): number {
    return this.game.score;
  }

  subscribe(listener: (state: PageState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Places the tile in hand; `move` is in the chain's absolute coordinates, as the page builds it. */
  place(move: PlaceMove): Promise<boolean> {
    return this.run({ k: "b", o: move.orientation, x: move.x - CENTER, y: move.y - CENTER });
  }

  discard(): Promise<boolean> {
    return this.run({ k: "d" });
  }

  surrender(): Promise<boolean> {
    return this.run({ k: "s" });
  }

  private async run(move: TrainingMove): Promise<boolean> {
    if (this.game.over) return false;
    try {
      const result = apply(this.game, move);
      this.set(this.project(result ? scoredOf(result.scored) : [], null));
      return true;
    } catch (error) {
      this.set({ ...this.current, writeError: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  private project(lastScored: ScoredStructure[], writeError: string | null): PageState {
    const g = this.game;
    const hand = g.over ? null : g.hand;
    const tiles: BoardTile[] = g.placed().map((t) => ({
      id: t.id,
      plan: PLANS.indexOf(t.plan),
      orientation: ORIENTATIONS.indexOf(t.orientation),
      x: CENTER + t.x,
      y: CENTER + t.y,
    }));
    return {
      key: { gameId: 1 },
      status: "ready",
      error: null,
      message: null,
      game: {
        playerId: PLAYER,
        score: g.score,
        over: g.over,
        // As on chain: the starter counts as placed, the page shows built = placedCount - 1.
        placedCount: g.built + 1,
        deckSize: g.tileLimit,
        discardedCount: g.discarded,
      },
      tiles,
      discardedPlans: [...g.discardedPlans],
      hand: hand ? { tileId: hand.id, plan: PLANS.indexOf(hand.plan) } : null,
      coming: hand ? g.coming.map((t) => ({ tileId: t.id, plan: PLANS.indexOf(t.plan) })) : [],
      lastScored,
      closed: closedOf(g.closings()),
      readonly: false,
      pending: false,
      writeError,
      readError: null,
    };
  }

  private set(state: PageState): void {
    this.current = state;
    for (const listener of this.listeners) listener(state);
  }
}
