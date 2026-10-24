import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  CENTER,
  CategoryType,
  EngineGame,
  LocalSession,
  startTraining,
  OrientationType,
  clearGame,
  gameStats,
  randomSeed,
  type KeyValueStore,
  type PageState,
  type PlaceMove,
  type GameStats,
  type ClosedTileAreas,
  type TrainingMove,
  type ScoredStructure,
} from "@paved/game-core";
import type { BoardSceneProps } from "../components/scenes/board-scene";
import { trainingStore, useDataSources } from "./sources";

/**
 * The tiles left to play, the one in hand included: the deck's size less the tiles placed (the starter counts as
 * placed, as on chain) and the tiles discarded, so a discard counts as spent (P3).
 */
export const remainingOf = (game: NonNullable<PageState["game"]>): number => Math.max(0, game.deckSize - game.placedCount - game.discardedCount);

/** The board scene's data a session gives (the hand's orientation and state are the page's). */
export type SessionBoard = Pick<BoardSceneProps, "tiles" | "score" | "remaining" | "discardedPlans" | "lastScored"> & {
  /** The tile in hand, null once the game is over. */
  hand: { plan: number } | null;
  /** The tiles known after it, in draw order (#645): the next two, fewer at the deck's end. */
  coming: { plan: number }[];
  over: boolean;
  /** Every structure closed so far, as its areas on its tiles (`PageState.closed`): the board pulses and shines them (#722). */
  closed: ClosedTileAreas[][];
};

/** A session's state as the board scene reads it. */
export function boardOf(state: PageState): SessionBoard {
  return {
    tiles: state.tiles,
    score: state.game?.score ?? 0,
    remaining: state.game ? remainingOf(state.game) : 0,
    discardedPlans: state.discardedPlans ?? [],
    lastScored: state.lastScored,
    hand: state.hand ? { plan: state.hand.plan } : null,
    coming: (state.coming ?? []).map((t) => ({ plan: t.plan })),
    over: state.game?.over ?? false,
    closed: state.closed ?? [],
  };
}

const ORIENTATIONS = Object.values(OrientationType);
/** The engine's categories in the order of their codes, as `LocalSession` maps a `Scored` to a `ScoredStructure`. */
const CATEGORIES = Object.values(CategoryType);

/** A structure the game closed, with the tile that closed it (the over scene's list). */
export type Closing = ScoredStructure & { tileId: number };

/** What the board reads of a Training game; a new object after each move. */
export interface TrainingSnapshot {
  state: PageState;
  /** Points the last move added (a discard takes some: negative); null before the first move of this page. */
  delta: number | null;
  /** Every closing of the game, in move order. */
  closings: Closing[];
}

/**
 * A Training game: `LocalSession` (the game) and a second engine of the same seed and moves, kept in step, that answers
 * what the session does not expose: the legal slots of the tile in hand and the points a placement would score (the
 * preview). Both keep their engine between moves, never replayed. Moves go through this object, never to the session
 * directly, so the two stay in step. Nothing is saved (#718): the game lives in memory only.
 */
export class TrainingGame {
  private readonly listeners = new Set<() => void>();
  private current: TrainingSnapshot;

  private constructor(
    readonly session: LocalSession,
    private readonly rules: EngineGame,
    readonly seed: bigint,
  ) {
    this.current = { state: session.state, delta: null, closings: [] };
  }

  /** A new game of `seed` (`randomSeed` for a new deck, the same seed for a restart). */
  static start(seed: bigint): TrainingGame {
    return new TrainingGame(LocalSession.start(seed), startTraining(seed), seed);
  }

  get snapshot(): TrainingSnapshot {
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Every legal slot of the tile in hand at `orientation` (1 North to 4 West), in the chain's coordinates. */
  slots(orientation: number): { x: number; y: number }[] {
    if (this.rules.over) return [];
    const wanted = ORIENTATIONS[orientation];
    return this.rules
      .legalPlacements()
      .filter((p) => p.orientation === wanted)
      .map((p) => ({ x: CENTER + p.x, y: CENTER + p.y }));
  }

  /** The orientations (1 North to 4 West) the tile in hand may take at `slot` (the chain's coordinates); none when it cannot go there. */
  orientationsAt(slot: { x: number; y: number }): number[] {
    if (this.rules.over) return [];
    return [1, 2, 3, 4].filter((o) => this.rules.canPlace(toPlacement({ orientation: o, ...slot })!));
  }

  /** The points placing the tile in hand as `move` would add; null when the move is not legal. */
  preview(move: PlaceMove): number | null {
    const placement = toPlacement(move);
    if (!placement || this.rules.over || !this.rules.canPlace(placement)) return null;
    return this.rules.clone().build(placement).points;
  }

  /** The game's figures as it stands (`gameStats`), from the engine kept in step with the session. */
  stats(): GameStats {
    return gameStats(this.rules);
  }

  /** Places the tile in hand; `move` is in the chain's coordinates (`toChainSlot` of the slot the player sees). */
  place(move: PlaceMove): Promise<boolean> {
    return this.run({ k: "b", o: move.orientation, x: move.x - CENTER, y: move.y - CENTER }, () => this.session.place(move));
  }

  discard(): Promise<boolean> {
    return this.run({ k: "d" }, () => this.session.discard());
  }

  surrender(): Promise<boolean> {
    return this.run({ k: "s" }, () => this.session.surrender());
  }

  private async run(move: TrainingMove, play: () => Promise<boolean>): Promise<boolean> {
    const before = this.session.state.game?.score ?? 0;
    if (!(await play())) {
      this.set({ ...this.current, state: this.session.state });
      return false;
    }
    const closed = apply(this.rules, move);
    const state = this.session.state;
    this.set({
      state,
      delta: move.k === "s" ? null : (state.game?.score ?? 0) - before,
      closings: closed.length ? [...this.current.closings, ...closed] : this.current.closings,
    });
    return true;
  }

  private set(snapshot: TrainingSnapshot): void {
    this.current = snapshot;
    for (const listener of this.listeners) listener();
  }
}

function toPlacement(move: PlaceMove) {
  const orientation = ORIENTATIONS[move.orientation];
  if (!orientation || orientation === OrientationType.None) return null;
  return { orientation, x: move.x - CENTER, y: move.y - CENTER };
}

/** `move` played on `game`, as `LocalSession` plays it; what it closed, with the tile that closed it. */
function apply(game: EngineGame, move: TrainingMove): Closing[] {
  if (move.k === "d") {
    game.discard();
    return [];
  }
  if (move.k === "s") {
    game.surrender();
    return [];
  }
  const orientation = ORIENTATIONS[move.o];
  if (!orientation) throw new Error("Orientation: not valid");
  const result = game.build({ orientation, x: move.x, y: move.y });
  return result.scored.map((s) => ({ category: CATEGORIES.indexOf(s.category), size: s.size, points: s.points, tileId: result.tileId }));
}

/**
 * The Training game of each store, held in memory for the tab: the board's, so `/training/over` reads the game that just
 * finished without a save. Keyed by the store only to keep the tests' data sources apart; the store holds nothing of it.
 */
const games = new WeakMap<() => KeyValueStore | null, TrainingGame>();

/** The stores whose old save (`paved:training:v1`, before #718) this tab has cleared. */
const cleared = new WeakSet<() => KeyValueStore | null>();

/** Clears the save Training kept before #718, once per tab and store: no stale save stays on the device. */
function clearOldSave(store: () => KeyValueStore | null): void {
  if (cleared.has(store)) return;
  cleared.add(store);
  clearGame(store);
}

/** The game held for `store`, set by the board once its game is committed (never in render, which StrictMode runs twice). */
function useHold(store: () => KeyValueStore | null, game: TrainingGame): void {
  useEffect(() => {
    clearOldSave(store);
    games.set(store, game);
  }, [store, game]);
}

/** A game read with `useSyncExternalStore`: its snapshot and the scene's board, a new object after each move. */
function useSnapshot(game: TrainingGame) {
  const subscribe = useCallback((listener: () => void) => game.subscribe(listener), [game]);
  const snapshot = useSyncExternalStore(subscribe, () => game.snapshot);
  return { game, session: game.session, state: snapshot.state, board: boardOf(snapshot.state), snapshot };
}

/**
 * The board's session in Training: a new game with a random seed on every entry (Home, Play, Welcome, the old link, a
 * reload), never resumed (#718). Each move is applied to the session's engine, never replayed (`LocalSession`). The game
 * lives in memory only, held for the tab so `/training/over` reads it (`useFinishedTraining`); leaving it loses it.
 * `restart` plays the same seed again from its first tile.
 */
export function useTrainingSession(): {
  game: TrainingGame;
  session: LocalSession;
  state: PageState;
  board: SessionBoard;
  snapshot: TrainingSnapshot;
  /** The same game again from its start: its seed, so its deck (#606, the settings' Restart). */
  restart: () => void;
} {
  const store = trainingStore(useDataSources());
  const [game, setGame] = useState(() => TrainingGame.start(randomSeed()));
  useHold(store, game);
  const restart = useCallback(() => setGame(TrainingGame.start(game.seed)), [game]);
  return { ...useSnapshot(game), restart };
}

/**
 * The game the board of this tab played, for `/training/over`: the one held in memory. With none (a reload of the over
 * page, or a direct link), a new game not yet played, which the over page sends to its board: Training then starts anew.
 */
export function useFinishedTraining(): { game: TrainingGame; snapshot: TrainingSnapshot } {
  const store = trainingStore(useDataSources());
  const [game] = useState(() => games.get(store) ?? TrainingGame.start(randomSeed()));
  const { snapshot } = useSnapshot(game);
  return { game, snapshot };
}
