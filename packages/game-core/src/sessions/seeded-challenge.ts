import { CENTER, EngineGame } from "../engine";
import { poseidon } from "../engine/draw";
import { CategoryType } from "../types/category";
import { OrientationType } from "../types/orientation";
import { PlanType } from "../types/plan";
import type { ChainDraw, ChainTile } from "./predicted-session";
import type { PlaceMove, ScoredStructure } from "./types";

// A Challenge game played on the device by the contract's rules (#927, the mock's games): the engine of a VRF game (#645),
// each draw taken from a random kept with the game in place of the VRF's (open point 3), so the game replays the same from
// its seed and its moves after a reload. Its reads have the chain's shapes (`ChainTile`, `ChainDraw` and the fields of
// `GameView` below), so `PredictedSession` plays it as it plays a game on chain and the over page replays it the same way.

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);
const CATEGORIES = Object.values(CategoryType);

/** `TileView.status` codes (the chain's `TILE_STATUS`). */
const PLACED = 1;
const DISCARDED = 2;
const HELD = 3;

/** The salt of a seeded game's draws ("DRAW"): tile `id`'s random is `poseidon(seed, DRAW_SALT, id)`, a stand-in for the VRF's. */
export const SEEDED_DRAW_SALT = 0x44524157n;

/** One move of a seeded game, in the chain's absolute coordinates for a build (as `Challenge.build` takes them). */
export type SeededMove = { kind: "build"; orientation: number; x: number; y: number } | { kind: "discard" } | { kind: "surrender" };

/** What a move did, as its receipt's `Built` or `Discarded`, `Scored` and `GameOver` events say it. */
export interface SeededOutcome {
  kind: SeededMove["kind"];
  /** The tile the move played (the tile in hand; for a surrender, the one kept in hand, 0 for none). */
  tileId: number;
  plan: number;
  scored: ScoredStructure[];
  /** The points a discard took. */
  taken: number;
  score: number;
  over: boolean;
}

/** The game fields of `Challenge.game(id)` a seeded game answers; the record's own (id, player, times) are the caller's. */
export interface SeededGameView {
  seed: string;
  score: number;
  over: boolean;
  tileCount: number;
  placedCount: number;
  discardedCount: number;
  tileId: number;
  plan: number;
  remainingCount: number;
  deckSize: number;
}

const hex = (value: bigint) => `0x${value.toString(16)}`;

/**
 * A Challenge game of the simple deck on the VRF's draws, seeded: the spawn's random is `seed` (the deck, the hand and the
 * two tiles after it, as the engine's VRF start draws them), and every later tile `id` is drawn from
 * `poseidon(seed, SEEDED_DRAW_SALT, id)` as soon as a move leaves it to draw. The engine is kept between moves; `replay`
 * rebuilds a game from its seed and its moves.
 */
export class SeededChallenge {
  private readonly engine: EngineGame;
  /** The tiles the moves played, in id order: placed, or discarded at (0, 0). */
  private readonly played: ChainTile[] = [];

  constructor(
    readonly seed: bigint,
    readonly player: bigint,
  ) {
    this.engine = EngineGame.start({ deck: "simple", seed, player, vrf: true });
    this.drawPending();
  }

  /** The game of `seed` with `moves` played again, in order. Throws when a move is not legal. */
  static replay(seed: bigint, player: bigint, moves: readonly SeededMove[]): SeededChallenge {
    const game = new SeededChallenge(seed, player);
    for (const move of moves) game.play(move);
    return game;
  }

  get over(): boolean {
    return this.engine.over;
  }

  get score(): number {
    return this.engine.score;
  }

  /**
   * Plays a move as `Challenge.build`, `discard` or `surrender` do: the engine's refusal (`Tile: cannot place`, `Game: is
   * over`) is thrown and nothing moves. The tiles the move leaves to draw are drawn at once from the seed.
   */
  play(move: SeededMove): SeededOutcome {
    const hand = this.engine.hand;
    const tile = { tileId: hand?.id ?? 0, plan: hand ? PLANS.indexOf(hand.plan) : 0 };
    if (move.kind === "surrender") {
      this.engine.surrender();
      return { kind: "surrender", ...tile, scored: [], taken: 0, score: this.engine.score, over: true };
    }
    if (move.kind === "build") {
      const orientation = ORIENTATIONS[move.orientation];
      if (!orientation || orientation === OrientationType.None) throw new Error("Orientation: not valid");
      const result = this.engine.build({ orientation, x: move.x - CENTER, y: move.y - CENTER });
      this.played.push({ id: tile.tileId, status: PLACED, plan: tile.plan, orientation: move.orientation, x: move.x, y: move.y });
      this.drawPending();
      const scored = result.scored.map((s) => ({ category: CATEGORIES.indexOf(s.category), size: s.size, points: s.points }));
      return { kind: "build", ...tile, scored, taken: 0, score: result.score, over: result.over };
    }
    const result = this.engine.discard();
    this.played.push({ id: tile.tileId, status: DISCARDED, plan: tile.plan, orientation: 0, x: 0, y: 0 });
    this.drawPending();
    return { kind: "discard", ...tile, scored: [], taken: result.points, score: result.score, over: result.over };
  }

  /** `Challenge.tiles(id)`: the starter at the centre, the tiles played in id order, then the tile in hand (held). */
  tiles(): ChainTile[] {
    const hand = this.engine.hand;
    const starter: ChainTile = { id: 1, status: PLACED, plan: PLANS.indexOf(PlanType.RFFFRFCFR), orientation: ORIENTATIONS.indexOf(OrientationType.South), x: CENTER, y: CENTER };
    const held: ChainTile[] = hand ? [{ id: hand.id, status: HELD, plan: PLANS.indexOf(hand.plan), orientation: 0, x: 0, y: 0 }] : [];
    return [starter, ...this.played.map((t) => ({ ...t })), ...held];
  }

  /** `Challenge.game(id)`'s game fields: a VRF game's seed never moves; the tile in hand is 0 once the game is over. */
  view(): SeededGameView {
    const g = this.engine;
    const hand = g.over ? null : g.hand;
    return {
      seed: hex(g.seed),
      score: g.score,
      over: g.over,
      tileCount: g.tileCount,
      placedCount: g.built + 1,
      discardedCount: g.discarded,
      tileId: hand?.id ?? 0,
      plan: hand ? PLANS.indexOf(hand.plan) : 0,
      remainingCount: g.tileLimit - g.tileCount,
      deckSize: g.tileLimit,
    };
  }

  /** `Challenge.draw(id)`: the two tiles after the hand (0 past the deck's end or once over), the deck bitmap, on the VRF. */
  draw(): ChainDraw & { tiles: bigint } {
    const g = this.engine;
    const plans = g.over ? [] : g.queue.map((t) => (t.plan ? PLANS.indexOf(t.plan) : 0));
    return { next: plans[0] ?? 0, after: plans[1] ?? 0, tiles: g.tiles, vrf: true, draws: g.drawsNext };
  }

  /** Draws every tile left to draw (the hand, then the queue, in id order) from the seed, as the VRF's answer would. */
  private drawPending(): void {
    const g = this.engine;
    if (g.over) return;
    const pending = [...(g.handPending ? [g.tileCount] : []), ...g.queue.filter((t) => t.plan === null).map((t) => t.id)];
    for (const id of pending) g.supply(poseidon(this.seed, SEEDED_DRAW_SALT, id));
  }
}

/** A move as the board sends it (`PlaceMove`, absolute) for a seeded game. */
export const seededBuild = (move: PlaceMove): SeededMove => ({ kind: "build", orientation: move.orientation, x: move.x, y: move.y });
