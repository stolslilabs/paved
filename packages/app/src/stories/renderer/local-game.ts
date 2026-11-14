import {
  CENTER,
  CategoryType,
  EngineGame,
  LocalSession,
  startTraining,
  OrientationType,
  gameStats,
  type PageState,
  type PlaceMove,
  type GameStats,
  type TrainingMove,
} from "@paved/game-core";
import type { Closing } from "../../data/session-board";

const ORIENTATIONS = Object.values(OrientationType);
/** The engine's categories in the order of their codes, as `LocalSession` maps a `Scored` to a `ScoredStructure`. */
const CATEGORIES = Object.values(CategoryType);

/** What the board reads of a local game; a new object after each move. */
export interface LocalSnapshot {
  state: PageState;
  /** Points the last move added (a discard takes some: negative); null before the first move of this page. */
  delta: number | null;
  /** Every closing of the game, in move order. */
  closings: Closing[];
}

/**
 * A game on the device, for the renderer's stories (the Training board's game, before Training left the client): `LocalSession`
 * (the game) and a second engine of the same seed and moves, kept in step, that answers what the session does not expose: the legal
 * slots of the tile in hand and the points a placement would score (the preview). Both keep their engine between moves, never
 * replayed. Moves go through this object, never to the session directly, so the two stay in step. Nothing is saved.
 */
export class LocalGame {
  private readonly listeners = new Set<() => void>();
  private current: LocalSnapshot;

  private constructor(
    readonly session: LocalSession,
    private readonly rules: EngineGame,
    readonly seed: bigint,
  ) {
    this.current = { state: session.state, delta: null, closings: [] };
  }

  /** A new game of `seed` (`randomSeed` for a new deck, the same seed for a restart). */
  static start(seed: bigint): LocalGame {
    return new LocalGame(LocalSession.start(seed), startTraining(seed), seed);
  }

  get snapshot(): LocalSnapshot {
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

  private set(snapshot: LocalSnapshot): void {
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
