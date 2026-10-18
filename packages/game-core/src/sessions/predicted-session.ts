import { CENTER, EngineGame } from "../engine";
import type { MoveResult, Placement } from "../engine";
import { CategoryType } from "../types/category";
import { OrientationType } from "../types/orientation";
import { PlanType } from "../types/plan";
import type { BoardTile, PageSession, PageState, PlaceMove, ScoredStructure, Send } from "./types";

// `@paved/chain` depends on this package, so the views and receipts the session reads are structural copies of the
// chain's (`GameView`, `TileView`, `GameViews`, `WriteResult`): `RpcGameViews`, `FakeGameViews` and `PavedWriter`'s
// results satisfy them unchanged, and nothing here imports the chain.

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);
const CATEGORIES = Object.values(CategoryType);

/** `TileView.status` codes (the chain's `TILE_STATUS`). */
const PLACED = 1;
const DISCARDED = 2;
const HELD = 3;

/** At most this many moves sent and not yet confirmed; then the hand waits (section 9.2, step 4). */
export const MAX_UNCONFIRMED = 2;

/** What the session reads of `game(id)`: the chain's `GameView` has these fields. Felts are 0x-hex strings. */
export interface ChainGame {
  playerId: string;
  seed: string;
  score: number;
  over: boolean;
  tileId: number;
  plan: number;
  deckSize: number;
  /** Start + 24 h (S1); 0 when the game has no deadline. */
  expiresAt: number;
}

/** One drawn tile of `tiles(id, from, count)`, in draw order: placed with its position, discarded at (0, 0), or held. */
export interface ChainTile {
  id: number;
  status: number;
  plan: number;
  orientation: number;
  x: number;
  y: number;
}

/** The reads of a game on chain: the chain's `GameViews` satisfies it. */
export interface PredictedViews<K> {
  game(key: K): Promise<ChainGame>;
  tiles(key: K): Promise<ChainTile[]>;
  /** `Challenge.initial_seed(game_id)` (S1): the seed before the starter and the first draw. */
  initialSeed(key: K): Promise<string>;
}

/** A receipt's decoded events: the chain's `WriteResult` satisfies it. */
export interface MoveReceipt {
  events: ReadonlyArray<{ name: string; fields: Record<string, unknown> }>;
}

/** A move whose chain result differs from the engine's: logged with the game and the move, for a parity bug report. */
export interface Mismatch {
  gameId: number;
  /** Null for the check at open. */
  move: { kind: "build" | "discard" | "surrender"; placement?: PlaceMove } | null;
  reason: string;
}

export interface PredictedOptions {
  /** The time in seconds that `expiresAt` is compared with: the wall clock by default; the e2e passes block time. */
  now?: () => number;
  /** The error a build or discard of an expired game shows (the chain's `GameExpiredError`); a plain one by default. */
  expiredError?: () => Error;
  /** Called on each mismatch; `console.warn` by default. */
  onMismatch?: (mismatch: Mismatch) => void;
}

/** The board's state of a predicted game: `PageState` and what prediction adds. */
export interface PredictedState extends PageState {
  /** The engine is in step with the chain: moves show at once. False after a failed check at open: the hand waits for the chain. */
  predicting: boolean;
  /** Why prediction is off (the dev-only notice); null while predicting. */
  fallback: string | null;
  /** Moves sent and not yet confirmed (at most `MAX_UNCONFIRMED`). */
  unconfirmed: number;
  /** Counts the resyncs: the board shows "Board resynced" each time it moves. */
  resynced: number;
  /** `GameView.expiresAt`; 0 when unknown. */
  expiresAt: number;
  /** Points the last move added (a discard takes some: negative); null before the first move of this page. */
  delta: number | null;
  /**
   * The board may be behind the chain: a re-open (a resync) or the read after a receipt failed. The board stays as it
   * was, `readError` says why, and the next move, or `retry()`, re-opens first.
   */
  stale: boolean;
}

type Kind = "build" | "discard" | "surrender";

/** What the engine predicted for one move, checked against its receipt and the `game()` read that follows. */
interface Expected {
  tileId: number;
  plan: number;
  placement?: PlaceMove;
  scored: ScoredStructure[];
  /** The `Discarded` event's points. */
  taken: number;
  score: number;
  over: boolean;
  seed: bigint;
  hand: { id: number; plan: number } | null;
}

interface Entry {
  kind: Kind;
  /** The engine before the move: a refusal rolls back to it. */
  before: EngineGame;
  expected: Expected;
  /** Set when a refusal or a resync drops the move before it is sent. */
  dropped: boolean;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A view error's kind (the chain's `ViewError.kind`), `rpc` otherwise. */
const errorKind = (error: unknown): string => {
  const kind = (error as { kind?: unknown } | null)?.kind;
  return typeof kind === "string" ? kind : "rpc";
};

function scoredOf(result: MoveResult): ScoredStructure[] {
  return result.scored.map((s) => ({ category: CATEGORIES.indexOf(s.category), size: s.size, points: s.points }));
}

function toPlacement(move: PlaceMove): Placement | null {
  const orientation = ORIENTATIONS[move.orientation];
  if (!orientation || orientation === OrientationType.None) return null;
  return { orientation, x: move.x - CENTER, y: move.y - CENTER };
}

/**
 * Replays a game's drawn tiles on a new engine game of `initialSeed`, in draw order. A discarded tile is replayed as a
 * discard, which reseeds at (`CENTER`, `CENTER`) whatever position `tiles()` reports for it (0, 0). Throws when a tile
 * is not the one the engine draws, or a placement is refused.
 */
export function replayChallenge(initialSeed: bigint, tiles: readonly ChainTile[], game: Pick<ChainGame, "playerId" | "deckSize" | "over">): EngineGame {
  const engine = EngineGame.start({ deck: "simple", seed: initialSeed, player: BigInt(game.playerId), tileLimit: game.deckSize });
  const drawn = [...tiles].sort((a, b) => a.id - b.id);
  const starter = drawn[0];
  if (!starter || starter.id !== 1 || starter.x !== CENTER || starter.y !== CENTER) throw new Error("Replay: no starter at the centre");
  for (const tile of drawn.slice(1)) {
    const hand = engine.hand;
    if (!hand || hand.id !== tile.id || PLANS.indexOf(hand.plan) !== tile.plan) {
      throw new Error(`Replay: tile ${tile.id} is not the engine's draw`);
    }
    if (tile.status === PLACED) {
      const placement = toPlacement(tile);
      if (!placement) throw new Error(`Replay: tile ${tile.id} has no orientation`);
      engine.build(placement);
    } else if (tile.status === DISCARDED) {
      engine.discard();
    } else if (tile.status === HELD) {
      break;
    } else {
      throw new Error(`Replay: tile ${tile.id} has status ${tile.status}`);
    }
  }
  // A surrendered game keeps its last tile in hand, as on chain.
  if (game.over && !engine.over) engine.surrender();
  return engine;
}

/** Why the engine is not in step with `game`; null when its seed, hand, score and end equal the chain's. */
function divergence(engine: EngineGame, game: ChainGame): string | null {
  if (engine.over !== game.over) return `over: engine ${engine.over}, chain ${game.over}`;
  if (engine.score !== game.score) return `score: engine ${engine.score}, chain ${game.score}`;
  if (game.over) return null;
  if (engine.seed !== BigInt(game.seed)) return `seed: engine 0x${engine.seed.toString(16)}, chain ${game.seed}`;
  const hand = engine.hand;
  if ((hand?.id ?? 0) !== game.tileId) return `tile in hand: engine ${hand?.id ?? 0}, chain ${game.tileId}`;
  if (hand && PLANS.indexOf(hand.plan) !== game.plan) return `plan in hand: engine ${PLANS.indexOf(hand.plan)}, chain ${game.plan}`;
  return null;
}

/** Why a receipt is not the move the engine predicted; null when its events say the same. */
function receiptDivergence(kind: Kind, expected: Expected, receipt: MoveReceipt, gameId: number): string | null {
  const events = receipt.events.filter((e) => Number(e.fields.gameId) === gameId);
  const named = (name: string) => events.filter((e) => e.name === name).map((e) => e.fields);
  const over = named("GameOver")[0];
  if (kind === "build") {
    const built = named("Built")[0];
    const p = expected.placement!;
    if (!built) return "no Built event";
    const got = [built.tileId, built.plan, built.orientation, built.x, built.y].map(Number);
    const want = [expected.tileId, expected.plan, p.orientation, p.x, p.y];
    if (got.some((v, i) => v !== want[i])) return `Built ${got.join(",")}, engine ${want.join(",")}`;
    const scored = named("Scored").map((f) => ({ category: Number(f.category), size: Number(f.size), points: Number(f.points) }));
    if (JSON.stringify(scored) !== JSON.stringify(expected.scored)) return `Scored ${JSON.stringify(scored)}, engine ${JSON.stringify(expected.scored)}`;
  } else if (kind === "discard") {
    const discarded = named("Discarded")[0];
    if (!discarded) return "no Discarded event";
    const got = [discarded.tileId, discarded.plan, discarded.points].map(Number);
    const want = [expected.tileId, expected.plan, expected.taken];
    if (got.some((v, i) => v !== want[i])) return `Discarded ${got.join(",")}, engine ${want.join(",")}`;
  }
  if (Boolean(over) !== expected.over) return `GameOver ${Boolean(over)}, engine ${expected.over}`;
  if (over && Number(over.score) !== expected.score) return `GameOver score ${Number(over.score)}, engine ${expected.score}`;
  return null;
}

/**
 * A Challenge game played with next-tile prediction (section 9.2), behind the `PageSession` interface of `LocalSession`.
 *
 * `open` reads the initial seed (`initial_seed`), replays `tiles()` with the engine and checks the engine's seed and hand
 * against `game()`. A move runs on the engine first: the board shows the tile, its points and the next tile at once,
 * then the move is sent and stays pending until its receipt; the receipt's events and one `game()` read confirm it. At
 * most `MAX_UNCONFIRMED` moves wait for their receipts, sent one after the other. The engine is kept between moves and
 * replayed only on open and on a resync.
 *
 * On a refused move the engine rolls back (it is cloned before each move), the moves queued after it are dropped and the
 * error shows. On an accepted move whose result differs, the chain wins: the session re-opens and `resynced` moves. If
 * the check at open fails, the session plays without prediction: each move waits for the chain.
 */
export class PredictedSession<K extends { gameId: number }, R extends MoveReceipt = MoveReceipt> implements PageSession<R> {
  private current: PredictedState;
  private readonly listeners = new Set<(state: PredictedState) => void>();
  private engine: EngineGame | null = null;
  private queue: Entry[] = [];
  /** The sends in order: a move is sent once the one before it is confirmed (the writer takes one write at a time). */
  private tail: Promise<unknown> = Promise.resolve();
  private readonly now: () => number;
  private readonly expiredError: () => Error;
  private readonly onMismatch: (mismatch: Mismatch) => void;
  /** A re-open is reading: moves are refused until it ends. */
  private reopening = false;

  constructor(
    private readonly views: PredictedViews<K>,
    readonly key: K,
    /** The viewer's address; null without an account: the game is shown read only. */
    private readonly playerId: string | null,
    options: PredictedOptions = {},
  ) {
    this.now = options.now ?? (() => Math.floor(Date.now() / 1000));
    this.expiredError = options.expiredError ?? (() => new Error("Game: expired"));
    this.onMismatch = options.onMismatch ?? ((m) => console.warn("PredictedSession: mismatch", m));
    this.current = {
      key: { gameId: key.gameId },
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
      predicting: false,
      fallback: null,
      unconfirmed: 0,
      resynced: 0,
      expiresAt: 0,
      delta: null,
      stale: false,
    };
  }

  get state(): PredictedState {
    return this.current;
  }

  subscribe(listener: (state: PredictedState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Reads the game and replays it; on a failed check the session plays without prediction. */
  async open(): Promise<void> {
    await this.load(false);
  }

  /**
   * Re-opens from the chain (after a resync or a read that failed): moves are refused while it reads, and a failed read
   * keeps the board as it was, stale. True once the board is the chain's again.
   */
  async retry(): Promise<boolean> {
    if (this.reopening) return false;
    this.reopening = true;
    const kept = this.current;
    // The hand waits while the game is read again.
    this.set({ pending: true, hand: null });
    try {
      const ok = await this.load(true);
      if (!ok) this.set({ pending: kept.pending && this.queue.length > 0, hand: kept.hand });
      return ok;
    } finally {
      this.reopening = false;
    }
  }

  /**
   * Reads the game, replays it and checks the replay; the queued moves are dropped. A failed read is the page's error on
   * the first open (`keep` false), and a stale board on a re-open (`keep` true). False when a read failed.
   */
  private async load(keep: boolean): Promise<boolean> {
    let game: ChainGame;
    let tiles: ChainTile[];
    try {
      [game, tiles] = await Promise.all([this.views.game(this.key), this.views.tiles(this.key)]);
    } catch (error) {
      if (keep) this.set({ stale: true, readError: message(error) });
      else this.set({ status: "error", error: errorKind(error), message: message(error) });
      return false;
    }
    const readonly = this.playerId === null || BigInt(game.playerId) !== BigInt(this.playerId);
    let fallback: string | null = null;
    try {
      const initial = BigInt(await this.views.initialSeed(this.key));
      this.engine = replayChallenge(initial, tiles, game);
      fallback = divergence(this.engine, game);
    } catch (error) {
      fallback = message(error);
    }
    if (fallback) this.engine = this.boardOf(game, tiles);
    for (const e of this.queue) e.dropped = true;
    this.queue = [];
    // `project` reads `readonly` for the hand.
    this.current = { ...this.current, readonly };
    this.set({
      ...this.project(),
      status: "ready",
      error: null,
      message: null,
      predicting: fallback === null,
      fallback,
      stale: false,
      readError: null,
      expiresAt: game.expiresAt,
      // Without prediction the board and the hand are the chain's.
      ...(fallback ? this.chainProjection(game, tiles, readonly) : {}),
    });
    if (fallback) this.onMismatch({ gameId: this.key.gameId, move: null, reason: `open: ${fallback}` });
    return true;
  }

  /** The game is past its 24 h (S1): only a surrender is accepted. */
  get expired(): boolean {
    const { expiresAt, game } = this.current;
    return expiresAt !== 0 && !game?.over && this.now() >= expiresAt;
  }

  /** Every legal slot of the tile in hand at `orientation` (1 North to 4 West), in the chain's coordinates. */
  slots(orientation: number): { x: number; y: number }[] {
    const hand = this.current.hand;
    const wanted = ORIENTATIONS[orientation];
    if (!this.engine || !hand || !wanted) return [];
    return this.engine
      .legalPlacements(PLANS[hand.plan] as PlanType)
      .filter((p) => p.orientation === wanted)
      .map((p) => ({ x: CENTER + p.x, y: CENTER + p.y }));
  }

  /** The orientations (1 to 4) the tile in hand may take at `slot`; none when it cannot go there. */
  orientationsAt(slot: { x: number; y: number }): number[] {
    const hand = this.current.hand;
    if (!this.engine || !hand) return [];
    const plan = PLANS[hand.plan] as PlanType;
    return [1, 2, 3, 4].filter((o) => this.engine!.canPlace(toPlacement({ orientation: o, ...slot })!, plan));
  }

  /** The points placing the tile in hand as `move` would add; null when the move is not legal. */
  preview(move: PlaceMove): number | null {
    const placement = toPlacement(move);
    const hand = this.current.hand;
    if (!placement || !this.engine || !hand || !this.engine.canPlace(placement, PLANS[hand.plan] as PlanType)) return null;
    const game = this.engine.clone();
    if (!this.current.predicting) game.force(PLANS[hand.plan] as PlanType);
    return game.build(placement).points;
  }

  /** Places the tile in hand; `move` in the chain's absolute coordinates. Resolves once the move is confirmed or refused. */
  place(move: PlaceMove, send: Send<R>): Promise<boolean> {
    return this.move("build", send, move);
  }

  discard(send: Send<R>): Promise<boolean> {
    return this.move("discard", send);
  }

  /** Closes the game; accepted after `expiresAt`, which only a surrender closes. */
  surrender(send: Send<R>): Promise<boolean> {
    return this.move("surrender", send);
  }

  private async move(kind: Kind, send: Send<R>, placement?: PlaceMove): Promise<boolean> {
    if (this.reopening) return false;
    // A stale board is re-read first; the player then plays on the chain's board.
    if (this.current.stale) {
      await this.retry();
      return false;
    }
    const s = this.current;
    if (s.status !== "ready" || s.readonly || !this.engine || this.engine.over || s.game?.over) return false;
    if (kind !== "surrender" && this.expired) {
      this.set({ writeError: this.expiredError().message });
      return false;
    }
    if (!s.predicting) return this.unpredicted(kind, send, placement);
    if (this.queue.length >= MAX_UNCONFIRMED) return false;

    const before = this.engine.clone();
    let entry: Entry;
    let delta: number | null = null;
    try {
      const engine = this.engine;
      const hand = engine.hand!;
      const tile = { tileId: hand.id, plan: PLANS.indexOf(hand.plan) };
      let scored: ScoredStructure[] = [];
      let taken = 0;
      if (kind === "build") {
        const where = placement && toPlacement(placement);
        if (!where) throw new Error("Orientation: not valid");
        const result = engine.build(where);
        scored = scoredOf(result);
        delta = result.points;
      } else if (kind === "discard") {
        taken = engine.discard().points;
        delta = -taken;
      } else {
        engine.surrender();
      }
      const next = engine.hand;
      entry = {
        kind,
        before,
        dropped: false,
        expected: {
          ...tile,
          placement,
          scored,
          taken,
          score: engine.score,
          over: engine.over,
          seed: engine.seed,
          hand: next && { id: next.id, plan: PLANS.indexOf(next.plan) },
        },
      };
    } catch (error) {
      // Refused by the engine's rules: nothing is sent.
      this.engine = before;
      this.set({ writeError: message(error) });
      return false;
    }
    this.queue.push(entry);
    this.set({ ...this.project(), writeError: null, readError: null, lastScored: entry.expected.scored, delta });
    const run = this.tail.then(() => this.confirm(entry, send));
    this.tail = run.catch(() => undefined);
    return run;
  }

  /** Sends one queued move, then checks its receipt and the chain's game against the prediction. */
  private async confirm(entry: Entry, send: Send<R>): Promise<boolean> {
    if (entry.dropped) return false;
    let receipt: R;
    try {
      receipt = await send();
    } catch (error) {
      await this.refuse(entry, error);
      return false;
    }
    const reason = receiptDivergence(entry.kind, entry.expected, receipt, this.key.gameId);
    let game: ChainGame | null = null;
    try {
      game = await this.views.game(this.key);
    } catch (error) {
      // The receipt confirmed the move; the seed and the hand cannot be checked until the next read.
      this.set({ readError: message(error) });
    }
    if (entry.dropped) return true;
    const after = reason ?? (game && this.divergenceOf(entry.expected, game));
    if (after) {
      this.onMismatch({ gameId: this.key.gameId, move: { kind: entry.kind, placement: entry.expected.placement }, reason: after });
      await this.resync();
      return true;
    }
    this.queue = this.queue.filter((e) => e !== entry);
    this.set({ ...this.project(), expiresAt: game?.expiresAt ?? this.current.expiresAt });
    return true;
  }

  private divergenceOf(expected: Expected, game: ChainGame): string | null {
    if (game.over !== expected.over) return `over: engine ${expected.over}, chain ${game.over}`;
    if (game.score !== expected.score) return `score: engine ${expected.score}, chain ${game.score}`;
    if (game.over) return null;
    if (BigInt(game.seed) !== expected.seed) return `seed: engine 0x${expected.seed.toString(16)}, chain ${game.seed}`;
    if (game.tileId !== (expected.hand?.id ?? 0) || (expected.hand && game.plan !== expected.hand.plan)) {
      return `tile in hand: engine ${expected.hand?.id ?? 0}/${expected.hand?.plan ?? 0}, chain ${game.tileId}/${game.plan}`;
    }
    return null;
  }

  /**
   * A refused move: the engine rolls back to before it, the moves queued after it are dropped, the error shows. A move
   * whose receipt could not be read (a hash, no known revert) may have landed: the session re-opens from the chain.
   */
  private async refuse(entry: Entry, error: unknown): Promise<void> {
    this.engine = entry.before;
    for (const e of this.queue) e.dropped = true;
    this.queue = [];
    this.set({ ...this.project(), writeError: message(error), lastScored: [], delta: null });
    const sent = error as { transactionHash?: unknown; reverted?: unknown } | null;
    if (sent && typeof sent.transactionHash === "string" && !sent.reverted) await this.resync(false);
  }

  /** The chain wins: queued moves are dropped, the session re-opens and the board redraws from the replay. */
  private async resync(count = true): Promise<void> {
    for (const e of this.queue) e.dropped = true;
    this.queue = [];
    const resynced = this.current.resynced + (count ? 1 : 0);
    const writeError = this.current.writeError;
    this.set({ ...this.project(), resynced });
    if (await this.retry()) this.set({ writeError, lastScored: [], delta: null });
  }

  /** Without prediction (the check at open failed): the hand waits for the chain, one move at a time. */
  private async unpredicted(kind: Kind, send: Send<R>, placement?: PlaceMove): Promise<boolean> {
    const s = this.current;
    if (s.pending || (kind !== "surrender" && !s.hand)) return false;
    const hand = s.hand;
    const tiles = kind === "build" && hand && placement ? [...s.tiles, { id: hand.tileId, plan: hand.plan, ...placement, pending: true }] : s.tiles;
    this.set({ pending: true, unconfirmed: 1, hand: null, tiles, writeError: null, readError: null, lastScored: [], delta: null });
    let receipt: R;
    try {
      receipt = await send();
    } catch (error) {
      this.set({ pending: false, unconfirmed: 0, hand, tiles: s.tiles, writeError: message(error) });
      return false;
    }
    const before = s.game?.score ?? 0;
    try {
      const [game, chainTiles] = await Promise.all([this.views.game(this.key), this.views.tiles(this.key)]);
      this.engine = this.boardOf(game, chainTiles);
      this.set({ ...this.chainProjection(game, chainTiles, s.readonly), pending: false, unconfirmed: 0, delta: game.score - before, expiresAt: game.expiresAt });
    } catch (error) {
      // The move landed but the next tile is unknown: the next action re-reads the game (`stale`).
      this.set({ pending: false, unconfirmed: 0, readError: message(error), stale: true });
    }
    const scored = receipt.events
      .filter((e) => e.name === "Scored" && Number(e.fields.gameId) === this.key.gameId)
      .map((e) => ({ category: Number(e.fields.category), size: Number(e.fields.size), points: Number(e.fields.points) }));
    this.set({ lastScored: scored });
    return true;
  }

  /**
   * An engine that holds the chain's board for the legality of the hand and the preview, when the replay is not in
   * step: the placed tiles written as they are (ids moved past the engine's own), nothing drawn from it.
   */
  private boardOf(game: ChainGame, tiles: readonly ChainTile[]): EngineGame {
    const board = EngineGame.start({ deck: "simple", seed: 0n, player: BigInt(game.playerId) });
    for (const t of tiles) {
      const placement = t.status === PLACED && t.id !== 1 ? toPlacement(t) : null;
      const plan = PLANS[t.plan] as PlanType | undefined;
      if (placement && plan) board.write({ id: 1000 + t.id, plan, ...placement });
    }
    return board;
  }

  /** The board and the hand as the chain gives them (no prediction). */
  private chainProjection(game: ChainGame, tiles: readonly ChainTile[], readonly: boolean): Partial<PredictedState> {
    const placed = tiles.filter((t) => t.status === PLACED);
    return {
      game: {
        playerId: game.playerId,
        score: game.score,
        over: game.over,
        placedCount: placed.length,
        deckSize: game.deckSize,
        discardedCount: tiles.filter((t) => t.status === DISCARDED).length,
      },
      tiles: placed.map(({ id, plan, orientation, x, y }) => ({ id, plan, orientation, x, y })),
      discardedPlans: tiles.filter((t) => t.status === DISCARDED).map((t) => t.plan),
      hand: !readonly && !game.over && game.tileId ? { tileId: game.tileId, plan: game.plan } : null,
      pending: false,
      unconfirmed: 0,
    };
  }

  /** The engine's state as the board reads it; the tiles of unconfirmed builds are marked pending. */
  private project(): Partial<PredictedState> {
    const g = this.engine;
    if (!g) return {};
    const pending = new Set(this.queue.filter((e) => e.kind === "build").map((e) => e.expected.tileId));
    const tiles: BoardTile[] = g.placed().map((t) => ({
      id: t.id,
      plan: PLANS.indexOf(t.plan),
      orientation: ORIENTATIONS.indexOf(t.orientation),
      x: CENTER + t.x,
      y: CENTER + t.y,
      ...(pending.has(t.id) ? { pending: true } : {}),
    }));
    const hand = g.over || this.current.readonly ? null : g.hand;
    return {
      game: {
        playerId: this.current.game?.playerId ?? `0x${g.player.toString(16)}`,
        score: g.score,
        over: g.over,
        // As on chain: the starter counts as placed.
        placedCount: g.built + 1,
        deckSize: g.tileLimit,
        discardedCount: g.discarded,
      },
      tiles,
      discardedPlans: [...g.discardedPlans],
      hand: hand ? { tileId: hand.id, plan: PLANS.indexOf(hand.plan) } : null,
      pending: this.queue.length > 0,
      unconfirmed: this.queue.length,
    };
  }

  private set(patch: Partial<PredictedState>): void {
    this.current = { ...this.current, ...patch };
    for (const listener of this.listeners) listener(this.current);
  }
}
