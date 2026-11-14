import { CITY_BASE_POINTS, DECKS, DISCARD_POINTS, EngineGame, FOREST_BASE_POINTS, ROAD_BASE_POINTS, WONDER_BASE_POINTS, multiplier, type ClosedStructure, type Placement as EnginePlacement, type Scored as EngineScored } from "./engine";
import { poseidon } from "./engine/draw";
import { CategoryType } from "./types/category";
import { OrientationType } from "./types/orientation";
import { PlanType } from "./types/plan";

// The Masterpiece (the weekly individual event, the design proposal of 2026-11-09): one board for the whole week, twelve new tiles a
// day (the same twelve cards for every builder, each board drawing them in its own order), and only the largest closed structure of
// the season's kind counts. Every builder is ranked by percentile. The rules the client and the contracts will share: the calendar,
// the day's cards, the masterpiece and its score, the ranking's order and its tiers. Every figure is the proposal's, to be calibrated
// before the contracts. The client runs one Masterpiece every week (the owner's ask of 2026-11-10 for the weekly events: a new one
// starts when one ends), in place of the proposal's weeks 3 and 7 of a season; the four seasons' kinds come in turn, a week each.

/** A Masterpiece's week: Monday 00:00 UTC to the next. */
export const MASTERPIECE_WEEK_S = 7 * 86_400;
export const MASTERPIECE_DAY_S = 86_400;
/** The days of a week: twelve tiles each. */
export const MASTERPIECE_DAYS = 7;
/** The tiles a day brings. */
export const MASTERPIECE_DAILY = 12;
/** The tiles of a week: seven days' twelve. */
export const MASTERPIECE_TILES = MASTERPIECE_DAYS * MASTERPIECE_DAILY;
/** The smallest masterpiece the percentiles count: a crowd of empty boards cannot lower the bars. */
export const MASTERPIECE_FLOOR = 8;
/** The first Monday of the epoch (1970-01-05): the weeks count from it. */
const FIRST_MONDAY_S = 4 * 86_400;

/** The Masterpiece week of a time, in seconds since the epoch. */
export const masterpieceWeekOf = (seconds: number): number => Math.floor((seconds - FIRST_MONDAY_S) / MASTERPIECE_WEEK_S);
/** When a week starts (Monday 00:00 UTC): its board opens, its first twelve tiles wait. */
export const masterpieceWeekStart = (week: number): number => FIRST_MONDAY_S + week * MASTERPIECE_WEEK_S;
/** When a week ends (Sunday 24:00 UTC, the next week's start): its board freezes, its tier is claimed. */
export const masterpieceEndsAt = (week: number): number => masterpieceWeekStart(week + 1);
/** The day of a time in its week: 0 Monday to 6 Sunday. */
export const masterpieceDayOf = (seconds: number): number => Math.floor((seconds - masterpieceWeekStart(masterpieceWeekOf(seconds))) / MASTERPIECE_DAY_S);

export type MasterpieceSeason = "winter" | "spring" | "summer" | "autumn";
/** The structure a season counts: the city, the road, the crowned wonder, the forest. */
export type MasterpieceKind = "city" | "road" | "wonder" | "forest";
const SEASONS: readonly MasterpieceSeason[] = ["winter", "spring", "summer", "autumn"];
/** Every season's kind. */
export const MASTERPIECE_KINDS: Record<MasterpieceSeason, MasterpieceKind> = { winter: "city", spring: "road", summer: "wonder", autumn: "forest" };
/** The season whose kind a week plays: the four in turn (the client's weekly run; the proposal's is the calendar's season). */
export const masterpieceSeasonOf = (week: number): MasterpieceSeason => SEASONS[((week % 4) + 4) % 4]!;
export const masterpieceKindOf = (week: number): MasterpieceKind => MASTERPIECE_KINDS[masterpieceSeasonOf(week)];

const CATEGORY: Record<Exclude<MasterpieceKind, "wonder">, CategoryType> = { city: CategoryType.City, road: CategoryType.Road, forest: CategoryType.Forest };

/** A masterpiece: the closed structure of the week's kind that scores the most. `closing` is the place of the closing that made it. */
export interface MasterpiecePiece {
  kind: MasterpieceKind;
  /** The structure's size, the engine's (a crowned wonder: its nine tiles and the structure that crowns it). */
  size: number;
  /** The engine's own points for it (a crowned wonder: the wonder's and its crown's, added). */
  points: number;
  closing: number;
}

const better = (a: { points: number; size: number }, b: { points: number; size: number } | null): boolean => b === null || a.points > b.points || (a.points === b.points && a.size > b.size);

/**
 * The masterpiece among a board's closings (the engine's, in move order): the structure of `kind` with the most points, the larger at
 * equal points, the earlier at equal size. A crowned wonder is a completed wonder and the closed road, city or forest that scores the
 * most among those lying on one of its nine tiles, their points added (a wonder alone counts its nine tiles). Null: none closed yet.
 */
export function masterpieceOf(closings: readonly ClosedStructure[], kind: MasterpieceKind): MasterpiecePiece | null {
  let best: MasterpiecePiece | null = null;
  if (kind !== "wonder") {
    closings.forEach((c, closing) => {
      if (c.category === CATEGORY[kind] && better(c, best)) best = { kind, size: c.size, points: c.points, closing };
    });
    return best;
  }
  closings.forEach((wonder, at) => {
    if (wonder.category !== CategoryType.Wonder) return;
    const crown = crownOf(closings, wonder.areas?.map((a) => a.tileId) ?? []);
    const piece = { kind, size: wonder.tiles + (crown?.size ?? 0), points: wonder.points + (crown?.points ?? 0), closing: Math.max(at, crown?.closing ?? 0) };
    if (better(piece, best)) best = piece;
  });
  return best;
}

/** The crown of a wonder on `tiles`: the closed road, city or forest with an area on one of them that scores the most; null: none. */
function crownOf(closings: readonly ClosedStructure[], tiles: readonly number[]): { points: number; size: number; closing: number } | null {
  const on = new Set(tiles);
  let crown: { points: number; size: number; closing: number } | null = null;
  closings.forEach((c, closing) => {
    if (c.category !== CategoryType.Wonder && c.areas?.some((a) => on.has(a.tileId)) && better(c, crown)) crown = { points: c.points, size: c.size, closing };
  });
  return crown;
}

/** A board's score: its masterpiece's points, less 50 a discard (never under zero). No masterpiece: zero. */
export const masterpieceScore = (piece: MasterpiecePiece | null, discards: number): number => (piece ? Math.max(0, piece.points - discards * DISCARD_POINTS) : 0);

/** Whether the percentiles count a masterpiece: `MASTERPIECE_FLOOR` or more. */
export const masterpieceCounted = (piece: { size: number } | null): boolean => piece !== null && piece.size >= MASTERPIECE_FLOOR;

/**
 * What an open structure of `kind` would score if it closed now, by the engine's formula: a road or a city `size x base x 1.0235^size`,
 * a forest the roads and cities along it (`neighbours`) in place of its size, a wonder its flat 900.
 */
export function masterpieceWorth(kind: MasterpieceKind, size: number, neighbours = 0): number {
  if (kind === "wonder") return WONDER_BASE_POINTS;
  const [count, base] = kind === "forest" ? [neighbours, FOREST_BASE_POINTS] : [size, kind === "city" ? CITY_BASE_POINTS : ROAD_BASE_POINTS];
  return Number((BigInt(count) * BigInt(base) * BigInt(multiplier(size))) / 10_000n);
}

/** A reward tier: the best `share` of the week's counted masterpieces, and its Cobbles. The last one is every counted masterpiece below. */
export interface MasterpieceTier {
  id: "top1" | "top5" | "top20" | "top50" | "counted";
  name: string;
  share: number;
  cobbles: number;
}
export const MASTERPIECE_TIERS: readonly MasterpieceTier[] = [
  { id: "top1", name: "Top 1%", share: 0.01, cobbles: 300 },
  { id: "top5", name: "Top 5%", share: 0.05, cobbles: 150 },
  { id: "top20", name: "Top 20%", share: 0.2, cobbles: 60 },
  { id: "top50", name: "Top 50%", share: 0.5, cobbles: 20 },
  { id: "counted", name: "Counted", share: 1, cobbles: 5 },
];

/** The last place a tier holds among `counted` masterpieces: its share rounded up (the kinder side), one at least. */
export const masterpieceTierPlaces = (tier: MasterpieceTier, counted: number): number => (counted <= 0 ? 0 : Math.max(1, Math.ceil(counted * tier.share)));

/** The tier of `place` (1 first) among `counted` masterpieces; null outside them (a masterpiece under the floor has no place). */
export function masterpieceTierOf(place: number | null, counted: number): MasterpieceTier | null {
  if (place === null || place < 1 || place > counted) return null;
  return MASTERPIECE_TIERS.find((t) => place <= masterpieceTierPlaces(t, counted)) ?? null;
}

/** One builder's masterpiece in the week's ranking: its score, its size, and when it was closed (seconds). */
export interface MasterpieceResult {
  score: number;
  size: number;
  at: number;
}

/** The ranking's order, negative when `a` ranks above `b`: the score, then the size, then the earlier closing. */
export const compareMasterpiece = (a: MasterpieceResult, b: MasterpieceResult): number => b.score - a.score || b.size - a.size || a.at - b.at;

/** The place a result would take among `others` (the builder's own left out): one more than the results ranked above it. */
export const masterpiecePlaceAmong = (result: MasterpieceResult, others: readonly MasterpieceResult[]): number => 1 + others.filter((o) => compareMasterpiece(o, result) < 0).length;

/** The score that holds each tier's last place, from the week's counted scores (any order); null where no masterpiece is counted. */
export function masterpieceBars(scores: readonly number[]): { tier: MasterpieceTier; from: number | null }[] {
  const sorted = [...scores].sort((a, b) => b - a);
  return MASTERPIECE_TIERS.map((tier) => ({ tier, from: sorted[masterpieceTierPlaces(tier, sorted.length) - 1] ?? null }));
}

const DAY_SALT = 0x4d5044415953n; // 'MPDAYS'
const ORDER_SALT = 0x4d504f52444552n; // 'MPORDER'

/** A small generator in [0, 1) from felts (mulberry32 on their Poseidon's low word): the day's cards and a board's order. */
function generator(...felts: bigint[]): () => number {
  let a = Number(poseidon(...felts) & 0xffffffffn);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const PLAN_ORDER = Object.values(PlanType);

/**
 * A day's cards: the twelve every builder plays that day, public once the day opens, in plan order. Twelve cards of the base deck
 * (its 72 less the starter's) kept by the day's seed. On chain the seed is the VRF's; here, Poseidon on the week and the day.
 */
export function masterpieceCards(week: number, day: number): PlanType[] {
  const rules = DECKS.simple;
  const deck: PlanType[] = [];
  for (let index = 1; index <= rules.total; index++) if (index !== rules.starter + 1) deck.push(rules.plan(index));
  return shuffled(deck, generator(DAY_SALT, BigInt(week), BigInt(day)))
    .slice(0, MASTERPIECE_DAILY)
    .sort((a, b) => PLAN_ORDER.indexOf(a) - PLAN_ORDER.indexOf(b));
}

/**
 * The order a board draws the week's tiles in, from its own seed: each day's twelve in an order of its own, the days in order (a
 * missed day's tiles wait, in day order). On chain a day at a time by the VRF; here, the whole week's at once.
 */
export function masterpieceOrder(week: number, seed: bigint): PlanType[] {
  return Array.from({ length: MASTERPIECE_DAYS }, (_, day) => shuffled(masterpieceCards(week, day), generator(ORDER_SALT, seed, BigInt(day)))).flat();
}

/** One entry of a board's log: the tile in hand laid, or discarded. Coordinates relative to the starter. */
export type MasterpieceEntry = { k: "build"; o: number; x: number; y: number } | { k: "discard" };

/** What a move did: the engine's closings, the board's masterpiece after it, whether the move made it, the points it moved the score by. */
export interface MasterpieceMove {
  tileId: number;
  scored: readonly EngineScored[];
  closed: readonly ClosedStructure[];
  piece: MasterpiecePiece | null;
  improved: boolean;
  points: number;
}

/** The open structure of the week's kind worth the most if it closed now: what the builder is growing. */
export interface MasterpieceProspect {
  size: number;
  /** Its open edges: each one a tile still to lay. */
  open: number;
  worth: number;
}

const ORIENTATIONS = Object.values(OrientationType);

/**
 * A week's board on the engine: a village's game with no territory (tiles given one by one, no deck), the week's 84 tiles in the
 * board's own order, one in hand at a time. The day rules what may be played: `waiting(day)` counts the tiles open and not played.
 * Pure: everything follows from the week, the seed and the log.
 */
export class Masterpiece {
  readonly kind: MasterpieceKind;
  readonly order: readonly PlanType[];
  private engine: EngineGame;
  private _played = 0;

  /** `order`: a scripted draw in place of the seed's (tests and stories; a short one is the whole week). */
  constructor(
    readonly week: number,
    readonly seed: bigint,
    order?: readonly PlanType[],
  ) {
    this.kind = masterpieceKindOf(week);
    this.order = order ?? masterpieceOrder(week, seed);
    this.engine = EngineGame.start({ deck: "village", seed: 0n });
  }

  /** The board of `week` and `seed` with `log` played again, in order. Throws when an entry is not legal. */
  static replay(week: number, seed: bigint, log: readonly MasterpieceEntry[], order?: readonly PlanType[]): Masterpiece {
    const board = new Masterpiece(week, seed, order);
    for (const entry of log) board.apply(entry);
    return board;
  }

  clone(): Masterpiece {
    const copy = Object.create(Masterpiece.prototype) as Masterpiece;
    Object.assign(copy, this);
    copy.engine = this.engine.clone();
    return copy;
  }

  /** The engine's game, read only: its tiles and its closings. */
  get rules(): EngineGame {
    return this.engine;
  }
  /** The tiles played, laid or discarded. */
  get played(): number {
    return this._played;
  }
  get laid(): number {
    return this.engine.built;
  }
  get discards(): number {
    return this.engine.discarded;
  }
  /** The tiles open by `day` (0 Monday to 6 Sunday): twelve a day since Monday. */
  opened(day: number): number {
    return Math.min(this.order.length, (Math.max(-1, Math.min(day, MASTERPIECE_DAYS - 1)) + 1) * MASTERPIECE_DAILY);
  }
  /** The tiles open on `day` and not played yet: they wait, in day order. */
  waiting(day: number): number {
    return Math.max(0, this.opened(day) - this._played);
  }
  /** The tiles the days after `day` bring. */
  toCome(day: number): number {
    return this.order.length - this.opened(day);
  }
  /** The next tile of the board's order; null once the week's tiles are played. Whether it may be played is the day's (`waiting`). */
  get next(): PlanType | null {
    return this.order[this._played] ?? null;
  }
  /** Each day's tiles played, Monday first. */
  days(): number[] {
    return Array.from({ length: MASTERPIECE_DAYS }, (_, day) => Math.max(0, Math.min(MASTERPIECE_DAILY, this._played - day * MASTERPIECE_DAILY)));
  }

  /** The board's masterpiece; null: no structure of the kind closed yet. */
  piece(): MasterpiecePiece | null {
    return masterpieceOf(this.engine.closings(), this.kind);
  }
  get score(): number {
    return masterpieceScore(this.piece(), this.discards);
  }
  /** The open structure of the kind worth the most if it closed now; null: none open. */
  prospect(): MasterpieceProspect | null {
    // A wonder: its nine tiles and the best structure already closed on those laid, crowned as `masterpieceOf` crowns a completed one.
    const closings = this.kind === "wonder" ? this.engine.closings() : [];
    const found =
      this.kind === "wonder"
        ? this.engine.openWonders().map((w) => {
            const crown = crownOf(closings, w.tiles);
            return { size: 9 + (crown?.size ?? 0), open: w.open, worth: WONDER_BASE_POINTS + (crown?.points ?? 0) };
          })
        : this.engine
            .openEdges()
            .filter((s) => s.category === CATEGORY[this.kind as Exclude<MasterpieceKind, "wonder">])
            .map((s) => ({ size: s.size, open: s.open, worth: masterpieceWorth(this.kind, s.size, s.neighbours) }));
    let best: MasterpieceProspect | null = null;
    for (const f of found) if (best === null || f.worth > best.worth || (f.worth === best.worth && f.size > best.size)) best = f;
    return best;
  }

  /** Why laying the next tile at `placement` is refused, or null: the engine's rule (a free cell, a neighbour, matching edges). */
  refusal(placement: EnginePlacement): string | null {
    const plan = this.next;
    return plan ? this.engine.refusal(placement, plan) : "Masterpiece: no tile left";
  }

  /** Every legal placement of the next tile, by position then orientation. */
  legalPlacements(): EnginePlacement[] {
    const plan = this.next;
    return plan ? this.engine.legalPlacements(plan) : [];
  }

  private moved(before: { score: number; piece: MasterpiecePiece | null }, result: { tileId: number; scored: readonly EngineScored[]; closed: readonly ClosedStructure[] }): MasterpieceMove {
    this._played += 1;
    const piece = this.piece();
    const improved = piece !== null && (before.piece === null || piece.points !== before.piece.points || piece.size !== before.piece.size);
    return { tileId: result.tileId, scored: result.scored, closed: result.closed, piece, improved, points: this.score - before.score };
  }

  /** Lays the next tile. */
  build(placement: EnginePlacement): MasterpieceMove {
    const plan = this.next;
    if (!plan) throw new Error("Masterpiece: no tile left");
    const before = { score: this.score, piece: this.piece() };
    return this.moved(before, this.engine.place(plan, placement));
  }

  /** Discards the next tile: 50 points off the masterpiece's. A discard never brings another card. */
  discard(): MasterpieceMove {
    const plan = this.next;
    if (!plan) throw new Error("Masterpiece: no tile left");
    const before = { score: this.score, piece: this.piece() };
    return this.moved(before, { tileId: this.engine.discardPlan(plan).tileId, scored: [], closed: [] });
  }

  apply(entry: MasterpieceEntry): MasterpieceMove {
    if (entry.k === "discard") return this.discard();
    const orientation = ORIENTATIONS[entry.o];
    if (!orientation || orientation === OrientationType.None) throw new Error("Orientation: not valid");
    return this.build({ orientation, x: entry.x, y: entry.y });
  }
}
