import { GameExpiredError, type WriteResult } from "./writer";
import { placementOutcome } from "./placement";
import {
  TILE_STATUS,
  toViewError,
  type GameKey,
  type GameView,
  type GameViews,
  type ViewErrorKind,
} from "./views";

export interface BoardTile {
  id: number;
  plan: number;
  orientation: number;
  x: number;
  y: number;
  /** Drawn by the client, not yet confirmed by a receipt. */
  pending?: boolean;
}

/** A structure a move closed, from one `Scored` event of its receipt. */
export interface ScoredStructure {
  category: number;
  size: number;
  points: number;
}

export interface SessionState {
  key: GameKey;
  status: "loading" | "ready" | "error";
  /** Why the game cannot be shown (`game-not-found`, `rpc`, ...); null otherwise. */
  error: ViewErrorKind | null;
  message: string | null;
  game: GameView | null;
  /** Tiles on the board. */
  tiles: BoardTile[];
  /** Tile to place now; null while a write is pending or when the game is over. */
  hand: { tileId: number; plan: number } | null;
  /**
   * The structures the last write closed, one entry per `Scored` event of its receipt (a forest closed at 0 points
   * included), in receipt order. Empty before the first write, after a discard that closed nothing, and cleared when
   * the next write starts.
   */
  lastScored: ScoredStructure[];
  /** True when the viewer is not the game's player (or has no account): no write. */
  readonly: boolean;
  /** A write of this session is in flight. */
  pending: boolean;
  /** Error of the last write, for the UI; null when it succeeded. */
  writeError: string | null;
  /**
   * The write succeeded but the read that follows it failed: the move is applied (from its
   * receipt), the next tile and the exact score are not known yet. Null otherwise.
   */
  readError: string | null;
}

export interface PlaceMove {
  orientation: number;
  x: number;
  y: number;
}

/**
 * The state of one game for the game page. It reads the views once on `load`, shows a write at
 * once (pending), applies the receipt's events, then reconciles with one read of `game`. It never polls: only its player's own writes change a game.
 */
export class GameSession {
  private current: SessionState;
  private readonly listeners = new Set<(state: SessionState) => void>();

  constructor(
    private readonly views: GameViews,
    readonly key: GameKey,
    private readonly playerId: string | null,
    /** The time in seconds that `expiresAt` is compared with: the block time where it is known, else the clock. */
    private readonly now: () => number = () => Math.floor(Date.now() / 1000),
  ) {
    this.current = {
      key,
      status: "loading",
      error: null,
      message: null,
      game: null,
      tiles: [],
      hand: null,
      lastScored: [],
      readonly: true,
      pending: false,
      writeError: null,
      readError: null,
    };
  }

  get state(): SessionState {
    return this.current;
  }

  subscribe(listener: (state: SessionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(): Promise<void> {
    try {
      const [game, tiles] = await Promise.all([this.views.game(this.key), this.views.tiles(this.key)]);
      const own = this.playerId !== null && BigInt(game.playerId) === BigInt(this.playerId);
      this.set({
        status: "ready",
        game,
        readonly: !own,
        tiles: tiles
          .filter((t) => t.status === TILE_STATUS.placed)
          .map(({ id, plan, orientation, x, y }) => ({ id, plan, orientation, x, y })),
        hand: own && game.tileId ? { tileId: game.tileId, plan: game.plan } : null,
      });
    } catch (error) {
      const e = toViewError(error);
      this.set({ status: "error", error: e.kind, message: e.message });
    }
  }

  /** Places the tile in hand: drawn at once, confirmed by the receipt's `Built`, then reconciled. */
  async place(move: PlaceMove, send: () => Promise<WriteResult>): Promise<boolean> {
    const hand = this.current.hand;
    if (!hand || this.current.readonly || this.current.pending) return false;
    if (this.refuseExpired()) return false;
    const tile: BoardTile = { id: hand.tileId, plan: hand.plan, orientation: move.orientation, x: move.x, y: move.y, pending: true };
    this.set({
      pending: true,
      writeError: null,
      readError: null,
      lastScored: [],
      hand: null,
      tiles: [...this.current.tiles, tile],
    });
    return this.write(send, () => {
      this.set({ tiles: this.current.tiles.filter((t) => t !== tile), hand });
    });
  }

  async discard(send: () => Promise<WriteResult>): Promise<boolean> {
    if (!this.current.readonly && !this.current.pending && this.refuseExpired()) return false;
    return this.simpleWrite(send);
  }

  surrender(send: () => Promise<WriteResult>): Promise<boolean> {
    return this.simpleWrite(send);
  }

  /**
   * An expired game (S1) takes no build and no discard: nothing is sent and the player reads the same error the
   * chain's revert gives. Never called for `surrender`, which closes an expired game.
   */
  private refuseExpired(): boolean {
    const game = this.current.game;
    if (!game || game.over || game.expiresAt === 0 || this.now() < game.expiresAt) return false;
    this.set({ writeError: new GameExpiredError().message });
    return true;
  }

  private async simpleWrite(send: () => Promise<WriteResult>): Promise<boolean> {
    const hand = this.current.hand;
    if (this.current.readonly || this.current.pending) return false;
    this.set({ pending: true, writeError: null, readError: null, lastScored: [], hand: null });
    return this.write(send, () => this.set({ hand }));
  }

  private async write(send: () => Promise<WriteResult>, undo: () => void): Promise<boolean> {
    let result: WriteResult;
    try {
      result = await send();
    } catch (error) {
      undo();
      this.set({ pending: false, writeError: error instanceof Error ? error.message : String(error) });
      return false;
    }
    this.apply(result);
    await this.reconcile();
    this.set({ pending: false });
    return true;
  }

  /** Applies a receipt's events: the board and the score move without a read. */
  private apply(result: WriteResult): void {
    const outcome = placementOutcome(result.events, this.key.gameId);
    let tiles = this.current.tiles;
    if (outcome.built) {
      const b = outcome.built;
      tiles = tiles.filter((t) => t.id !== b.tileId).concat({ id: b.tileId, plan: b.plan, orientation: b.orientation, x: b.x, y: b.y });
    }
    const game = this.current.game;
    this.set({
      tiles,
      lastScored: outcome.scored,
      game: game && {
        ...game,
        score: outcome.over ? outcome.over.score : game.score + outcome.scoredPoints,
        over: game.over || outcome.over !== null,
      },
    });
  }

  /** One read of `game` after a write: next tile, exact score. `GameView` carries the tile in hand, so no `builder` read. */
  private async reconcile(): Promise<void> {
    try {
      const game = await this.views.game(this.key);
      this.set({ game, hand: game.tileId ? { tileId: game.tileId, plan: game.plan } : null });
    } catch (error) {
      this.set({ readError: toViewError(error).message });
    }
  }

  private set(patch: Partial<SessionState>): void {
    this.current = { ...this.current, ...patch };
    for (const listener of this.listeners) listener(this.current);
  }
}
