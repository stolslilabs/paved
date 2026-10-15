import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  CENTER,
  CategoryType,
  EngineGame,
  LocalSession,
  OrientationType,
  TRAINING_KEY,
  loadGame,
  randomSeed,
  type KeyValueStore,
  type PageState,
  type PlaceMove,
  type SavedGame,
  type SavedMove,
  type ScoredStructure,
} from "@paved/game-core";
import type { BoardSceneProps } from "../components/scenes/board-scene";
import type { TrainingSave } from "../components/scenes/home-scene";
import { queryKeys } from "./keys";
import { trainingStore, useDataSources } from "./sources";

/** The board scene's data a session gives (the hand's orientation and state are the page's). */
export type SessionBoard = Pick<BoardSceneProps, "tiles" | "score" | "remaining" | "lastScored"> & {
  /** The tile in hand, null once the game is over. */
  hand: { plan: number } | null;
  over: boolean;
};

/**
 * The tiles left to play, the one in hand included: the deck's size less the tiles placed (the starter counts as
 * placed, as on chain) and the tiles discarded, so a discard counts as spent (P3).
 */
export const remainingOf = (game: NonNullable<PageState["game"]>): number => Math.max(0, game.deckSize - game.placedCount - game.discardedCount);

/** A session's state as the board scene reads it. */
export function boardOf(state: PageState): SessionBoard {
  return {
    tiles: state.tiles,
    score: state.game?.score ?? 0,
    remaining: state.game ? remainingOf(state.game) : 0,
    lastScored: state.lastScored,
    hand: state.hand ? { plan: state.hand.plan } : null,
    over: state.game?.over ?? false,
  };
}

const ORIENTATIONS = Object.values(OrientationType);
/** The engine's categories in the order of their codes, as `LocalSession` maps a `Scored` to a `ScoredStructure`. */
const CATEGORIES = Object.values(CategoryType);

/** The save's seed as `LocalSession` writes it. */
const hex = (seed: bigint) => `0x${seed.toString(16)}`;

/**
 * Where the Training save stands: `ok` (the last move is saved), `off` (the browser gives no storage), `dropped` (the
 * storage is there but the last save did not land: quota, a refusal, another tab's write).
 */
export type StorageStatus = "ok" | "off" | "dropped";

/** A structure the game closed, with the tile that closed it (the over scene's list). */
export type Closing = ScoredStructure & { tileId: number };

/** What the board reads of a Training game; a new object after each move. */
export interface TrainingSnapshot {
  state: PageState;
  storage: StorageStatus;
  /** Points the last move added (a discard takes some: negative); null before the first move of this page. */
  delta: number | null;
  /** Every closing of the game, in move order. */
  closings: Closing[];
}

/**
 * A Training game: `LocalSession` (the game, its save) and a second engine of the same seed and moves, kept in step,
 * that answers what the session does not expose: the legal slots of the tile in hand and the points a placement would
 * score (the preview). Both keep their engine between moves and replay only to open a saved game. Moves go through
 * this object, never to the session directly, so the two stay in step.
 */
export class TrainingGame {
  private readonly listeners = new Set<() => void>();
  private current: TrainingSnapshot;

  private constructor(
    readonly session: LocalSession,
    private readonly rules: EngineGame,
    readonly seed: bigint,
    private readonly moves: SavedMove[],
    closings: Closing[],
    private readonly store: () => KeyValueStore | null,
  ) {
    this.current = { state: session.state, storage: this.storageStatus(), delta: null, closings };
  }

  /** A new game of `seed`, saved at once. */
  static start(seed: bigint, store: () => KeyValueStore | null): TrainingGame {
    return new TrainingGame(LocalSession.start(seed, store), EngineGame.start({ deck: "simple", seed }), seed, [], [], store);
  }

  /** The saved game replayed; null when it does not replay. */
  static resume(saved: SavedGame, store: () => KeyValueStore | null): TrainingGame | null {
    const session = LocalSession.resume(saved, store);
    if (!session) return null;
    const seed = BigInt(saved.seed);
    const rules = EngineGame.start({ deck: "simple", seed });
    const closings: Closing[] = [];
    try {
      for (const move of saved.moves) closings.push(...apply(rules, move));
    } catch {
      return null;
    }
    return new TrainingGame(session, rules, seed, [...saved.moves], closings, store);
  }

  /** The saved game of this browser, or a new one with a random seed. */
  static open(store: () => KeyValueStore | null): TrainingGame {
    const saved = loadGame(store);
    return (saved && TrainingGame.resume(saved, store)) || TrainingGame.start(randomSeed(), store);
  }

  get snapshot(): TrainingSnapshot {
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Whether `saved` is this game as it stands (same seed, same moves): a save another tab wrote is not. */
  matches(saved: SavedGame): boolean {
    return saved.seed === hex(this.seed) && saved.moves.length === this.moves.length;
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

  private async run(move: SavedMove, play: () => Promise<boolean>): Promise<boolean> {
    const before = this.session.state.game?.score ?? 0;
    if (!(await play())) {
      this.set({ ...this.current, state: this.session.state });
      return false;
    }
    const closed = apply(this.rules, move);
    this.moves.push(move);
    const state = this.session.state;
    this.set({
      state,
      storage: this.storageStatus(),
      delta: move.k === "s" ? null : (state.game?.score ?? 0) - before,
      closings: closed.length ? [...this.current.closings, ...closed] : this.current.closings,
    });
    return true;
  }

  private storageStatus(): StorageStatus {
    try {
      if (!this.store()) return "off";
    } catch {
      return "off";
    }
    const saved = loadGame(this.store);
    return saved && this.matches(saved) ? "ok" : "dropped";
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
function apply(game: EngineGame, move: SavedMove): Closing[] {
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
 * The Training game of each store, kept across the routes (`/training`, `/training/over`) so the board and its end
 * read the same game without a replay; a reload starts from the save.
 */
const games = new WeakMap<() => KeyValueStore | null, TrainingGame>();

/** The game of `store`: the one this tab holds, unless the save says another tab moved on; else the save, or a new game. */
function gameOf(store: () => KeyValueStore | null): TrainingGame {
  const held = games.get(store);
  if (held) {
    const saved = loadGame(store);
    if (!saved || held.matches(saved)) return held;
  }
  const game = TrainingGame.open(store);
  games.set(store, game);
  return game;
}

/**
 * The board's session in Training: the saved game of this browser resumed (replayed once), or a new one; each move is
 * applied to the session's engine, never replayed (`LocalSession`). `newGame` starts another seed.
 *
 * Two tabs on one save: a tab follows the save another tab wrote (the `storage` event, which fires only in the other
 * tabs). It re-opens the game from that save, so the next move of either tab extends the latest game and neither
 * overwrites the other's moves with an older game.
 */
export function useTrainingSession(): {
  game: TrainingGame;
  session: LocalSession;
  state: PageState;
  board: SessionBoard;
  snapshot: TrainingSnapshot;
  newGame: () => void;
} {
  const sources = useDataSources();
  const store = trainingStore(sources);
  const [game, setGame] = useState(() => gameOf(store));
  const subscribe = useCallback((listener: () => void) => game.subscribe(listener), [game]);
  const snapshot = useSyncExternalStore(subscribe, () => game.snapshot);

  const newGame = useCallback(() => {
    const next = TrainingGame.start(randomSeed(), store);
    games.set(store, next);
    setGame(next);
  }, [store]);

  useEffect(() => {
    const follow = (event: StorageEvent) => {
      if (event.key !== TRAINING_KEY || event.newValue === null) return;
      const next = gameOf(store);
      if (next !== game) setGame(next);
    };
    window.addEventListener("storage", follow);
    return () => window.removeEventListener("storage", follow);
  }, [store, game]);

  return { game, session: game.session, state: snapshot.state, board: boardOf(snapshot.state), snapshot, newGame };
}

/** The home scene's `training`: the saved game's score and tiles left; null when none is saved or it is over. */
export function useTrainingSave(): UseQueryResult<TrainingSave | null> {
  const sources = useDataSources();
  return useQuery({
    queryKey: queryKeys.local.trainingSave(),
    queryFn: () => {
      const store = trainingStore(sources);
      const saved = loadGame(store);
      const session = saved && LocalSession.resume(saved, store);
      const game = session?.state.game;
      return game && !game.over ? { score: game.score, remaining: remainingOf(game) } : null;
    },
  });
}
