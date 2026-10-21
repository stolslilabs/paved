import { CENTER, EngineGame, poseidon } from "../engine";
import type { Scored } from "../engine";
import { CategoryType } from "../types/category";
import { OrientationType } from "../types/orientation";
import { PlanType } from "../types/plan";
import { randomSeed } from "./seed";
import { browserStore, type KeyValueStore } from "./storage";
import { loadGame, saveGame, type SavedGame, type SavedMove } from "./training-storage";
import type { BoardTile, PageSession, PageState, PlaceMove, ScoredStructure } from "./types";

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);
const CATEGORIES = Object.values(CategoryType);

/** The player of a Training game: the engine's default, no account behind it. */
const PLAYER = "0x1";

const hex = (seed: bigint) => `0x${seed.toString(16)}`;

/** The saved game's version a new game takes: the three-tile queue of #645. */
const QUEUE_VERSION = 2;

/**
 * Plays `moves` on a new engine game of `seed`: the replay a resume does, and the tests do. A game of the queue
 * (`queue`, #645: a new game) draws as the Challenge on the VRF does, its draws from the local random of
 * `trainingRandom`; a game saved before draws from its seed, reseeded by each placement.
 */
export function replayTraining(seed: bigint, moves: readonly SavedMove[], queue = true): EngineGame {
  const game = startTraining(seed, queue);
  for (const move of moves) playTraining(game, move, seed);
  return game;
}

/** A new engine game of Training: on the three-tile queue (#645) unless `queue` is false (a game saved before it). */
export function startTraining(seed: bigint, queue = true): EngineGame {
  return EngineGame.start({ deck: "simple", seed, vrf: queue });
}

/**
 * The local random of the tile `id` of a Training game (#645): Poseidon of the game's random seed and the id. Training
 * keeps its own random (it has no VRF): the queue is the Challenge's, its draws are local.
 */
export function trainingRandom(seed: bigint, id: number): bigint {
  return poseidon(seed, id);
}

/**
 * `move` played on a Training game of `seed`, as `LocalSession` plays it: on the queue (#645), the tile two ahead is then
 * drawn at once from the local random (`trainingRandom`). The result of a build or a discard; null for a surrender.
 */
export function playTraining(game: EngineGame, move: SavedMove, seed: bigint): ReturnType<EngineGame["build"]> | null {
  let result: ReturnType<EngineGame["build"]> | null;
  if (move.k === "d") result = game.discard();
  else if (move.k === "s") {
    game.surrender();
    result = null;
  } else {
    const orientation = ORIENTATIONS[move.o];
    if (!orientation) throw new Error("Orientation: not valid");
    result = game.build({ orientation, x: move.x, y: move.y });
  }
  // [Info] The queue's tile two ahead, drawn at once from the local random
  for (const tile of game.queue) if (tile.plan === null) game.supply(trainingRandom(seed, tile.id));
  return result;
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
    private readonly version: 1 | 2 = QUEUE_VERSION,
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
      const queue = saved.v === QUEUE_VERSION;
      return new LocalSession(replayTraining(seed, saved.moves, queue), seed, [...saved.moves], store, saved.v);
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
      const result = playTraining(this.game, move, this.seed);
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
      ...(g.vrf ? { queue: g.over ? [] : g.queue.map((t) => ({ tileId: t.id, plan: t.plan === null ? null : PLANS.indexOf(t.plan) })) } : {}),
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
