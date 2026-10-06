import type { WriteResult } from "./writer";
import { placementOutcome } from "./placement";
import {
  TILE_STATUS,
  toViewError,
  type BuilderView,
  type CharacterView,
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

export interface BoardCharacter {
  /** Role code, 1 Lord to 7 Herdsman (6 and 7 since P4). */
  role: number;
  tileId: number;
  x: number;
  y: number;
  spot: number;
  pending?: boolean;
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
  /** Characters on the board. */
  characters: BoardCharacter[];
  /** Placed roles as bits (bit `role` set when placed), the format of `getAvailableCharacters`. */
  packedCharacters: number;
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
  role: number;
  spot: number;
}

function packRoles(characters: CharacterView[]): number {
  return characters.reduce((packed, c) => (c.placed ? packed | (1 << c.role) : packed), 0);
}

/**
 * The state of one game for the game page. It reads the views once on `load`, shows a write at
 * once (pending), applies the receipt's events, then reconciles with one read of `game`, `builder`
 * and `characters`. It never polls: only its player's own writes change a game.
 */
export class GameSession {
  private current: SessionState;
  private readonly listeners = new Set<(state: SessionState) => void>();

  constructor(
    private readonly views: GameViews,
    readonly key: GameKey,
    private readonly playerId: string | null,
  ) {
    this.current = {
      key,
      status: "loading",
      error: null,
      message: null,
      game: null,
      tiles: [],
      hand: null,
      characters: [],
      packedCharacters: 0,
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
      if (own) await this.readPlayer();
    } catch (error) {
      const e = toViewError(error);
      this.set({ status: "error", error: e.kind, message: e.message });
    }
  }

  /** Places the tile in hand: drawn at once, confirmed by the receipt's `Built`, then reconciled. */
  async place(move: PlaceMove, send: () => Promise<WriteResult>): Promise<boolean> {
    const hand = this.current.hand;
    if (!hand || this.current.readonly || this.current.pending) return false;
    const tile: BoardTile = { id: hand.tileId, plan: hand.plan, orientation: move.orientation, x: move.x, y: move.y, pending: true };
    const character: BoardCharacter | null =
      move.role > 0 && move.spot > 0
        ? { role: move.role, tileId: hand.tileId, x: move.x, y: move.y, spot: move.spot, pending: true }
        : null;
    this.set({
      pending: true,
      writeError: null,
      readError: null,
      hand: null,
      tiles: [...this.current.tiles, tile],
      characters: character ? [...this.current.characters, character] : this.current.characters,
    });
    return this.write(send, () => {
      this.set({
        tiles: this.current.tiles.filter((t) => t !== tile),
        characters: this.current.characters.filter((c) => c !== character),
        hand,
      });
    });
  }

  discard(send: () => Promise<WriteResult>): Promise<boolean> {
    return this.simpleWrite(send);
  }

  surrender(send: () => Promise<WriteResult>): Promise<boolean> {
    return this.simpleWrite(send);
  }

  private async simpleWrite(send: () => Promise<WriteResult>): Promise<boolean> {
    const hand = this.current.hand;
    if (this.current.readonly || this.current.pending) return false;
    this.set({ pending: true, writeError: null, readError: null, hand: null });
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
    let characters = this.current.characters;
    if (outcome.built) {
      const b = outcome.built;
      tiles = tiles.filter((t) => t.id !== b.tileId).concat({ id: b.tileId, plan: b.plan, orientation: b.orientation, x: b.x, y: b.y });
      characters = characters.filter((c) => !(c.pending && c.tileId === b.tileId));
      if (b.role > 0) characters = characters.concat({ role: b.role, tileId: b.tileId, x: b.x, y: b.y, spot: b.spot });
    }
    const game = this.current.game;
    this.set({
      tiles,
      characters,
      game: game && {
        ...game,
        score: outcome.over ? outcome.over.score : game.score + outcome.scoredPoints,
        over: game.over || outcome.over !== null,
      },
    });
  }

  /** One read of `game`, `builder` and `characters` after a write: next tile, exact score, characters back. */
  private async reconcile(): Promise<void> {
    try {
      const game = await this.views.game(this.key);
      this.set({ game, hand: game.tileId ? { tileId: game.tileId, plan: game.plan } : null });
      await this.readPlayer();
    } catch (error) {
      this.set({ readError: toViewError(error).message });
    }
  }

  private async readPlayer(): Promise<void> {
    if (!this.playerId) return;
    const [builder, characters]: [BuilderView, CharacterView[]] = await Promise.all([
      this.views.builder(this.key, this.playerId),
      this.views.characters(this.key, this.playerId),
    ]);
    const placed = characters.filter((c) => c.placed);
    this.set({
      hand: builder.tileId && !this.current.game?.over ? { tileId: builder.tileId, plan: builder.plan } : null,
      characters: placed.map(({ role, tileId, x, y, spot }) => ({ role, tileId, x, y, spot })),
      packedCharacters: packRoles(characters),
    });
  }

  private set(patch: Partial<SessionState>): void {
    this.current = { ...this.current, ...patch };
    for (const listener of this.listeners) listener(this.current);
  }
}
