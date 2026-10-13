import { CategoryType, EngineGame, OrientationType, PlanType } from "@paved/game-core";
import type { EngineScored } from "@paved/game-core";
import type { BoardTile, PlaceMove, ScoredStructure } from "@paved/chain";
import { CENTER } from "../utils/game-helpers";
import type { PageSession, PageState } from "./page-session";
import { saveGame, type KeyValueStore, type SavedGame, type SavedMove } from "./storage";

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);
const CATEGORIES = Object.values(CategoryType);

/** The player of a Training game: the engine's default, no account behind it. */
const PLAYER = "0x1";

const hex = (seed: bigint) => `0x${seed.toString(16)}`;

/** Plays `moves` on a new engine game of `seed`: the same replay the page does on load, and the tests do. */
export function replay(seed: bigint, moves: readonly SavedMove[]): EngineGame {
  const game = EngineGame.start({ deck: "simple", seed });
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

function scoredOf(scored: readonly EngineScored[]): ScoredStructure[] {
  return scored.map((s) => ({ category: CATEGORIES.indexOf(s.category), size: s.size, points: s.points }));
}

/**
 * A game of Training over the off-chain engine, in the shape the game page renders. Nothing here reaches a chain: the
 * `send` the page passes is never called. After each move the seed and the moves are saved (`localStorage`, every access
 * guarded); with storage unavailable the game still plays and is just not resumable.
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
  ) {
    this.moves = moves;
    this.current = this.project([], null);
  }

  /** A new game of this seed (see `randomSeed`), saved at once so that a reload resumes it. */
  static start(seed: bigint, store: () => KeyValueStore | null): LocalSession {
    const session = new LocalSession(replay(seed, []), seed, [], store);
    session.save();
    return session;
  }

  /** The saved game replayed; null when its moves do not replay (a stale or edited value). */
  static resume(saved: SavedGame, store: () => KeyValueStore | null): LocalSession | null {
    try {
      const seed = BigInt(saved.seed);
      return new LocalSession(replay(seed, saved.moves), seed, [...saved.moves], store);
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
    saveGame({ v: 1, seed: hex(this.seed), moves: this.moves }, this.store);
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
      hand: hand ? { tileId: hand.id, plan: PLANS.indexOf(hand.plan) } : null,
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
