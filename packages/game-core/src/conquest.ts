import { CATEGORY_CITY, CATEGORY_FOREST, CATEGORY_ROAD, CATEGORY_WONDER, EAST, NORTH, SOUTH, WEST, categoryOf, edgeCategory, opposite, toward, wonderArea } from "./engine/geometry";
import { Board, type BoardTile } from "./engine/structures";
import { BASE_PLAN_CODES, rarityOf, type Rarity } from "./rules/rarity";
import { GUILD_RANK, type GuildRank } from "./social/guild";
import { PlanType } from "./types/plan";

// The Conquest (the season's finale, an allegiance event; the design proposal of 8 and 9 November 2026): the registered allegiances
// share one world cut into squares, a province each and free zones between them. Three days of registration, then three phases of
// a week (Foundation, Awakening, Frontiers: six days of play and a rest day), then the results. Every member makes Offerings (the
// allegiance's Knowledge, and its orders of the day) and explores a cell a day; an Officer or the Leader asks for a tile on a cell,
// a member who holds it gives it and it is built; a closed structure pays the allegiance with the most tiles in it; the Knowledge
// buys the levels of a tree. The rules the client and the contracts will share: the calendar, the world, the Offerings, the
// exploration, the placement, the majority, the points, the tree and the rewards. Every figure is the proposal's (or, where it gave
// none, a placeholder said so here), to be calibrated before the contracts. The client loops the Conquest (the owner's ask for
// every event): the next one's registration opens when one ends.

// --- The calendar ---------------------------------------------------------------------------------------------------------

const DAY_S = 86_400;
/** The registration's length, before day 1. */
export const CONQUEST_REGISTRATION_S = 3 * DAY_S;
/** The Conquest's days, the results' included: D1 to D28. */
export const CONQUEST_DAYS = 28;
/** The last day of play (Frontiers' last): the results follow. */
export const CONQUEST_LAST_DAY = 20;
/** One Conquest on the client, registration to the results' end: the next one's registration opens then. */
export const CONQUEST_CYCLE_S = CONQUEST_REGISTRATION_S + CONQUEST_DAYS * DAY_S;
/** The start of Conquest 0's registration: Monday 2 November 2026, 00:00 UTC. */
export const CONQUEST_EPOCH_S = 1_793_577_600;

/** The Conquest of a time (seconds since the epoch), counted from `CONQUEST_EPOCH_S`. */
export const conquestOf = (seconds: number): number => Math.floor((seconds - CONQUEST_EPOCH_S) / CONQUEST_CYCLE_S);
/** When a Conquest's registration opens. */
export const conquestStart = (conquest: number): number => CONQUEST_EPOCH_S + conquest * CONQUEST_CYCLE_S;
/** When its day 1 begins: the registration closes, the world is drawn. */
export const conquestOpensAt = (conquest: number): number => conquestStart(conquest) + CONQUEST_REGISTRATION_S;
/** When it ends (the end of D28): the next one's registration opens. */
export const conquestEndsAt = (conquest: number): number => conquestStart(conquest + 1);
/** The day of a time inside its Conquest: 0 during the registration, then 1 to 28. */
export function conquestDayOf(seconds: number): number {
  const opens = conquestOpensAt(conquestOf(seconds));
  return seconds < opens ? 0 : Math.floor((seconds - opens) / DAY_S) + 1;
}
/** When day `day` (1 to 28) of a Conquest begins, 00:00 UTC. */
export const conquestDayStart = (conquest: number, day: number): number => conquestOpensAt(conquest) + (day - 1) * DAY_S;

/** The three phases of play, a week each. */
export const CONQUEST_PHASES = ["foundation", "awakening", "frontiers"] as const;
export type ConquestPlayPhase = (typeof CONQUEST_PHASES)[number];
export type ConquestPhase = "registration" | ConquestPlayPhase | "results";
/** Each phase's first day, last day of play, and the day its result is in (its rest day; D21 for Frontiers). */
export const CONQUEST_PHASE_DAYS: Record<ConquestPlayPhase, { first: number; last: number; result: number }> = {
  foundation: { first: 1, last: 6, result: 7 },
  awakening: { first: 8, last: 13, result: 14 },
  frontiers: { first: 15, last: 20, result: 21 },
};
/** The phase of a day: a rest day (D7, D14) belongs to the phase it closes. */
export const conquestPhaseOfDay = (day: number): ConquestPhase => (day <= 0 ? "registration" : day <= 7 ? "foundation" : day <= 14 ? "awakening" : day <= CONQUEST_LAST_DAY ? "frontiers" : "results");
/** A rest day: nobody builds or explores; Offerings give Knowledge and research stays open. */
export const conquestRestDay = (day: number): boolean => day === 7 || day === 14;
/** A day of play: tiles are built and cells explored. */
export const conquestPlayDay = (day: number): boolean => day >= 1 && day <= CONQUEST_LAST_DAY && !conquestRestDay(day);

// --- The world ------------------------------------------------------------------------------------------------------------

/** A zone's side in cells: a province or a free zone. */
export const CONQUEST_PROVINCE = 25;
const MIDDLE = (CONQUEST_PROVINCE - 1) / 2;
/** Whether a tile's edge that looks in `direction` (2 north, 4 east, 6 south, 8 west) is forest: it opens no road and no city. */
export const conquestForestEdge = (plan: number, orientation: number, direction: number): boolean => edgeCategory(plan, orientation, direction) === CATEGORY_FOREST;

/** A province's two wonders, from its south-west corner. */
export const CONQUEST_PROVINCE_WONDERS: readonly (readonly [number, number])[] = [
  [6, 18],
  [18, 6],
];

/** The zones a side of the world for `count` allegiances: the smallest odd side (3 at least) whose provinces seat them all. */
export function conquestSide(count: number): number {
  let side = 3;
  while (Math.ceil((side * side) / 2) < count) side += 2;
  return side;
}
/** Whether zone `(col, row)` is a province: the checkerboard's squares of one colour, the corners and the centre among them. */
export const conquestProvinceAt = (col: number, row: number): boolean => (col + row) % 2 === 0;
/**
 * The provinces of a world of `side` zones, as zone indexes (`row * side + col`), the centre first and then outward: the seats, in
 * the order the allegiances take them (the best season's Joust rating at the centre).
 */
export function conquestSeats(side: number): number[] {
  const centre = (side - 1) / 2;
  const seats: { zone: number; far: number }[] = [];
  for (let row = 0; row < side; row++) for (let col = 0; col < side; col++) if (conquestProvinceAt(col, row)) seats.push({ zone: row * side + col, far: (col - centre) ** 2 + (row - centre) ** 2 });
  return seats.sort((a, b) => a.far - b.far || a.zone - b.zone).map((s) => s.zone);
}
/** A zone's name on the map: its column's letter and its row's number, the south-west one `A1`. */
export const conquestZoneName = (side: number, zone: number): string => `${String.fromCharCode(65 + (zone % side))}${Math.floor(zone / side) + 1}`;

// --- Knowledge: the Offerings, the exploration, the tree --------------------------------------------------------------------

/** The Offerings that wait for a member at most. */
export const CONQUEST_OFFERINGS_WAITING = 12;
/** The Offerings a day by Devotion's level, 0 to 10: one every 2 hours down to one every hour. */
export const CONQUEST_OFFERINGS_A_DAY: readonly number[] = [12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 24];
/** The seconds between two Offerings at a Devotion level. */
export const conquestOfferingEvery = (devotion: number): number => Math.floor(DAY_S / CONQUEST_OFFERINGS_A_DAY[devotion]!);
/** The orders of a day at most: one per member's first Offering. */
export const CONQUEST_ORDERS = 50;

/** The tree's branches: a bonus on a kind of structure won, or Devotion (the Offerings come faster). */
export const CONQUEST_BRANCHES = ["roads", "cities", "forests", "wonders", "devotion"] as const;
export type ConquestBranch = (typeof CONQUEST_BRANCHES)[number];
export type ConquestLevels = Record<ConquestBranch, number>;
/** A branch's levels. */
export const CONQUEST_LEVELS = 10;
/** The Knowledge of each level, 1 to 10, the same for the five branches: 4,550 a branch, 22,750 in all. */
export const CONQUEST_LEVEL_COSTS: readonly number[] = [40, 60, 100, 150, 250, 350, 500, 700, 1_000, 1_400];
/** A structure branch's bonus in percent by level, 0 to 10: levels 5 and 10 are milestones. */
export const CONQUEST_LEVEL_BONUS: readonly number[] = [0, 5, 10, 15, 20, 30, 35, 40, 45, 50, 60];
/** The Knowledge of a branch's next level; null: it is complete. */
export const conquestLevelCost = (level: number): number | null => CONQUEST_LEVEL_COSTS[level] ?? null;
export const freshConquestLevels = (): ConquestLevels => ({ roads: 0, cities: 0, forests: 0, wonders: 0, devotion: 0 });

/** The odds of a cell's Knowledge, in percent: 11 on average in a province, 20 in a free zone. */
export const CONQUEST_ODDS: Record<"province" | "free", readonly { knowledge: number; share: number }[]> = {
  province: [
    { knowledge: 5, share: 58 },
    { knowledge: 10, share: 26 },
    { knowledge: 20, share: 10 },
    { knowledge: 40, share: 4 },
    { knowledge: 100, share: 2 },
  ],
  free: [
    { knowledge: 5, share: 28 },
    { knowledge: 10, share: 30 },
    { knowledge: 20, share: 24 },
    { knowledge: 40, share: 12 },
    { knowledge: 100, share: 6 },
  ],
};

/** A whole-number mix in [0, 1): the client's draws (on chain, the VRF's). */
function mix(...parts: number[]): number {
  let h = 0x9e3779b9;
  for (const part of parts) {
    h = Math.imul(h ^ (part | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return (h >>> 0) / 4_294_967_296;
}

/** The Knowledge cell `(x, y)` of a Conquest holds, drawn from its zone's odds: nobody knows it before the exploration. */
export function conquestKnowledgeAt(conquest: number, x: number, y: number, free: boolean): number {
  let pick = mix(0xc0, conquest, x, y) * 100;
  const odds = CONQUEST_ODDS[free ? "free" : "province"];
  return (odds.find((o) => (pick -= o.share) < 0) ?? odds[0]!).knowledge;
}

// --- Structures and points --------------------------------------------------------------------------------------------------

export type ConquestStructure = "road" | "city" | "forest" | "wonder" | "great";
/**
 * A structure's base points per tile. The proposal gives the city's (a city of 10 tiles is about 2,500 points); the others are
 * placeholders of this client: a road and a forest half a city, a wonder (always 9 tiles) more, a Great Wonder four wonders.
 */
export const CONQUEST_BASE: Record<ConquestStructure, number> = { road: 100, city: 200, forest: 100, wonder: 500, great: 2_000 };
/** The growth of a structure's points with its size. */
export const CONQUEST_GROWTH = 1.0235;
/** The branch whose level raises a structure's points. */
export const CONQUEST_BRANCH_OF: Record<ConquestStructure, ConquestBranch> = { road: "roads", city: "cities", forest: "forests", wonder: "wonders", great: "wonders" };
/** The points of a closed structure of `size` tiles, won with its branch at `level`: `size x base x 1.0235^size`, and the level's bonus. */
export const conquestPoints = (kind: ConquestStructure, size: number, level = 0): number => Math.round((size * CONQUEST_BASE[kind] * CONQUEST_GROWTH ** size * (100 + CONQUEST_LEVEL_BONUS[level]!)) / 100);

/** Who wins a closed structure from its tiles by allegiance: the one with the most; null on a tie for the most (or with none). */
export function conquestMajority(counts: ReadonlyMap<number, number>): number | null {
  let best = 0;
  let winner: number | null = null;
  for (const [guild, count] of counts) {
    if (count > best) {
      best = count;
      winner = guild;
    } else if (count === best) winner = null;
  }
  return winner;
}

// --- Roles, gifts and rewards -----------------------------------------------------------------------------------------------

/** Who registers the allegiance, opens the build requests and buys the tree's levels: the Leader and the Officers. */
export const conquestLeads = (rank: GuildRank): boolean => rank >= GUILD_RANK.officer;
/** The Cobbles a tile given pays its giver, by rarity. */
export const CONQUEST_GIFT_COBBLES: Record<Rarity, number> = { common: 1, uncommon: 2, mythic: 5 };
export const conquestGiftCobbles = (plan: number): number => CONQUEST_GIFT_COBBLES[rarityOf(plan)];

/** A member is paid at the end with Offerings on this many days of the Conquest. */
export const CONQUEST_ELIGIBLE_DAYS = 9;
/** A member is paid for a phase with Offerings on this many of its days (a placeholder: the proposal's 9 days over its three phases). */
export const CONQUEST_PHASE_ELIGIBLE_DAYS = 3;
/** The Cobbles of a phase per eligible member, by the allegiance's place: the podium's, then everyone's (placeholders, an open point). */
export const CONQUEST_PHASE_COBBLES: readonly number[] = [150, 100, 75];
export const CONQUEST_PHASE_COBBLES_REST = 25;
/** The Cobbles of the final rank per eligible member (placeholders, an open point of the proposal). */
export const CONQUEST_FINAL_COBBLES: readonly number[] = [400, 250, 150];
export const CONQUEST_FINAL_COBBLES_REST = 50;
export const conquestPhaseCobbles = (place: number): number => CONQUEST_PHASE_COBBLES[place - 1] ?? CONQUEST_PHASE_COBBLES_REST;
export const conquestFinalCobbles = (place: number): number => CONQUEST_FINAL_COBBLES[place - 1] ?? CONQUEST_FINAL_COBBLES_REST;
export type ConquestCrest = "gold" | "silver" | "bronze";
/** The crest the final podium wears for the whole next season. */
export const conquestCrest = (place: number): ConquestCrest | null => (["gold", "silver", "bronze"] as const)[place - 1] ?? null;

// --- The world's state ------------------------------------------------------------------------------------------------------

const PLANS = Object.values(PlanType);
/** The capital's plan (a game's starter: a road, a city and forest on its edges) and the wonders' (forest all round). */
export const CONQUEST_CAPITAL_PLAN = PLANS.indexOf(PlanType.RFFFRFCFR);
export const CONQUEST_WONDER_PLAN = PLANS.indexOf(PlanType.WFFFFFFFF);
const SIDES: readonly number[] = [NORTH, EAST, SOUTH, WEST];
const KIND_OF: Record<number, ConquestStructure> = { [CATEGORY_ROAD]: "road", [CATEGORY_CITY]: "city", [CATEGORY_FOREST]: "forest", [CATEGORY_WONDER]: "wonder" };

/** A tile of the world: an allegiance's (`guild`, 0 for a pre-built wonder), who gave it and on which day (null, 0: pre-built). */
export interface ConquestTile {
  id: number;
  x: number;
  y: number;
  plan: number;
  orientation: number;
  guild: number;
  by: string | null;
  day: number;
  kind: "capital" | "wonder" | "great" | "tile";
}

/** A zone of the world: a province (its allegiance, 0 for none) or a free zone, with its south-west cell. */
export interface ConquestZone {
  index: number;
  col: number;
  row: number;
  name: string;
  province: boolean;
  guild: number;
  x0: number;
  y0: number;
}

/** A build request: the tile an Officer or the Leader asks for on a cell. */
export interface ConquestRequest {
  id: number;
  guild: number;
  x: number;
  y: number;
  plan: number;
  orientation: number;
  by: string;
  at: number;
}

/** A closed structure: its kind and size, its tiles by allegiance, who won it (null: a tie, or nobody's) and the points paid. */
export interface ConquestScored {
  kind: ConquestStructure;
  size: number;
  counts: [guild: number, tiles: number][];
  winner: number | null;
  points: number;
  day: number;
  phase: ConquestPlayPhase;
  /** The tile that closed it. */
  x: number;
  y: number;
}

/** A member's Conquest: their Offerings' clock and days, the day of their last exploration and order, and what they brought. */
export interface ConquestMember {
  address: string;
  /** Offerings are counted from here. */
  anchor: number;
  offeringDays: number[];
  orderDay: number;
  exploredDay: number;
  offerings: number;
  explored: number;
  knowledge: number;
  tiles: number;
  /** The same three, phase by phase. */
  parts: Record<ConquestPlayPhase, { tiles: number; explored: number; knowledge: number }>;
}

/** An allegiance's Conquest: its province, its Knowledge and levels, the day's orders, its points by phase and its members. */
export interface ConquestAllegiance {
  guild: number;
  zone: number;
  knowledge: number;
  earned: number;
  levels: ConquestLevels;
  orders: { day: number; given: number; used: number };
  score: Record<ConquestPlayPhase, number>;
  tiles: number;
  explored: number;
  closed: number;
  members: Map<string, ConquestMember>;
}

export interface ConquestPlacement {
  x: number;
  y: number;
  plan: number;
  orientation: number;
}

const cellKey = (x: number, y: number): number => y * 4096 + x;

/**
 * One Conquest's world and its allegiances, moved by its members' acts in time order: `offer`, `explore`, `request`, `give` and
 * `research`, each refused with the rule's text (an `Error`) where the rules refuse it. `guilds` are the registered allegiances,
 * the best first: they take the provinces from the centre outward. A role is the caller's to check (`conquestLeads`), and so is the
 * tile a giver holds: the world knows no rank and no inventory.
 */
export class Conquest {
  readonly side: number;
  /** The world's side in cells. */
  readonly size: number;
  readonly zones: readonly ConquestZone[];
  readonly allegiances = new Map<number, ConquestAllegiance>();
  readonly tiles: ConquestTile[] = [];
  readonly requests = new Map<number, ConquestRequest>();
  readonly scored: ConquestScored[] = [];
  private readonly board = new Board();
  private readonly byCell = new Map<number, ConquestTile>();
  private readonly explored = new Set<number>();
  private readonly closed = new Set<number>();
  private nextRequest = 1;

  constructor(
    readonly conquest: number,
    /** The registered allegiances, the best first. */
    readonly guilds: readonly number[],
  ) {
    this.side = conquestSide(guilds.length);
    this.size = this.side * CONQUEST_PROVINCE;
    const seats = conquestSeats(this.side);
    const seated = new Map(guilds.map((guild, i) => [seats[i]!, guild]));
    const zones: ConquestZone[] = [];
    for (let row = 0; row < this.side; row++)
      for (let col = 0; col < this.side; col++) {
        const index = row * this.side + col;
        zones.push({ index, col, row, name: conquestZoneName(this.side, index), province: conquestProvinceAt(col, row), guild: seated.get(index) ?? 0, x0: col * CONQUEST_PROVINCE, y0: row * CONQUEST_PROVINCE });
      }
    this.zones = zones;
    for (const zone of zones) {
      if (!zone.province) {
        this.prebuild(zone.x0 + MIDDLE, zone.y0 + MIDDLE, CONQUEST_WONDER_PLAN, 0, "great");
        continue;
      }
      for (const [x, y] of CONQUEST_PROVINCE_WONDERS) this.prebuild(zone.x0 + x, zone.y0 + y, CONQUEST_WONDER_PLAN, 0, "wonder");
      if (zone.guild === 0) continue;
      this.prebuild(zone.x0 + MIDDLE, zone.y0 + MIDDLE, CONQUEST_CAPITAL_PLAN, zone.guild, "capital");
      // The capital's eight neighbours are known from the start: the first tiles go there.
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.explored.add(cellKey(zone.x0 + MIDDLE + dx, zone.y0 + MIDDLE + dy));
      this.allegiances.set(zone.guild, { guild: zone.guild, zone: zone.index, knowledge: 0, earned: 0, levels: freshConquestLevels(), orders: { day: 0, given: 0, used: 0 }, score: { foundation: 0, awakening: 0, frontiers: 0 }, tiles: 0, explored: 0, closed: 0, members: new Map() });
    }
  }

  private prebuild(x: number, y: number, plan: number, guild: number, kind: ConquestTile["kind"]): void {
    this.lay({ id: this.tiles.length + 1, x, y, plan, orientation: 1, guild, by: null, day: 0, kind });
  }

  private lay(tile: ConquestTile): BoardTile {
    this.tiles.push(tile);
    this.byCell.set(cellKey(tile.x, tile.y), tile);
    return this.board.place({ id: tile.id, plan: tile.plan, orientation: tile.orientation, x: tile.x, y: tile.y, owner: BigInt(tile.guild) });
  }

  // --- Reads ---

  inside(x: number, y: number): boolean {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < this.size && y < this.size;
  }
  /** The zone of a cell; null outside the world. */
  zoneAt(x: number, y: number): ConquestZone | null {
    return this.inside(x, y) ? this.zones[Math.floor(y / CONQUEST_PROVINCE) * this.side + Math.floor(x / CONQUEST_PROVINCE)]! : null;
  }
  tileAt(x: number, y: number): ConquestTile | null {
    return this.byCell.get(cellKey(x, y)) ?? null;
  }
  isExplored(x: number, y: number): boolean {
    return this.explored.has(cellKey(x, y));
  }
  /** The explored cells of a zone. */
  exploredIn(zone: ConquestZone): { x: number; y: number }[] {
    const cells: { x: number; y: number }[] = [];
    for (let y = zone.y0; y < zone.y0 + CONQUEST_PROVINCE; y++) for (let x = zone.x0; x < zone.x0 + CONQUEST_PROVINCE; x++) if (this.explored.has(cellKey(x, y))) cells.push({ x, y });
    return cells;
  }
  private allegiance(guild: number): ConquestAllegiance {
    const found = this.allegiances.get(guild);
    if (!found) throw new Error("Conquest: the allegiance is not registered");
    return found;
  }
  /** A member's record, made on their first act. */
  member(guild: number, address: string): ConquestMember {
    const allegiance = this.allegiance(guild);
    let member = allegiance.members.get(address);
    if (!member) {
      member = { address, anchor: conquestOpensAt(this.conquest), offeringDays: [], orderDay: 0, exploredDay: 0, offerings: 0, explored: 0, knowledge: 0, tiles: 0, parts: { foundation: { tiles: 0, explored: 0, knowledge: 0 }, awakening: { tiles: 0, explored: 0, knowledge: 0 }, frontiers: { tiles: 0, explored: 0, knowledge: 0 } } };
      allegiance.members.set(address, member);
    }
    return member;
  }
  private dayAt(now: number): number {
    return conquestOf(now) === this.conquest ? conquestDayOf(now) : now < conquestStart(this.conquest) ? 0 : CONQUEST_DAYS + 1;
  }
  /** Whether a zone is open to an allegiance at `now`: its own province in Foundation and Awakening, every zone in Frontiers. */
  openTo(guild: number, zone: ConquestZone, now: number): boolean {
    const day = this.dayAt(now);
    if (day < 1 || day > CONQUEST_LAST_DAY) return false;
    return conquestPhaseOfDay(day) === "frontiers" || (zone.province && zone.guild === guild);
  }
  /** The orders an allegiance has left on the day of `now`: given by its members' first Offerings (50 at most), less the tiles built. */
  ordersLeft(guild: number, now: number): number {
    const { orders } = this.allegiance(guild);
    return orders.day === this.dayAt(now) ? Math.min(CONQUEST_ORDERS, orders.given) - orders.used : 0;
  }
  /** The Offerings that wait for a member at `now` (12 at most), when the next one comes, and the seconds between two. */
  waiting(guild: number, address: string, now: number): { count: number; nextAt: number | null; every: number } {
    const allegiance = this.allegiance(guild);
    const every = conquestOfferingEvery(allegiance.levels.devotion);
    const anchor = allegiance.members.get(address)?.anchor ?? conquestOpensAt(this.conquest);
    const ends = conquestDayStart(this.conquest, CONQUEST_LAST_DAY + 1);
    // Past Frontiers the Offerings are over: what waited is lost.
    const count = now >= ends ? 0 : Math.max(0, Math.min(CONQUEST_OFFERINGS_WAITING, Math.floor((now - anchor) / every)));
    const nextAt = count >= CONQUEST_OFFERINGS_WAITING ? null : anchor + (count + 1) * every;
    return { count, nextAt: nextAt !== null && nextAt <= ends && now < ends ? nextAt : null, every };
  }
  /** The allegiances by points, the most first (a tie to the better seat): over a phase, or over the three. */
  ranking(phase?: ConquestPlayPhase): { guild: number; score: number }[] {
    const order = this.guilds;
    const total = (a: ConquestAllegiance) => (phase ? a.score[phase] : a.score.foundation + a.score.awakening + a.score.frontiers);
    return order.map((guild) => ({ guild, score: total(this.allegiances.get(guild)!) })).sort((a, b) => b.score - a.score || order.indexOf(a.guild) - order.indexOf(b.guild));
  }

  /** Why `guild` cannot explore cell `(x, y)` at `now`; null: it can. */
  exploreRefusal(guild: number, x: number, y: number, now: number): string | null {
    const zone = this.zoneAt(x, y);
    if (!zone) return "Conquest: no such cell";
    if (!conquestPlayDay(this.dayAt(now))) return "Conquest: nobody explores today";
    if (!this.openTo(guild, zone, now)) return "Conquest: the zone is closed";
    if (this.tileAt(x, y)) return "Conquest: the cell is built";
    if (this.isExplored(x, y)) return "Conquest: the cell is explored";
    return null;
  }

  /** Why `guild` cannot build `tile` at `now`, the orders apart; null: it fits. */
  buildRefusal(guild: number, tile: ConquestPlacement, now: number): string | null {
    const zone = this.zoneAt(tile.x, tile.y);
    if (!zone) return "Conquest: no such cell";
    if (!BASE_PLAN_CODES.includes(tile.plan) || ![1, 2, 3, 4].includes(tile.orientation)) return "Conquest: no such tile";
    if (!conquestPlayDay(this.dayAt(now))) return "Conquest: nobody builds today";
    if (!this.openTo(guild, zone, now)) return "Conquest: the zone is closed";
    if (this.tileAt(tile.x, tile.y)) return "Conquest: the cell is built";
    if (!this.isExplored(tile.x, tile.y)) return "Conquest: the cell is not explored";
    let own = false;
    for (const side of SIDES) {
      const [nx, ny] = toward(tile.x, tile.y, side);
      const neighbour = this.tileAt(nx, ny);
      if (!neighbour) continue;
      if (neighbour.guild === guild) own = true;
      if (edgeCategory(neighbour.plan, neighbour.orientation, opposite(side)) !== edgeCategory(tile.plan, tile.orientation, side)) return "Tile: cannot place";
    }
    return own ? null : "Conquest: not next to a tile of the allegiance";
  }

  /** The explored, empty cells of the open zones next to a tile of `guild`: where a request may go. */
  frontier(guild: number, now: number): { x: number; y: number }[] {
    const cells = new Map<number, { x: number; y: number }>();
    if (!conquestPlayDay(this.dayAt(now))) return [];
    for (const tile of this.tiles) {
      if (tile.guild !== guild) continue;
      for (const side of SIDES) {
        const [x, y] = toward(tile.x, tile.y, side);
        const zone = this.zoneAt(x, y);
        if (zone && !this.tileAt(x, y) && this.isExplored(x, y) && this.openTo(guild, zone, now)) cells.set(cellKey(x, y), { x, y });
      }
    }
    return [...cells.values()];
  }

  /** The base plans that fit cell `(x, y)` for `guild`, each with its turns. */
  fitting(guild: number, x: number, y: number, now: number): { plan: number; orientations: number[] }[] {
    const fits: { plan: number; orientations: number[] }[] = [];
    for (const plan of BASE_PLAN_CODES) {
      const orientations = [1, 2, 3, 4].filter((orientation) => this.buildRefusal(guild, { x, y, plan, orientation }, now) === null);
      if (orientations.length) fits.push({ plan, orientations });
    }
    return fits;
  }

  // --- Acts ---

  /**
   * A member's Offerings: every one that waits, 1 Knowledge each to the allegiance. Their first of a day of play also gives the
   * allegiance one order, when they were a member as the day began (`since`: when they joined).
   */
  offer(guild: number, address: string, now: number, since = 0): { knowledge: number; order: boolean } {
    const day = this.dayAt(now);
    if (day < 1) throw new Error("Conquest: not open yet");
    const { count, every } = this.waiting(guild, address, now);
    if (count === 0) throw new Error(day > CONQUEST_LAST_DAY ? "Conquest: the Offerings are over" : "Conquest: no Offering yet");
    const allegiance = this.allegiance(guild);
    const member = this.member(guild, address);
    // A full bowl starts its clock again; else the time already waited toward the next one is kept.
    member.anchor = count >= CONQUEST_OFFERINGS_WAITING ? now : member.anchor + count * every;
    member.offerings += count;
    member.knowledge += count;
    if (day <= CONQUEST_LAST_DAY) member.parts[conquestPhaseOfDay(day) as ConquestPlayPhase].knowledge += count;
    allegiance.knowledge += count;
    allegiance.earned += count;
    if (day <= CONQUEST_LAST_DAY && !member.offeringDays.includes(day)) member.offeringDays.push(day);
    let order = false;
    if (conquestPlayDay(day) && member.orderDay !== day && since < conquestDayStart(this.conquest, day)) {
      member.orderDay = day;
      if (allegiance.orders.day !== day) allegiance.orders = { day, given: 0, used: 0 };
      if (allegiance.orders.given < CONQUEST_ORDERS) {
        allegiance.orders.given += 1;
        order = true;
      }
    }
    return { knowledge: count, order };
  }

  /** A member's exploration of the day: the cell's Knowledge is drawn and goes to the allegiance, and the cell opens for building. */
  explore(guild: number, address: string, x: number, y: number, now: number): { knowledge: number } {
    const refusal = this.exploreRefusal(guild, x, y, now);
    if (refusal) throw new Error(refusal);
    const day = this.dayAt(now);
    const allegiance = this.allegiance(guild);
    const member = this.member(guild, address);
    if (member.exploredDay === day) throw new Error("Conquest: already explored today");
    const knowledge = conquestKnowledgeAt(this.conquest, x, y, !this.zoneAt(x, y)!.province);
    member.exploredDay = day;
    member.explored += 1;
    member.knowledge += knowledge;
    const part = member.parts[conquestPhaseOfDay(day) as ConquestPlayPhase];
    part.explored += 1;
    part.knowledge += knowledge;
    allegiance.explored += 1;
    allegiance.knowledge += knowledge;
    allegiance.earned += knowledge;
    this.explored.add(cellKey(x, y));
    return { knowledge };
  }

  /** A build request on a cell (the caller checked the rank): it spends no order, and replaces the allegiance's request there. */
  request(guild: number, address: string, tile: ConquestPlacement, now: number): ConquestRequest {
    this.allegiance(guild);
    const refusal = this.buildRefusal(guild, tile, now);
    if (refusal) throw new Error(refusal);
    for (const [id, r] of this.requests) if (r.guild === guild && r.x === tile.x && r.y === tile.y) this.requests.delete(id);
    const request: ConquestRequest = { id: this.nextRequest++, guild, x: tile.x, y: tile.y, plan: tile.plan, orientation: tile.orientation, by: address, at: now };
    this.requests.set(request.id, request);
    return request;
  }

  /**
   * A member gives a request's tile (the caller checked they hold it): it is built at once in their name, spends one order, and
   * every structure it closes is paid. A request that no longer fits is dropped and refused.
   */
  give(guild: number, address: string, id: number, now: number): { tile: ConquestTile; scored: ConquestScored[]; cobbles: number } {
    const request = this.requests.get(id);
    if (!request || request.guild !== guild) throw new Error("Conquest: no such request");
    const refusal = this.buildRefusal(guild, request, now);
    if (refusal) {
      if (refusal === "Tile: cannot place" || refusal === "Conquest: the cell is built") this.requests.delete(id);
      throw new Error(refusal === "Tile: cannot place" || refusal === "Conquest: the cell is built" ? "Conquest: the request no longer fits" : refusal);
    }
    if (this.ordersLeft(guild, now) < 1) throw new Error("Conquest: no order left today");
    const day = this.dayAt(now);
    const allegiance = this.allegiance(guild);
    const member = this.member(guild, address);
    allegiance.orders.used += 1;
    allegiance.tiles += 1;
    member.tiles += 1;
    member.parts[conquestPhaseOfDay(day) as ConquestPlayPhase].tiles += 1;
    const tile: ConquestTile = { id: this.tiles.length + 1, x: request.x, y: request.y, plan: request.plan, orientation: request.orientation, guild, by: address, day, kind: "tile" };
    const placed = this.lay(tile);
    // Every request on the cell is done, whoever asked.
    for (const [other, r] of this.requests) if (r.x === tile.x && r.y === tile.y) this.requests.delete(other);
    return { tile, scored: this.settle(placed, day), cobbles: conquestGiftCobbles(tile.plan) };
  }

  /** The Leader's or an Officer's purchase of a branch's next level (the caller checked the rank), until the end of Frontiers. */
  research(guild: number, branch: ConquestBranch, now: number): { level: number; cost: number } {
    const day = this.dayAt(now);
    if (day < 1 || day > CONQUEST_LAST_DAY) throw new Error("Conquest: research is closed");
    const allegiance = this.allegiance(guild);
    const cost = conquestLevelCost(allegiance.levels[branch]);
    if (cost === null) throw new Error("Conquest: the branch is complete");
    if (allegiance.knowledge < cost) throw new Error("Conquest: not enough Knowledge");
    allegiance.knowledge -= cost;
    allegiance.levels[branch] += 1;
    return { level: allegiance.levels[branch], cost };
  }

  /** The structures the tile just placed closed, each paid to its majority with the level of this moment. */
  private settle(placed: BoardTile, day: number): ConquestScored[] {
    const scored: ConquestScored[] = [];
    const phase = conquestPhaseOfDay(day) as ConquestPlayPhase;
    const pay = (root: number, kind: ConquestStructure, tiles: (ConquestTile | null)[], size: number) => {
      this.closed.add(root);
      const counts = new Map<number, number>();
      for (const tile of tiles) if (tile && tile.guild !== 0) counts.set(tile.guild, (counts.get(tile.guild) ?? 0) + 1);
      const winner = conquestMajority(counts);
      const allegiance = winner === null ? null : (this.allegiances.get(winner) ?? null);
      const points = allegiance ? conquestPoints(kind, size, allegiance.levels[CONQUEST_BRANCH_OF[kind]]) : 0;
      if (allegiance) {
        allegiance.score[phase] += points;
        allegiance.closed += 1;
      }
      const done: ConquestScored = { kind, size, counts: [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]), winner, points, day, phase, x: placed.x, y: placed.y };
      scored.push(done);
      this.scored.push(done);
    };
    const wonder = (tile: BoardTile) => {
      const { root, record } = this.board.rootOf(tile, wonderArea(tile.plan));
      if (record.open !== 0 || this.closed.has(root)) return;
      // A wonder's tiles: itself and the eight around it.
      const around: (ConquestTile | null)[] = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) around.push(this.tileAt(tile.x + dx, tile.y + dy));
      pay(root, this.tileAt(tile.x, tile.y)!.kind === "great" ? "great" : "wonder", around, 9);
    };
    for (let area = 1; area <= 9; area++) {
      if (!placed.refs[area]) continue;
      const category = categoryOf(placed.plan, area);
      if (category === CATEGORY_WONDER) {
        wonder(placed);
        continue;
      }
      const kind = KIND_OF[category];
      if (!kind) continue;
      const { root, record } = this.board.rootOf(placed, area);
      if (record.open !== 0 || this.closed.has(root)) continue;
      const tiles = this.board.areasOf(root).map(({ tileId }) => this.tiles[tileId - 1]!);
      pay(root, kind, tiles, tiles.length);
    }
    for (let direction = 1; direction <= 8; direction++) {
      const [x, y] = toward(placed.x, placed.y, direction);
      const neighbour = this.board.at(x, y);
      if (neighbour && wonderArea(neighbour.plan) !== 0) wonder(neighbour);
    }
    return scored;
  }
}
