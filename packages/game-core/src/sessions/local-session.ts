import { CENTER, EngineGame } from "../engine";
import type { Scored } from "../engine";
import { CategoryType } from "../types/category";
import { OrientationType } from "../types/orientation";
import { PlanType } from "../types/plan";
import { randomSeed } from "./seed";
import { browserStore, type KeyValueStore } from "./storage";
import { TRAINING_VERSION, loadGame, saveGame, type SavedGame, type SavedMove, type SavedVersion } from "./training-storage";
import type { BoardTile, PageSession, PageState, PlaceMove, ScoredStructure } from "./types";

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);
const CATEGORIES = Object.values(CategoryType);

/** The player of a Training game: the engine's default, no account behind it. */
const PLAYER = "0x1";

const hex = (seed: bigint) => `0x${seed.toString(16)}`;

/** The tiles a Training game knows ahead, the tile in hand included: the VRF Challenge's queue (#645), so both play alike. */
export const TRAINING_LOOKAHEAD = 3;

/** A new engine game of Training of `seed`, under the rules of the save's `version` (`SavedVersion`). */
export function startTraining(seed: bigint, version: SavedVersion = TRAINING_VERSION): EngineGame {
  return EngineGame.start({ deck: "simple", seed, lookahead: version === 1 ? 1 : TRAINING_LOOKAHEAD });
}

/** Plays `moves` on a new engine game of `seed`: the replay a resume does, and the tests do. */
export function replayTraining(seed: bigint, moves: readonly SavedMove[], version: SavedVersion = TRAINING_VERSION): EngineGame {
  const game = startTraining(seed, version);
  for (const move of moves) apply(game, move);
  return game;
}

function apply(game: EngineGame, move: SavedMove): ReturnType<EngineGame["build"]> | null {
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
 * `send` the page passes is never called. The engine game is kept between moves: a move is applied to it, and the
 * moves are replayed only to resume a saved game. After each move the seed and the moves are saved (`localStorage`,
 * every access guarded); with storage unavailable the game still plays and is just not resumable.
 */
export class LocalSession implements PageSession {
  private current: PageState;
  private readonly listeners = new Set<(state: PageState) => void>();
  private moves: SavedMove[];

  private constructor(
    private game: EngineGame,
    private readonly seed: bigint,
    moves: SavedMove[],
    private readonly store: () => KeyValueStore | null,
    /** The rules the game plays under (`SavedVersion`): a resumed save keeps its own. */
    readonly version: SavedVersion = TRAINING_VERSION,
  ) {
    this.moves = moves;
    this.current = this.project([], null);
  }

  /** A new game of this seed (see `randomSeed`), saved at once so that a reload resumes it. */
  static start(seed: bigint, store: () => KeyValueStore | null): LocalSession {
    const session = new LocalSession(replayTraining(seed, []), seed, [], store);
    session.save();
    return session;
  }

  /** The saved game replayed; null when its moves do not replay (a stale or edited value). */
  static resume(saved: SavedGame, store: () => KeyValueStore | null): LocalSession | null {
    try {
      const seed = BigInt(saved.seed);
      return new LocalSession(replayTraining(seed, saved.moves, saved.v), seed, [...saved.moves], store, saved.v);
    } catch {
      return null;
    }
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

  private async run(move: SavedMove): Promise<boolean> {
    if (this.game.over) return false;
    try {
      const result = apply(this.game, move);
      this.moves.push(move);
      this.save();
      this.set(this.project(result ? scoredOf(result.scored) : [], null));
      return true;
    } catch (error) {
      this.set({ ...this.current, writeError: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  private save(): void {
    saveGame({ v: this.version, seed: hex(this.seed), moves: this.moves }, this.store);
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

/** Resumes the saved game of this browser, or starts one with a random seed. */
export function openTraining(store: () => KeyValueStore | null = browserStore): LocalSession {
  const saved = loadGame(store);
  return (saved && LocalSession.resume(saved, store)) || LocalSession.start(randomSeed(), store);
}

/** What the landing card says of the saved game: none (or one that does not replay), in progress, or finished. */
export function savedTrainingStatus(store: () => KeyValueStore | null = browserStore): "none" | "playing" | "over" {
  const saved = loadGame(store);
  const session = saved && LocalSession.resume(saved, store);
  if (!session) return "none";
  return session.state.game?.over ? "over" : "playing";
}
