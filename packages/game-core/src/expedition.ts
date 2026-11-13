import { DECKS, EngineGame, PREPLACED_ID, type ClosedStructure, type Placement as EnginePlacement, type Scored as EngineScored } from "./engine";
import { poseidon } from "./engine/draw";
import type { Cell } from "./engine/village";
import { CategoryType } from "./types/category";
import { OrientationType } from "./types/orientation";
import { PlanType } from "./types/plan";

// The Expedition (the weekly individual event, the design proposal of 2026-11-09): one board for the whole week, six tiles a day held
// up to twelve, four landmarks to reach on one map, four score tiers and no ranking. The rules the client and the contracts will
// share: the calendar, the ration, the map and its trail, the objectives, the score and the tiers. Every figure is the proposal's, to
// be calibrated before the contracts. The client runs one expedition every week (the owner's ask of 2026-11-10 for the weekly events:
// a new one starts when one ends), in place of the proposal's first week of a season; the four seasons' maps come in turn, a week each.

/** An expedition's week: Monday 00:00 UTC to the next. */
export const EXPEDITION_WEEK_S = 7 * 86_400;
export const EXPEDITION_DAY_S = 86_400;
/** The days of a week: a ration each. */
export const EXPEDITION_DAYS = 7;
/** The first Monday of the epoch (1970-01-05): the weeks count from it. */
const FIRST_MONDAY_S = 4 * 86_400;

/** The tiles a day brings. */
export const EXPEDITION_RATION = 6;
/** The most tiles a hand holds: a ration that does not fit is lost. */
export const EXPEDITION_HAND = 12;
/** The cards of a week's bag: seven rations. */
export const EXPEDITION_BAG = EXPEDITION_DAYS * EXPEDITION_RATION;
/** The level the claim asks (no farming accounts). */
export const EXPEDITION_LEVEL = 3;

/** The expedition week of a time, in seconds since the epoch. */
export const expeditionWeekOf = (seconds: number): number => Math.floor((seconds - FIRST_MONDAY_S) / EXPEDITION_WEEK_S);
/** When a week starts (Monday 00:00 UTC): its board opens. */
export const expeditionWeekStart = (week: number): number => FIRST_MONDAY_S + week * EXPEDITION_WEEK_S;
/** When a week ends (Sunday 24:00 UTC, the next week's start): its board takes no more tile, its tier is claimed. */
export const expeditionEndsAt = (week: number): number => expeditionWeekStart(week + 1);
/** The day of a time in its week: 0 Monday to 6 Sunday. */
export const expeditionDayOf = (seconds: number): number => Math.floor((seconds - expeditionWeekStart(expeditionWeekOf(seconds))) / EXPEDITION_DAY_S);

/** A score tier: the highest one reached pays its Cobbles. No XP, no chest. */
export interface ExpeditionTier {
  id: "scout" | "pathfinder" | "explorer" | "cartographer";
  name: string;
  score: number;
  cobbles: number;
}
export const EXPEDITION_TIERS: readonly ExpeditionTier[] = [
  { id: "scout", name: "Scout", score: 4_000, cobbles: 20 },
  { id: "pathfinder", name: "Pathfinder", score: 6_000, cobbles: 40 },
  { id: "explorer", name: "Explorer", score: 8_000, cobbles: 70 },
  { id: "cartographer", name: "Cartographer", score: 10_000, cobbles: 100 },
];
/** The highest tier a score reaches; null under the first. */
export const expeditionTierOf = (score: number): ExpeditionTier | null => [...EXPEDITION_TIERS].reverse().find((t) => score >= t.score) ?? null;
/** The tier above a score; null at the last. */
export const expeditionNextTier = (score: number): ExpeditionTier | null => EXPEDITION_TIERS.find((t) => score < t.score) ?? null;

export type ExpeditionSeason = "winter" | "spring" | "summer" | "autumn";
const SEASONS: readonly ExpeditionSeason[] = ["winter", "spring", "summer", "autumn"];
/** The season whose map a week plays: the four in turn (the client's weekly run; the proposal's is the calendar's season). */
export const expeditionSeasonOf = (week: number): ExpeditionSeason => SEASONS[((week % 4) + 4) % 4]!;

/** The map's size: 11 by 12 cells, the camp at (0, 0); a cell outside takes no tile, a structure facing it stays open. */
export const EXPEDITION_BOUNDS = { minX: -5, maxX: 5, minY: -4, maxY: 7 } as const;
/** The map's cells, rows from the south, west to east (the engine's territory mask). */
export function expeditionCells(): Cell[] {
  const cells: Cell[] = [];
  for (let y = EXPEDITION_BOUNDS.minY; y <= EXPEDITION_BOUNDS.maxY; y++) for (let x = EXPEDITION_BOUNDS.minX; x <= EXPEDITION_BOUNDS.maxX; x++) cells.push({ x, y });
  return cells;
}

/** A tile written on the map at the start. */
export interface ExpeditionTile {
  plan: PlanType;
  orientation: OrientationType;
  x: number;
  y: number;
}

/** A landmark's place: its tiles, written at the start. It anchors nothing until the trail touches one of them. */
export interface ExpeditionSite {
  id: string;
  name: string;
  tiles: readonly ExpeditionTile[];
}

export type ExpeditionObjectiveId = "crossroads" | "ruin" | "villages" | "landmark";

/**
 * An objective: `reach`, a tile laid against its site; `surround`, the 8 cells around its site's tile laid; `close`, one structure of
 * `category` closed through every tile of its sites. Its bonus is added once, when it is done, beside the structure's own points.
 */
export interface ExpeditionObjective {
  id: ExpeditionObjectiveId;
  title: string;
  bonus: number;
  kind: "reach" | "surround" | "close";
  sites: readonly string[];
  category?: CategoryType;
}

/** A week's map: its landmarks, its four objectives, and the cards its bag always holds (what its objectives need). */
export interface ExpeditionMap {
  season: ExpeditionSeason;
  name: string;
  sites: readonly ExpeditionSite[];
  objectives: readonly ExpeditionObjective[];
  needs: readonly PlanType[];
}

const { North, East, West } = OrientationType;
const tile = (plan: PlanType, orientation: OrientationType, x: number, y: number): ExpeditionTile => ({ plan, orientation, x, y });
const times = (count: number, plan: PlanType): PlanType[] => Array.from({ length: count }, () => plan);
const STRAIGHT = PlanType.RFFFRFFFR;

/** Every map's near landmarks: a village three cells to each side of the camp on its road, the ruin south-west, the crossroads south-east. */
const NEAR_SITES: readonly ExpeditionSite[] = [
  { id: "village-west", name: "West village", tiles: [tile(PlanType.SFRFRFFFR, North, -3, 0)] },
  { id: "village-east", name: "East village", tiles: [tile(PlanType.SFRFRFFFR, North, 3, 0)] },
  { id: "ruin", name: "Ruin", tiles: [tile(PlanType.WFFFFFFFF, North, -2, -3)] },
  { id: "crossroads", name: "Old crossroads", tiles: [tile(PlanType.SFRFRFRFR, North, 3, -3)] },
];
const NEAR_OBJECTIVES: readonly ExpeditionObjective[] = [
  { id: "crossroads", title: "Reach the old crossroads", bonus: 300, kind: "reach", sites: ["crossroads"] },
  { id: "ruin", title: "Surround the ruin", bonus: 600, kind: "surround", sites: ["ruin"] },
  { id: "villages", title: "Link the two villages", bonus: 900, kind: "close", sites: ["village-west", "village-east"], category: CategoryType.Road },
];
/** The four straight roads that link the villages through the camp. */
const NEAR_NEEDS = times(4, STRAIGHT);
const LANDMARK_BONUS = 1_500;

function mapOf(season: ExpeditionSeason, name: string, site: ExpeditionSite, objective: Omit<ExpeditionObjective, "id" | "bonus" | "sites">, needs: PlanType[]): ExpeditionMap {
  return {
    season,
    name,
    sites: [...NEAR_SITES, site],
    objectives: [...NEAR_OBJECTIVES, { ...objective, id: "landmark", bonus: LANDMARK_BONUS, sites: [site.id] }],
    needs: [...NEAR_NEEDS, ...needs],
  };
}

/**
 * The seasons' maps, one each (the proposal draws one of four hand-made layouts per season): the season's landmark is of its kind and
 * the farthest from the camp. Winter, the ruined citadel: an open city of two tiles, five open edges. Spring, the old road: two
 * waystones and two straight remnants in a line of nine. Summer, the great wonder. Autumn, the sacred wood: the grove between its
 * gate and one remnant of its ring road, six ring cells to lay.
 */
export const EXPEDITION_MAPS: Record<ExpeditionSeason, ExpeditionMap> = {
  winter: mapOf(
    "winter",
    "The Ruined Citadel",
    { id: "citadel", name: "Ruined citadel", tiles: [tile(PlanType.CCCCCCCCC, North, 0, 6), tile(PlanType.CCCCCFFFC, North, 0, 5)] },
    { title: "Close the ruined citadel", kind: "close", category: CategoryType.City },
    times(5, PlanType.FFFFFFCFF),
  ),
  spring: mapOf(
    "spring",
    "The Old Road",
    {
      id: "old-road",
      name: "Old road",
      tiles: [tile(PlanType.SFRFRFFFR, East, -4, 6), tile(STRAIGHT, North, -1, 6), tile(STRAIGHT, North, 2, 6), tile(PlanType.SFRFRFFFR, West, 4, 6)],
    },
    { title: "Open the old road", kind: "close", category: CategoryType.Road },
    [...times(3, STRAIGHT), ...times(2, PlanType.RFFFRFCFR)],
  ),
  summer: mapOf(
    "summer",
    "The Great Wonder",
    { id: "great-wonder", name: "Great wonder", tiles: [tile(PlanType.WFFFFFFFF, North, 0, 6)] },
    { title: "Surround the great wonder", kind: "surround" },
    [],
  ),
  autumn: mapOf(
    "autumn",
    "The Sacred Wood",
    { id: "sacred-wood", name: "Sacred wood", tiles: [tile(STRAIGHT, North, 0, 7), tile(PlanType.WFFFFFFFF, North, 0, 6), tile(STRAIGHT, North, 0, 5)] },
    { title: "Close the sacred wood", kind: "close", category: CategoryType.Forest },
    [...times(2, STRAIGHT), ...times(4, PlanType.RFRFFFFFR)],
  ),
};

const WEEK_SALT = 0x45585045444954n; // 'EXPEDIT'
const ORDER_SALT = 0x45584f52444552n; // 'EXORDER'

/** A small generator in [0, 1) from a felt (mulberry32 on its Poseidon's low word): the bag's and the order's shuffles. */
function generator(salt: bigint, seed: bigint): () => number {
  let a = Number(poseidon(salt, seed) & 0xffffffffn);
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
 * A week's bag: the 42 cards every explorer draws, public. The cards the map's objectives need, then cards of the base deck (its 72
 * less the camp's) kept by the week's seed, in plan order. On chain the seed is the VRF's; here, Poseidon on the week.
 */
export function expeditionBag(week: number): PlanType[] {
  const map = EXPEDITION_MAPS[expeditionSeasonOf(week)];
  const rules = DECKS.simple;
  const deck: PlanType[] = [];
  for (let index = 1; index <= rules.total; index++) if (index !== rules.starter + 1) deck.push(rules.plan(index));
  for (const plan of map.needs) deck.splice(deck.indexOf(plan), 1);
  const rest = shuffled(deck, generator(WEEK_SALT, BigInt(week))).slice(0, EXPEDITION_BAG - map.needs.length);
  return [...map.needs, ...rest].sort((a, b) => PLAN_ORDER.indexOf(a) - PLAN_ORDER.indexOf(b));
}

/** The order a board draws the week's bag in, from its own seed (on chain a day at a time by the VRF; here, the whole week's at once). */
export function expeditionOrder(week: number, seed: bigint): PlanType[] {
  return shuffled(expeditionBag(week), generator(ORDER_SALT, seed));
}

/** A tile of the hand: `card` is its place in the board's draw order, its name in a move. */
export interface ExpeditionCard {
  card: number;
  plan: PlanType;
}

/** One entry of a board's log: the day's draw, a tile of the hand laid, or one discarded. Coordinates relative to the camp. */
export type ExpeditionEntry = { k: "draw"; day: number } | { k: "build"; card: number; o: number; x: number; y: number } | { k: "discard"; card: number };

/** What a day did, for the journal. */
export interface ExpeditionDay {
  drawn: number;
  lost: number;
  laid: number;
  discarded: number;
}

/** An objective as the board stands: done or not, and for a ruin or a wonder the cells laid around it. */
export interface ExpeditionProgress extends ExpeditionObjective {
  done: boolean;
  count?: number;
  of?: number;
}

/** What a move did: the engine's closings, the objectives it completed, the points it added (their bonuses included; a discard takes some). */
export interface ExpeditionMove {
  tileId: number;
  scored: readonly EngineScored[];
  closed: readonly ClosedStructure[];
  objectives: readonly ExpeditionObjective[];
  points: number;
}

const ORIENTATIONS = Object.values(OrientationType);
const SIDES: readonly [number, number][] = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];
const AROUND: readonly [number, number][] = [...SIDES, [1, 1], [1, -1], [-1, -1], [-1, 1]];

/**
 * A week's board on the engine: a village's game (tiles given one by one, the map's cells as its territory) with the camp as its
 * starter and the landmarks written at the start. A tile is laid next to the trail (the camp, a tile laid, a landmark reached) and
 * must match every tile it touches, a landmark not yet reached included. Pure: everything follows from the week, the seed and the log.
 */
export class Expedition {
  readonly map: ExpeditionMap;
  readonly order: readonly PlanType[];
  private engine: EngineGame;
  private _hand: ExpeditionCard[] = [];
  private pointer = 0;
  private _lastDay = -1;
  private _bonus = 0;
  private reached = new Set<string>();
  private _done: ExpeditionObjectiveId[] = [];
  private _days: ExpeditionDay[] = Array.from({ length: EXPEDITION_DAYS }, () => ({ drawn: 0, lost: 0, laid: 0, discarded: 0 }));
  /** The site of each written tile, by its engine id. */
  private readonly siteOf = new Map<number, string>();

  /** `order`: a scripted draw in place of the seed's (tests and stories; a short one is the whole bag). */
  constructor(
    readonly week: number,
    readonly seed: bigint,
    order?: readonly PlanType[],
  ) {
    this.map = EXPEDITION_MAPS[expeditionSeasonOf(week)];
    this.order = order ?? expeditionOrder(week, seed);
    this.engine = EngineGame.village({ territory: expeditionCells() });
    let id = PREPLACED_ID;
    for (const site of this.map.sites) {
      for (const t of site.tiles) {
        this.engine.write({ ...t, id });
        this.siteOf.set(id++, site.id);
      }
    }
  }

  /** The board of `week` and `seed` with `log` played again, in order. Throws when an entry is not legal. */
  static replay(week: number, seed: bigint, log: readonly ExpeditionEntry[], order?: readonly PlanType[]): Expedition {
    const board = new Expedition(week, seed, order);
    for (const entry of log) board.apply(entry);
    return board;
  }

  clone(): Expedition {
    const copy = Object.create(Expedition.prototype) as Expedition;
    Object.assign(copy, this);
    copy.engine = this.engine.clone();
    copy._hand = [...this._hand];
    copy.reached = new Set(this.reached);
    copy._done = [...this._done];
    copy._days = this._days.map((d) => ({ ...d }));
    return copy;
  }

  /** The engine's game, read only: its tiles and its closings. */
  get rules(): EngineGame {
    return this.engine;
  }
  get hand(): readonly ExpeditionCard[] {
    return this._hand;
  }
  /** The last day drawn, 0 Monday to 6 Sunday; -1 before the first draw. */
  get lastDay(): number {
    return this._lastDay;
  }
  /** The cards of the bag still to come (those a full hand lost are gone). */
  get toCome(): number {
    return Math.max(0, this.order.length - this.pointer);
  }
  /** The board's own points: every structure closed, less the discards. */
  get boardScore(): number {
    return this.engine.score;
  }
  /** The bonuses of the objectives done. */
  get bonus(): number {
    return this._bonus;
  }
  get score(): number {
    return this.engine.score + this._bonus;
  }
  get laid(): number {
    return this.engine.built;
  }
  get days(): readonly ExpeditionDay[] {
    return this._days;
  }
  get done(): readonly ExpeditionObjectiveId[] {
    return this._done;
  }

  /** The rations a draw on `day` would bring: those due since the last draw, what fits the hand, what is lost. */
  due(day: number): { drawn: number; lost: number } {
    if (day <= this._lastDay) return { drawn: 0, lost: 0 };
    const due = Math.min((Math.min(day, EXPEDITION_DAYS - 1) - this._lastDay) * EXPEDITION_RATION, this.toCome);
    const drawn = Math.min(due, EXPEDITION_HAND - this._hand.length);
    return { drawn, lost: due - drawn };
  }

  /** The day's draw (a lazy counter): the rations due since the last day drawn come in, up to 12 in hand; the rest is lost. */
  draw(day: number): { drawn: number; lost: number } {
    if (!Number.isInteger(day) || day < 0 || day >= EXPEDITION_DAYS) throw new Error("Expedition: invalid day");
    const { drawn, lost } = this.due(day);
    for (let i = 0; i < drawn; i++) this._hand.push({ card: this.pointer + i, plan: this.order[this.pointer + i]! });
    this.pointer += drawn + lost;
    if (day > this._lastDay) this._lastDay = day;
    const today = this._days[day]!;
    today.drawn += drawn;
    today.lost += lost;
    return { drawn, lost };
  }

  private held(card: number): ExpeditionCard {
    const held = this._hand.find((c) => c.card === card);
    if (!held) throw new Error("Expedition: not in hand");
    return held;
  }

  private onTrail(id: number): boolean {
    const site = this.siteOf.get(id);
    return site === undefined || this.reached.has(site);
  }

  /** Why laying `plan` at `placement` is refused, or null: the engine's rule (the map's edge, a free cell, matching edges), then the trail's. */
  refusal(plan: PlanType, placement: EnginePlacement): string | null {
    const refused = this.engine.refusal(placement, plan);
    if (refused) return refused;
    const trail = SIDES.some(([dx, dy]) => {
      const neighbour = this.engine.tileAt(placement.x + dx, placement.y + dy);
      return neighbour !== null && this.onTrail(neighbour.id);
    });
    return trail ? null : "Expedition: not on the trail";
  }

  /** Every legal placement of `plan`, by position then orientation. */
  legalPlacements(plan: PlanType): EnginePlacement[] {
    return this.engine.legalPlacements(plan).filter((p) => this.refusal(plan, p) === null);
  }

  /** Lays the tile `card` of the hand. */
  build(card: number, placement: EnginePlacement): ExpeditionMove {
    const held = this.held(card);
    const refused = this.refusal(held.plan, placement);
    if (refused) throw new Error(refused);
    const before = this.score;
    const result = this.engine.place(held.plan, placement);
    this._hand = this._hand.filter((c) => c.card !== card);
    for (const [dx, dy] of SIDES) {
      const neighbour = this.engine.tileAt(placement.x + dx, placement.y + dy);
      const site = neighbour && this.siteOf.get(neighbour.id);
      if (site) this.reached.add(site);
    }
    const objectives = this.assess();
    if (this._lastDay >= 0) this._days[this._lastDay]!.laid += 1;
    return { tileId: result.tileId, scored: result.scored, closed: result.closed, objectives, points: this.score - before };
  }

  /** Discards the tile `card` of the hand for the engine's 50 points (at most the board's score). */
  discard(card: number): ExpeditionMove {
    const held = this.held(card);
    const result = this.engine.discardPlan(held.plan);
    this._hand = this._hand.filter((c) => c.card !== card);
    if (this._lastDay >= 0) this._days[this._lastDay]!.discarded += 1;
    return { tileId: result.tileId, scored: [], closed: [], objectives: [], points: -result.points };
  }

  apply(entry: ExpeditionEntry): ExpeditionMove | null {
    if (entry.k === "draw") {
      this.draw(entry.day);
      return null;
    }
    if (entry.k === "discard") return this.discard(entry.card);
    const orientation = ORIENTATIONS[entry.o];
    if (!orientation || orientation === OrientationType.None) throw new Error("Orientation: not valid");
    return this.build(entry.card, { orientation, x: entry.x, y: entry.y });
  }

  private tilesOf(siteId: string): { id: number; x: number; y: number }[] {
    return this.engine.placed().filter((t) => this.siteOf.get(t.id) === siteId);
  }

  private around(siteId: string): number {
    const [centre] = this.tilesOf(siteId);
    return centre ? AROUND.filter(([dx, dy]) => this.engine.tileAt(centre.x + dx, centre.y + dy) !== null).length : 0;
  }

  private isDone(objective: ExpeditionObjective): boolean {
    if (objective.kind === "reach") return objective.sites.every((s) => this.reached.has(s));
    if (objective.kind === "surround") return objective.sites.every((s) => this.around(s) === AROUND.length);
    const ids = objective.sites.flatMap((s) => this.tilesOf(s).map((t) => t.id));
    return this.engine.closings().some((c) => c.category === objective.category && ids.every((id) => c.areas?.some((a) => a.tileId === id)));
  }

  /** The objectives the last move completed: each bonus is added once. */
  private assess(): ExpeditionObjective[] {
    const fresh = this.map.objectives.filter((o) => !this._done.includes(o.id) && this.isDone(o));
    for (const objective of fresh) {
      this._done.push(objective.id);
      this._bonus += objective.bonus;
    }
    return fresh;
  }

  /** The map's objectives as the board stands. */
  objectives(): ExpeditionProgress[] {
    return this.map.objectives.map((o) => ({
      ...o,
      done: this._done.includes(o.id),
      ...(o.kind === "surround" ? { count: this.around(o.sites[0]!), of: AROUND.length } : {}),
    }));
  }
}
