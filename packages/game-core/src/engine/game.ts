// The game of the contracts, off chain: start, build, discard, surrender, game over and the
// running score, as `contracts/src/models/game.cairo` and the `build`/`discard` of
// `components/playable.cairo` (Challenge) and `components/tutoriable.cairo` (Tutorial) play them,
// with the scoring of `structure/assessment.cairo` and `structure/forest.cairo` (D-18) and the
// tile owners of D-19 (`docs/architecture/structure-state.md`, "D-19").
//
// Pure: no I/O, no clock, no random source. Everything follows from the seed, the deck and the
// moves. Coordinates are relative to the starter tile (the contracts' `CENTER`).

import { CategoryType } from "../types/category";
import { OrientationType } from "../types/orientation";
import { PlanType } from "../types/plan";
import { DECKS, type DeckRules, type EngineDeck } from "./decks";
import { bit, drawFromBitmap, mostSignificantBit, poseidon, withdrawExtra } from "./draw";
import {
  CATEGORY_CITY,
  CATEGORY_FOREST,
  CATEGORY_ROAD,
  CATEGORY_WONDER,
  EAST,
  NORTH,
  SOUTH,
  WEST,
  areaAt,
  categoryOf,
  edgeCategory,
  opposite,
  planRow,
  rotateSpot,
  toward,
  turns,
  wonderArea,
} from "./geometry";
import { ALL_AREAS, Board, type BoardTile, type TileAreas } from "./structures";
import { VILLAGE_MAX_CELLS_LIMIT, VILLAGE_START_CELLS, startTerritory, type Cell } from "./village";

/** The contracts' `CENTER`: the starter's coordinates on chain, hashed by the reseeds. */
export const CENTER = 0x7fffffff;
export const ROAD_BASE_POINTS = 100;
export const CITY_BASE_POINTS = 200;
export const FOREST_BASE_POINTS = 300;
export const WONDER_BASE_POINTS = 900;
export const DISCARD_POINTS = 50;
/** A road or a city of at least this many nodes is a big structure (`constants::BIG_SIZE`). */
export const BIG_SIZE = 8;
const BONUS_BASE = 10235n;
const BONUS_DIVISOR = 10000n;

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);
const CATEGORIES = Object.values(CategoryType);

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineError";
  }
}

export interface EngineConfig {
  readonly deck: EngineDeck;
  /** The initial seed (a felt). How it is derived is the caller's business. */
  readonly seed: bigint;
  /** The game's player: owner of the starter and of tiles built without an owner. Default 1. */
  readonly player?: bigint;
  /** The tile limit, the starter included. Default: the deck's count (38 Simple, 10 Tutorial). */
  readonly tileLimit?: number;
  /**
   * Deck `story` only: the plans drawn after the starter, in draw order. The game has no random
   * draw (no withdrawal, no reseed) and plays `sequence.length + 1` tiles, the starter included.
   */
  readonly sequence?: readonly PlanType[];
  /**
   * Deck `story` only: tiles already on the board when the level starts (written without a move, as
   * `write` does, owned by the player, ids from `PREPLACED_ID`). They are not drawn and do not count
   * against the tile limit.
   */
  readonly placed?: readonly ({ plan: PlanType } & Placement)[];
  /**
   * The territory mask (#640): when given, a tile goes on these cells only (`Village: cell not owned`), as `Village.place`
   * and #643's attack replay rule it. Relative coordinates. A side facing a cell outside it is an empty position, so a
   * structure that reaches it stays open (no border rule).
   */
  readonly territory?: readonly Cell[];
  /** A village's cap of cells (`Village.max_cells`, the owner's): `buyParcel` stops there. Default `VILLAGE_MAX_CELLS_LIMIT`. */
  readonly maxCells?: number;
  /**
   * The tiles known ahead, the tile in hand included (#645). 1, the default: each move draws the next tile, reseeded from
   * the move's position (Simple), bit-exact with the contracts before #645. More (deck `simple` only): the queue of the
   * VRF Challenge, as Training plays it with its local random: the start draws `lookahead` tiles, each move takes the
   * tile in hand from the queue and draws one more at its end; no draw reads a position, so a move never steers it. The
   * game is over once the queue is empty.
   */
  readonly lookahead?: number;
  /**
   * Deck `simple` only: the game draws as a Challenge game on the VRF does (#645, D-30,
   * `docs/architecture/challenge-vrf.md`, `GameImpl::advance`). The seed is the spawn's random: it
   * builds the deck, then draws the hand from itself and the next two tiles from Poseidon(seed, 1) and
   * Poseidon(seed, 2). The seed never changes. Each move brings the next tile into the hand and leaves
   * the tile two ahead to draw (`queue`), given by `supply` (a random, as the VRF's) or
   * `supplyPlan` (the plan a receipt's `Queued` names).
   */
  readonly vrf?: boolean;
}

/** A tile of the hand or of the queue; `plan` is `null` while it is not drawn yet. */
export interface QueuedTile {
  readonly id: number;
  readonly plan: PlanType | null;
}

/** The id of the first tile of a story level's `placed`, clear of the ids of the drawn tiles. */
export const PREPLACED_ID = 200;

export interface Placement {
  readonly orientation: OrientationType;
  readonly x: number;
  readonly y: number;
}

/** A `Scored` event: `player` is the winner of the structure, 0 on a tie (D-19). */
export interface Scored {
  readonly category: CategoryType;
  readonly size: number;
  readonly points: number;
  readonly player: bigint;
}

export interface MoveResult {
  readonly action: "build" | "discard";
  readonly tileId: number;
  readonly plan: PlanType;
  /** The `Scored` events of the move, in the contract's order (none for a discard). */
  readonly scored: readonly Scored[];
  /**
   * The structures the move closed, beside `scored` (one each, in the same order): each with its tiles and its areas on
   * them, for the board's highlight (#722). The events stay the contract's.
   */
  readonly closed: readonly ClosedStructure[];
  /** Points the move added (a build) or took (a discard, the `Discarded` event's `points`). */
  readonly points: number;
  readonly score: number;
  readonly over: boolean;
}

export interface PlacedTile {
  readonly id: number;
  readonly plan: PlanType;
  readonly orientation: OrientationType;
  readonly x: number;
  readonly y: number;
  readonly owner: bigint;
}

/**
 * A structure the game scored, in move order: its `Scored` event with the distinct tiles D-19 counts (`size` is the
 * nodes, the areas it spans; a wonder's tiles are the wonder and the 8 around it) and the tile whose move closed it.
 * `areas` holds its areas on each of its tiles (the root's nodes in the union-find; a wonder's tiles whole, as D-19
 * counts them), in tile id order: what the board lights (#722). Absent on a closing not made by the engine (a mock).
 */
export interface ClosedStructure extends Scored {
  readonly tiles: number;
  readonly tileId: number;
  readonly areas?: readonly TileAreas[];
}

/** A structure closed on the board, scored or written, with its areas on each of its tiles (`EngineGame.closedOnBoard`). */
export interface ClosedAreas {
  readonly category: CategoryType;
  readonly areas: readonly TileAreas[];
}

/**
 * A structure of the board never scored: still open (a half-edge with no tile), or a forest closed while a road along
 * it is open (the contract never assesses it again). `tiles` counts its distinct tiles.
 */
export interface OpenStructure {
  readonly category: CategoryType;
  readonly tiles: number;
  readonly size: number;
}

export interface Counters {
  /** Roads and cities scored. */
  readonly structures: number;
  readonly forests: number;
  readonly wonders: number;
  /** Roads and cities scored with at least `BIG_SIZE` nodes. */
  readonly big: number;
}

/** `compute_multiplier(size)`: the bonus `1.0235^size` as a numerator over 10000. */
export function multiplier(size: number): number {
  const powDiv = (base: bigint, exp: bigint): bigint => {
    if (exp === 0n) return BONUS_DIVISOR;
    if (exp === 1n) return base;
    const half = powDiv((base * base) / BONUS_DIVISOR, exp / 2n);
    return exp % 2n === 0n ? half : (base * half) / BONUS_DIVISOR;
  };
  return Number(powDiv(BONUS_BASE, BigInt(size)));
}

function basePoints(category: number): number {
  switch (category) {
    case CATEGORY_ROAD:
      return ROAD_BASE_POINTS;
    case CATEGORY_CITY:
      return CITY_BASE_POINTS;
    case CATEGORY_FOREST:
      return FOREST_BASE_POINTS;
    case CATEGORY_WONDER:
      return WONDER_BASE_POINTS;
    default:
      return 0;
  }
}

function planCode(plan: PlanType): number {
  const code = PLANS.indexOf(plan);
  if (code <= 0) throw new EngineError(`Engine: invalid plan ${plan}`);
  return code;
}

function orientationCode(orientation: OrientationType): number {
  const code = ORIENTATIONS.indexOf(orientation);
  if (code <= 0) throw new EngineError("Orientation: not valid");
  return code;
}

/** `points x base x bonus(size)` in the contract's integer order. */
function formula(count: number, base: number, size: number): number {
  return Number((BigInt(count) * BigInt(base) * BigInt(multiplier(size))) / BONUS_DIVISOR);
}

const cellKey = (cell: Cell): string => `${cell.x},${cell.y}`;

export class EngineGame {
  readonly deck: EngineDeck;
  readonly player: bigint;
  readonly tileLimit: number;
  private readonly rules: DeckRules;
  private readonly sequence: readonly PlanType[] = [];
  private board = new Board();
  private _seed: bigint;
  private _tiles = 0n;
  private _tileCount = 0;
  private _score = 0;
  private _built = 0;
  private _discarded = 0;
  /** The plans (indexes of `PLANS`) of the discarded tiles, in order. */
  private _discardedPlans: number[] = [];
  /** The points the discards took (each at most the score). */
  private _discardPenalty = 0;
  /** Every structure scored, in move order, and their roots (a closed root never merges again). */
  private _closings: ClosedStructure[] = [];
  private scoredRoots = new Set<number>();
  private _over = false;
  /** The tile in hand; its plan is 0 while a VRF game has not drawn it yet. */
  private held: { id: number; plan: number } | null = null;
  /** VRF games: the two tiles after the hand, in id order (plan 0: not drawn yet). */
  private _queue: { id: number; plan: number }[] = [];
  readonly vrf: boolean;
  /** The tiles drawn after the one in hand, in order (`lookahead` above 1). */
  private queued: { id: number; plan: number }[] = [];
  private readonly lookahead: number;
  private counters = { structures: 0, forests: 0, wonders: 0, big: 0 };
  /** The owned cells (`territory`) by key, in order; `null`: no mask. */
  private _territory: Map<string, Cell> | null = null;
  private maxCells = VILLAGE_MAX_CELLS_LIMIT;

  private constructor(config: EngineConfig) {
    this.deck = config.deck;
    this.rules = DECKS[config.deck];
    if (!this.rules) throw new EngineError("Game: invalid mode");
    this.player = config.player ?? 1n;
    if (config.deck === "story") {
      if (!config.sequence?.length) throw new EngineError("Game: a story needs a sequence");
      this.sequence = config.sequence;
      if (config.tileLimit !== undefined && config.tileLimit > config.sequence.length + 1) {
        throw new EngineError("Game: the tile limit exceeds the sequence");
      }
    }
    this.tileLimit =
      config.tileLimit ?? (config.deck === "story" ? this.sequence.length + 1 : this.rules.count);
    this.vrf = config.vrf === true;
    if (this.vrf && config.deck !== "simple") throw new EngineError("Game: only a simple deck draws from the VRF");
    if (this.tileLimit > 255) throw new EngineError("Game: invalid tile limit");
    this.lookahead = config.lookahead ?? 1;
    if (!Number.isInteger(this.lookahead) || this.lookahead < 1) throw new EngineError("Game: invalid lookahead");
    if (this.lookahead > 1 && config.deck !== "simple") throw new EngineError("Game: a queue needs a random deck");
    if (this.lookahead > 1 && this.vrf) throw new EngineError("Game: the VRF's queue is its own (no lookahead)");
    this._seed = config.seed;
    if (config.territory) this._territory = new Map(config.territory.map((c) => [cellKey(c), { x: c.x, y: c.y }]));
    if (config.maxCells !== undefined) {
      if (!Number.isInteger(config.maxCells) || config.maxCells < VILLAGE_START_CELLS || config.maxCells > VILLAGE_MAX_CELLS_LIMIT) {
        throw new EngineError("Village: invalid max cells");
      }
      this.maxCells = config.maxCells;
    }
  }

  /**
   * Starts a village as `Village.found` does (#640): the starter at (0, 0), the territory the 3 x 3 around it unless
   * `territory` is given (a village read from the chain), no deck and no tile in hand. Tiles come by `place`, cells by
   * `buyParcel`.
   */
  static village(
    config: { readonly player?: bigint; readonly territory?: readonly Cell[]; readonly maxCells?: number } = {},
  ): EngineGame {
    return EngineGame.start({
      deck: "village",
      seed: 0n,
      player: config.player,
      territory: config.territory ?? startTerritory(),
      maxCells: config.maxCells,
    });
  }

  /**
   * Starts a game as `spawn` does: the starter tile `RFFFRFCFR` faces South at (0, 0), its deck
   * index is withdrawn, then the deck's extra cards (Simple), and the first tile is drawn.
   */
  static start(config: EngineConfig): EngineGame {
    const game = new EngineGame(config);
    game._tileCount = 1;
    game.board.place({
      id: 1,
      plan: planCode(PlanType.RFFFRFCFR),
      orientation: orientationCode(OrientationType.South),
      x: 0,
      y: 0,
      owner: game.player,
    });
    game._tiles = game.deck === "story" || game.deck === "village" ? 0n : bit(game.rules.starter);
    if (game.deck === "simple") {
      game._tiles = withdrawExtra(game._tiles, game._seed, game.rules.total, game.rules.count);
    }
    config.placed?.forEach((tile, index) => game.write({ ...tile, id: PREPLACED_ID + index }));
    if (game.vrf) game.fill(game._seed);
    else if (game.deck !== "village") game.advance();
    return game;
  }

  clone(): EngineGame {
    const game = Object.create(EngineGame.prototype) as EngineGame;
    Object.assign(game, this);
    game.board = this.board.clone();
    game.held = this.held ? { ...this.held } : null;
    game._queue = this._queue.map((tile) => ({ ...tile }));
    game.queued = this.queued.map((t) => ({ ...t }));
    game.counters = { ...this.counters };
    game._discardedPlans = [...this._discardedPlans];
    game._closings = [...this._closings];
    game.scoredRoots = new Set(this.scoredRoots);
    game._territory = this._territory ? new Map(this._territory) : null;
    return game;
  }

  get seed(): bigint {
    return this._seed;
  }
  /** The deck bitmap (`Game.tiles`): bit `i` set when deck index `i` is out. */
  get tiles(): bigint {
    return this._tiles;
  }
  /** Tiles drawn, the starter included. */
  get tileCount(): number {
    return this._tileCount;
  }
  get score(): number {
    return this._score;
  }
  get built(): number {
    return this._built;
  }
  get discarded(): number {
    return this._discarded;
  }
  /** The plans (chain plan ids) of the discarded tiles, in order. */
  get discardedPlans(): readonly number[] {
    return this._discardedPlans;
  }
  /** The points the discards took, in all. */
  get discardPenalty(): number {
    return this._discardPenalty;
  }
  /** Every structure the game scored, in move order (the `Scored` events of its moves, with their tiles). */
  closings(): readonly ClosedStructure[] {
    return this._closings;
  }

  /** The structures of the board never scored, in the order of their first node (tiles by id, then areas). Read only. */
  openStructures(): OpenStructure[] {
    return this.board
      .structures()
      // A closed road or city not scored is one written closed (`write`, a story's `placed`), not one left open.
      .filter((s) => [CATEGORY_ROAD, CATEGORY_CITY, CATEGORY_FOREST, CATEGORY_WONDER].includes(s.category))
      .filter((s) => !this.scoredRoots.has(s.root) && (s.open > 0 || s.category === CATEGORY_FOREST))
      .map((s) => ({ category: CATEGORIES[s.category] as CategoryType, tiles: s.tiles, size: s.size }));
  }

  /**
   * Every structure closed on the board, in the order of its first node (tiles by id, then areas), with its areas: a road,
   * a city or a wonder with no open half-edge, a forest also once no road along it is open. For a board written as it
   * is (`write`: the chain's board when the moves are not replayed), where nothing was scored: a forest closed while a
   * road along it was open, never scored on chain, shows closed once that road closes. A played game reads its
   * `closings()` instead. Read only.
   */
  closedOnBoard(): ClosedAreas[] {
    return this.board
      .structures()
      .filter((s) => s.open === 0 && [CATEGORY_ROAD, CATEGORY_CITY, CATEGORY_FOREST, CATEGORY_WONDER].includes(s.category))
      .filter((s) => s.category !== CATEGORY_FOREST || !this.board.scan(s.tile, s.area).openRoad)
      .map((s) => ({
        category: CATEGORIES[s.category] as CategoryType,
        areas: s.category === CATEGORY_WONDER ? this.wonderAreas(s.tile) : this.board.areasOf(s.root),
      }));
  }

  /**
   * Each structure still open with its open half-edges, and for a forest the roads and cities along it (open or not):
   * what the Story search's estimate reads (`engine/beam.ts`). Read only.
   */
  openEdges(): { readonly category: CategoryType; readonly size: number; readonly open: number; readonly neighbours: number }[] {
    return this.board
      .structures()
      .filter((s) => [CATEGORY_ROAD, CATEGORY_CITY, CATEGORY_FOREST, CATEGORY_WONDER].includes(s.category))
      .filter((s) => !this.scoredRoots.has(s.root) && s.open > 0)
      .map((s) => ({
        category: CATEGORIES[s.category] as CategoryType,
        size: s.size,
        open: s.open,
        neighbours: s.category === CATEGORY_FOREST ? this.board.neighbours(s.tile, s.area) : 0,
      }));
  }

  get over(): boolean {
    return this._over;
  }
  get counts(): Counters {
    return { ...this.counters };
  }
  /** The tile in hand, `null` once the game is over by its last tile, or while a VRF game has not drawn it yet. */
  get hand(): { id: number; plan: PlanType } | null {
    return this.held && this.held.plan !== 0 ? { id: this.held.id, plan: PLANS[this.held.plan] as PlanType } : null;
  }

  /** A VRF game whose tile in hand is not drawn yet: no move until it is supplied. */
  get handPending(): boolean {
    return this.held !== null && this.held.plan === 0;
  }

  /** VRF games: the two tiles after the hand (fewer at the deck's end), `plan` null while not drawn. */
  get queue(): readonly QueuedTile[] {
    return this._queue.map((tile) => ({ id: tile.id, plan: tile.plan === 0 ? null : (PLANS[tile.plan] as PlanType) }));
  }

  /** Whether the next build or discard leaves a tile to draw (a VRF game: the tile `hand + 2` is within the limit). */
  get drawsNext(): boolean {
    return this.vrf && !this._over && this._tileCount + 3 <= this.tileLimit;
  }

  /**
   * Draws the first tile not drawn yet (the hand, then the queue, in id order) from `random`, as the
   * contract draws a move's tile from the VRF's random (`GameImpl::pick`). Returns its id and plan.
   */
  supply(random: bigint): { id: number; plan: PlanType } {
    const slot = this.firstPending();
    if (!slot) throw new EngineError("Engine: no tile to draw");
    slot.plan = this.pick(random);
    return { id: slot.id, plan: PLANS[slot.plan] as PlanType };
  }

  /**
   * The plan of the tile `id`, as a receipt's `Queued` names it, for a tile not drawn yet. The deck
   * bitmap is not touched: which card of that plan left the deck is not known (the session reads the
   * chain's). A tile already drawn must be named with its own plan.
   */
  supplyPlan(id: number, plan: PlanType): void {
    const slot = [this.held, ...this._queue].find((tile) => tile?.id === id);
    if (!slot) throw new EngineError(`Engine: tile ${id} is not in the hand or the queue`);
    const code = planCode(plan);
    if (slot.plan !== 0 && slot.plan !== code) throw new EngineError(`Engine: tile ${id} is ${PLANS[slot.plan]}, not ${plan}`);
    slot.plan = code;
  }

  private firstPending(): { id: number; plan: number } | undefined {
    return [this.held, ...this._queue].find((tile): tile is { id: number; plan: number } => tile !== null && tile.plan === 0);
  }

  /** `GameImpl::pick`: one card of the deck from `seed`, out of the bitmap (which empties with the deck's last card). */
  private pick(seed: bigint): number {
    const { card, remaining } = drawFromBitmap(seed, this.rules.total, this._tiles);
    this._tiles = remaining === 0 ? 0n : this._tiles | bit(card - 1);
    return planCode(this.rules.plan(card));
  }

  /** The spawn's fill (`GameImpl::advance` on a game with no queue): the hand and the next two from one random. */
  private fill(random: bigint): void {
    const hand = this._tileCount + 1;
    this.held = { id: hand, plan: this.pick(random) };
    this._queue = [];
    if (hand + 1 <= this.tileLimit) this._queue.push({ id: hand + 1, plan: this.pick(poseidon(random, 1)) });
    if (hand + 2 <= this.tileLimit) this._queue.push({ id: hand + 2, plan: this.pick(poseidon(random, 2)) });
    this._tileCount = hand;
  }

  /** A move's advance on a VRF game: the next tile comes into the hand, the tile two ahead is left to draw. */
  private advanceVrf(): void {
    const hand = this._tileCount + 1;
    const next = this._queue.shift();
    this.held = { id: hand, plan: next?.id === hand ? next.plan : 0 };
    if (hand + 2 <= this.tileLimit) this._queue.push({ id: hand + 2, plan: 0 });
    this._tileCount = hand;
  }
  /** The tiles known after the one in hand, in draw order (`lookahead` - 1 of them, fewer at the deck's end). */
  get coming(): { id: number; plan: PlanType }[] {
    return this.queued.map((t) => ({ id: t.id, plan: PLANS[t.plan] as PlanType }));
  }

  /** The placed tiles, in id order. */
  placed(): PlacedTile[] {
    return [...this.board.byId.values()]
      .sort((a, b) => a.id - b.id)
      .map((tile) => this.view(tile));
  }

  tileAt(x: number, y: number): PlacedTile | null {
    const tile = this.board.at(x, y);
    return tile ? this.view(tile) : null;
  }

  private view(tile: BoardTile): PlacedTile {
    return {
      id: tile.id,
      plan: PLANS[tile.plan] as PlanType,
      orientation: ORIENTATIONS[tile.orientation] as OrientationType,
      x: tile.x,
      y: tile.y,
      owner: tile.owner,
    };
  }

  /**
   * Replaces the plan of the tile in hand, as the golden harness and the gas scenarios overwrite
   * it (`Store::set_tile`). The draw is not touched. For tests and scripted boards.
   */
  force(plan: PlanType): void {
    if (!this.held) throw new EngineError("Builder: does not exist");
    // [Info] A VRF game's queue is not touched: it was drawn apart
    this.held.plan = planCode(plan);
  }

  /**
   * Writes a placed tile on the board without a move, as `Store::set_tile` does in the Cairo tests
   * (`placement::place_alone`): the tile joins the structure state, nothing is checked, assessed or
   * drawn, and the counters do not move. For tests and scripted boards; `id` must be unused.
   */
  write(tile: { id: number; plan: PlanType } & Placement, owner?: bigint): void {
    if (this.board.byId.has(tile.id) || this.held?.id === tile.id || this.board.at(tile.x, tile.y)) {
      throw new EngineError("Tile: already exists");
    }
    this.board.place({
      id: tile.id,
      plan: planCode(tile.plan),
      orientation: orientationCode(tile.orientation),
      x: tile.x,
      y: tile.y,
      owner: owner ?? this.player,
    });
  }

  /** The scripted placement of the tile in hand (Tutorial), `null` when it must be discarded. */
  scriptedPlacement(): Placement | null {
    if (this.deck !== "tutorial") return null;
    return this.rules.placement(mostSignificantBit(this._tiles));
  }

  /**
   * Why a placement of `plan` (the tile in hand by default) is refused, or `null` when it is
   * legal: the contract's rule, the territory mask when there is one (`Village.place`), `assert_not_exists` on the
   * position, then `assert_fits` (at least one side neighbour, and the same category on every facing edge).
   */
  refusal(placement: Placement, plan?: PlanType): string | null {
    let code: number;
    let orientation: number;
    try {
      code = plan ? planCode(plan) : (this.held?.plan ?? 0);
      orientation = orientationCode(placement.orientation);
    } catch (error) {
      return (error as Error).message;
    }
    if (code === 0) return "Builder: does not exist";
    if (this._territory && !this._territory.has(cellKey(placement))) return "Village: cell not owned";
    if (this.board.at(placement.x, placement.y)) return "Tile: already exists";
    let found = false;
    let fits = true;
    for (const direction of [NORTH, EAST, SOUTH, WEST]) {
      const [x, y] = toward(placement.x, placement.y, direction);
      const neighbor = this.board.at(x, y);
      if (!neighbor) continue;
      found = true;
      const mine = edgeCategory(code, orientation, direction);
      const theirs = edgeCategory(neighbor.plan, neighbor.orientation, opposite(direction));
      if (mine !== theirs) fits = false;
    }
    if (!found) return "Tile: no neighbors";
    if (!fits) return "Tile: cannot place";
    return null;
  }

  canPlace(placement: Placement, plan?: PlanType): boolean {
    return this.refusal(placement, plan) === null;
  }

  /** Every legal placement of `plan` (the tile in hand by default), by position then orientation. */
  legalPlacements(plan?: PlanType): Placement[] {
    const code = plan ? planCode(plan) : (this.held?.plan ?? 0);
    if (code === 0) return [];
    const seen = new Set<string>();
    const placements: Placement[] = [];
    const tiles = [...this.board.byId.values()].sort((a, b) => a.id - b.id);
    for (const tile of tiles) {
      for (const direction of [NORTH, EAST, SOUTH, WEST]) {
        const [x, y] = toward(tile.x, tile.y, direction);
        const key = `${x},${y}`;
        if (seen.has(key) || this.board.at(x, y)) continue;
        seen.add(key);
        if (this._territory && !this._territory.has(key)) continue;
        // The neighbours' facing edges, once per cell
        const facing: [number, number][] = [];
        for (const side of [NORTH, EAST, SOUTH, WEST]) {
          const [nx, ny] = toward(x, y, side);
          const neighbor = this.board.at(nx, ny);
          if (neighbor) facing.push([side, edgeCategory(neighbor.plan, neighbor.orientation, opposite(side))]);
        }
        for (let orientation = 1; orientation <= 4; orientation++) {
          if (facing.every(([side, category]) => edgeCategory(code, orientation, side) === category)) {
            placements.push({ orientation: ORIENTATIONS[orientation] as OrientationType, x, y });
          }
        }
      }
    }
    return placements;
  }

  /** The owned cells, in order (the territory mask), or `null` when the game has none. */
  territory(): Cell[] | null {
    return this._territory ? [...this._territory.values()].map((c) => ({ ...c })) : null;
  }

  /**
   * Why `Village.buy_parcel` refuses `cell`, or `null`: the territory's rule only (owned, a side neighbour owned, under
   * the cap, `maxCells`), in the contract's order. The level gate and the Cobbles are the chain's
   * (`parcelPrice`, `parcelLevel`).
   */
  parcelRefusal(cell: Cell): string | null {
    const owned = this._territory;
    if (!owned) return "Village: no village";
    if (owned.has(cellKey(cell))) return "Village: cell owned";
    const adjacent = [NORTH, EAST, SOUTH, WEST].some((d) => {
      const [x, y] = toward(cell.x, cell.y, d);
      return owned.has(cellKey({ x, y }));
    });
    if (!adjacent) return "Village: not adjacent";
    if (owned.size >= this.maxCells) return "Village: territory full";
    return null;
  }

  /** Adds `cell` to the territory as `Village.buy_parcel` does (its rule, `parcelRefusal`); returns the parcel's number. */
  buyParcel(cell: Cell): number {
    const refused = this.parcelRefusal(cell);
    if (refused) throw new EngineError(refused);
    const owned = this._territory as Map<string, Cell>;
    owned.set(cellKey(cell), { x: cell.x, y: cell.y });
    return owned.size - startTerritory().length;
  }

  /**
   * Places a given tile, as `Village.place` does (#640, forced placement): `plan` at `placement`, refused as `refusal`
   * rules it (the territory mask included), then built and assessed as a move. Village games only; nothing is drawn.
   */
  place(plan: PlanType, placement: Placement, owner?: bigint): MoveResult {
    if (this.deck !== "village") throw new EngineError("Engine: not a village");
    const refused = this.refusal(placement, plan);
    if (refused) throw new EngineError(refused);
    const tile = this.board.place({
      id: this._tileCount + 1,
      plan: planCode(plan),
      orientation: orientationCode(placement.orientation),
      x: placement.x,
      y: placement.y,
      owner: owner ?? this.player,
    });
    this._tileCount += 1;
    const before = this._score;
    const closings = this._closings.length;
    const scored = this.assess(tile);
    this._built += 1;
    return {
      action: "build",
      tileId: tile.id,
      plan,
      scored,
      closed: this._closings.slice(closings),
      points: this._score - before,
      score: this._score,
      over: false,
    };
  }

  /** Why `Village.demolish` refuses the tile at `cell`, or `null`: a village, a placed tile there, never the starter. */
  demolitionRefusal(cell: Cell): string | null {
    if (this.deck !== "village") return "Engine: not a village";
    const tile = this.board.at(cell.x, cell.y);
    if (!tile) return "Village: no tile";
    if (tile.id === 1) return "Village: starter stays";
    return null;
  }

  /**
   * Demolishes the tile at `cell`, as `Village.demolish` does (the owner's decision of 2026-10-21): the village is
   * rebuilt from the starter and the other placed tiles, replayed in their placement order and assessed as moves (their
   * edges matched when they were placed; a tile that lost its only neighbour is rebuilt all the same). Returns the score
   * after it. The price is the chain's (`demolitionPrice`).
   */
  demolish(cell: Cell): number {
    const refused = this.demolitionRefusal(cell);
    if (refused) throw new EngineError(refused);
    const gone = (this.board.at(cell.x, cell.y) as BoardTile).id;
    const kept = [...this.board.byId.values()].filter((t) => t.id !== 1 && t.id !== gone).sort((a, b) => a.id - b.id);
    const fresh = EngineGame.village({ player: this.player, territory: this.territory() ?? undefined, maxCells: this.maxCells });
    for (const tile of kept) fresh.rebuild(tile);
    Object.assign(this, fresh);
    return this._score;
  }

  /**
   * A village as the chain holds it (`Village.cells` and `Village.tiles`, #646): the territory, then every tile placed after
   * the starter, by id, rebuilt as a demolition's replay does (no neighbour check: each matched when it was placed, and one
   * may have lost its only neighbour to a demolition). Plan and orientation are the contracts' codes; the starter (id 1, at
   * (0, 0)) is the village's own and is skipped. The score is then `Village.village`'s.
   */
  static villageOf(config: {
    readonly territory: readonly Cell[];
    readonly tiles: readonly { readonly id: number; readonly plan: number; readonly orientation: number; readonly x: number; readonly y: number }[];
    readonly player?: bigint;
    readonly maxCells?: number;
  }): EngineGame {
    const game = EngineGame.village({ player: config.player, territory: config.territory, maxCells: config.maxCells });
    for (const tile of [...config.tiles].sort((a, b) => a.id - b.id)) {
      if (tile.id === 1) continue;
      planCode(PLANS[tile.plan] as PlanType);
      orientationCode(ORIENTATIONS[tile.orientation] as OrientationType);
      game.rebuild({ id: 0, plan: tile.plan, orientation: tile.orientation, x: tile.x, y: tile.y, owner: game.player } as BoardTile);
    }
    return game;
  }

  /** Builds a tile of a demolition's rebuild: the next id, no neighbour check, assessed as a move. */
  private rebuild(tile: BoardTile): void {
    const { plan, orientation, x, y, owner } = tile;
    const placed = this.board.place({ id: this._tileCount + 1, plan, orientation, x, y, owner });
    this._tileCount += 1;
    this.assess(placed);
    this._built += 1;
  }

  private assertPlaying(): { id: number; plan: number } {
    if (this._over) throw new EngineError("Game: is over");
    if (!this.held) throw new EngineError("Builder: does not exist");
    if (this.held.plan === 0) throw new EngineError("Engine: the tile in hand is not drawn yet");
    return this.held;
  }

  /**
   * Builds the tile in hand. A Tutorial game takes its scripted placement (a given placement must
   * equal it). `owner` is the tile's owner (D-19), the game's player by default.
   */
  build(placement?: Placement, owner?: bigint): MoveResult {
    const held = this.assertPlaying();
    let where = placement;
    if (this.deck === "tutorial") {
      const scripted = this.scriptedPlacement();
      if (!scripted) throw new EngineError("Orientation: not valid");
      if (
        where &&
        (where.orientation !== scripted.orientation || where.x !== scripted.x || where.y !== scripted.y)
      ) {
        throw new EngineError("Tutorial: not the scripted placement");
      }
      where = scripted;
    }
    if (!where) throw new EngineError("Orientation: not valid");
    const refused = this.refusal(where);
    if (refused) throw new EngineError(refused);

    // [Effect] Place the tile on the structure state
    const tile = this.board.place({
      id: held.id,
      plan: held.plan,
      orientation: orientationCode(where.orientation),
      x: where.x,
      y: where.y,
      owner: owner ?? this.player,
    });
    this.held = null;

    // [Effect] Assess game over, then draw a new tile if relevant (Challenge reseeds from the position)
    if (this.vrf) {
      this.assessOver();
      if (!this._over) this.advanceVrf();
    } else this.next(CENTER + tile.x, CENTER + tile.y);

    // [Effect] The assessment of the built tile
    const before = this._score;
    const closings = this._closings.length;
    const scored = this.assess(tile);
    this._built += 1;
    return {
      action: "build",
      tileId: tile.id,
      plan: PLANS[tile.plan] as PlanType,
      scored,
      closed: this._closings.slice(closings),
      points: this._score - before,
      score: this._score,
      over: this._over,
    };
  }

  /** Discards the tile in hand for `DISCARD_POINTS` (at most the score). */
  discard(): MoveResult {
    const held = this.assertPlaying();
    if (this.deck === "tutorial" && this.scriptedPlacement()) {
      throw new EngineError("Orientation: is valid");
    }
    const taken = Math.min(this._score, DISCARD_POINTS);
    this._score -= taken;
    this._discardPenalty += taken;
    this.held = null;
    if (this.vrf) {
      this.assessOver();
      if (!this._over) this.advanceVrf();
    } else {
      // [Info] The discarded tile was never placed: it lies at `CENTER` on chain
      this.next(CENTER, CENTER);
    }
    this._discarded += 1;
    this._discardedPlans.push(held.plan);
    return {
      action: "discard",
      tileId: held.id,
      plan: PLANS[held.plan] as PlanType,
      scored: [],
      closed: [],
      points: taken,
      score: this._score,
      over: this._over,
    };
  }

  /** Ends the game; the tile in hand stays in hand, as on chain. */
  surrender(): void {
    this.assertPlaying();
    this._over = true;
  }

  private assessOver(): void {
    this._over = this._tileCount >= this.tileLimit;
  }

  private reseed(x: number, y: number): void {
    this._seed = poseidon(this._seed, x, y);
  }

  /**
   * After a build or a discard (its position `x`, `y` in the chain's coordinates): with one tile known, the game is over
   * at the tile limit, else the seed takes the position (Simple) and the next tile is drawn; with a queue, the next tile
   * comes from it and the game is over once it is empty.
   */
  private next(x: number, y: number): void {
    if (this.lookahead > 1) {
      this.advance();
      this._over = this.held === null;
      return;
    }
    this.assessOver();
    if (this._over) return;
    if (this.deck === "simple") this.reseed(x, y);
    this.advance();
  }

  /** The tile in hand: the one drawn now, or with a queue, its first once it is topped up to `lookahead` tiles. */
  private advance(): void {
    if (this.lookahead === 1) {
      this.held = this.draw();
      return;
    }
    while (this.queued.length < this.lookahead && this._tileCount < this.tileLimit) this.queued.push(this.draw());
    this.held = this.queued.shift() ?? null;
  }

  /** `Game::draw_plan`: the next tile of the deck, its id the count of tiles drawn. */
  private draw(): { id: number; plan: number } {
    let plan: PlanType;
    if (this.deck === "story") {
      plan = this.sequence[this._tileCount - 1] as PlanType;
    } else if (this.deck === "tutorial") {
      const index = this._tiles === 0n ? 0 : 1 + mostSignificantBit(this._tiles);
      plan = this.rules.plan(index);
      this._tiles = this._tiles === 0n ? 1n : this._tiles | bit(index);
    } else {
      const { card, remaining } = drawFromBitmap(this._seed, this.rules.total, this._tiles);
      this._tiles = remaining === 0 ? 0n : this._tiles | bit(card - 1);
      plan = this.rules.plan(card);
    }
    this._tileCount += 1;
    if (this.deck !== "story") this._seed = poseidon(this._seed, this._tileCount);
    return { id: this._tileCount, plan: planCode(plan) };
  }

  /**
   * `Game::assess`: each start spot of the tile in `starts()` order, then the wonder of each
   * neighbour, N, E, S, W, NW, NE, SE, SW. A closed root scores once per move.
   */
  private assess(tile: BoardTile): Scored[] {
    const scored: Scored[] = [];
    const done = new Set<number>();
    const count = turns(tile.orientation);
    for (const start of planRow(tile.plan).starts) {
      const area = areaAt(tile.plan, tile.orientation, rotateSpot(start, count));
      const category = categoryOf(tile.plan, area);
      if (![CATEGORY_ROAD, CATEGORY_CITY, CATEGORY_WONDER, CATEGORY_FOREST].includes(category)) {
        continue;
      }
      const { root, record } = this.board.rootOf(tile, area);
      if (record.open !== 0 || done.has(root)) continue;
      done.add(root);
      if (category === CATEGORY_WONDER) {
        scored.push(this.scoreWonder(tile, root, tile.id));
      } else if (category === CATEGORY_FOREST) {
        const { openRoad, roads, cities } = this.board.scan(tile, area);
        if (openRoad) continue;
        const points = formula(roads + cities, FOREST_BASE_POINTS, record.size);
        scored.push(this.award(CATEGORY_FOREST, record.size, points, record.tiles, root, tile.id));
        this.counters.forests += 1;
      } else {
        const points = formula(record.size, basePoints(category), record.size);
        scored.push(this.award(category, record.size, points, record.tiles, root, tile.id));
        this.counters.structures += 1;
        if (record.size >= BIG_SIZE) this.counters.big += 1;
      }
    }
    for (const direction of [2, 4, 6, 8, 1, 3, 5, 7]) {
      const [x, y] = toward(tile.x, tile.y, direction);
      const neighbor = this.board.at(x, y);
      if (!neighbor) continue;
      const wonder = wonderArea(neighbor.plan);
      if (wonder === 0) continue;
      const { root, record } = this.board.rootOf(neighbor, wonder);
      if (record.open === 0 && !done.has(root)) {
        done.add(root);
        scored.push(this.scoreWonder(neighbor, root, tile.id));
      }
    }
    return scored;
  }

  /** A closed wonder: 900, size 0; its tiles are the wonder and the 8 around it (D-19 ruling 3). */
  private scoreWonder(wonder: BoardTile, root: number, closer: number): Scored {
    const tiles = new Set([wonder.id]);
    for (let direction = 1; direction <= 8; direction++) {
      const [x, y] = toward(wonder.x, wonder.y, direction);
      const neighbor = this.board.at(x, y);
      if (neighbor) tiles.add(neighbor.id);
    }
    this.counters.wonders += 1;
    return this.award(CATEGORY_WONDER, 0, WONDER_BASE_POINTS, tiles, root, closer, this.wonderAreas(wonder));
  }

  /** A wonder's areas as D-19 counts its tiles: the wonder's tile and each of the 8 around it, whole, in tile id order. */
  private wonderAreas(wonder: BoardTile): TileAreas[] {
    const ids = [wonder.id];
    for (let direction = 1; direction <= 8; direction++) {
      const [x, y] = toward(wonder.x, wonder.y, direction);
      const neighbor = this.board.at(x, y);
      if (neighbor) ids.push(neighbor.id);
    }
    return ids.sort((a, b) => a - b).map((tileId) => ({ tileId, areas: ALL_AREAS }));
  }

  /**
   * D-19: the points go to the owner with the most distinct tiles of the structure; on a tie,
   * nobody scores (`player` 0, 0 points). The event is emitted either way, and logged with its tiles and `closer`, the
   * tile whose move closed it.
   */
  private award(category: number, size: number, points: number, tiles: Set<number>, root: number, closer: number, areas = this.board.areasOf(root)): Scored {
    const counts = new Map<bigint, number>();
    for (const id of tiles) {
      const owner = (this.board.byId.get(id) as BoardTile).owner;
      counts.set(owner, (counts.get(owner) ?? 0) + 1);
    }
    let winner = 0n;
    let best = 0;
    let tie = false;
    for (const [owner, count] of counts) {
      if (count > best) {
        winner = owner;
        best = count;
        tie = false;
      } else if (count === best) {
        tie = true;
      }
    }
    const player = tie ? 0n : winner;
    const awarded = tie ? 0 : points;
    this._score += awarded;
    const scored: Scored = { category: CATEGORIES[category] as CategoryType, size, points: awarded, player };
    this._closings.push({ ...scored, tiles: tiles.size, tileId: closer, areas });
    this.scoredRoots.add(root);
    return scored;
  }
}
