import { DECKS } from "./engine/decks";
import { poseidon } from "./engine/draw";
import { CATEGORY_CITY, CATEGORY_FOREST, CATEGORY_ROAD, CATEGORY_WONDER, EAST, NORTH, SOUTH, WEST, edgeCategory, opposite, planRow, toward, wonderArea } from "./engine/geometry";
import { Board } from "./engine/structures";
import { PlanType } from "./types/plan";

// The Colossus (the weekly collective event, the design proposal of 2026-11-10): one site for the whole server for one week. A heart
// of 16 by 16 cells and districts of 8 by 8 around it, each inside a wall, about half built; every builder receives three tiles a day
// and lays them in the holes; a structure that closes sets its tiles as stones of the monument, to the builder whose tile closed it;
// the gauge (the stones over the site's cells) pays every participant at four tiers and the ten builders with the most stones on
// top. The rules the client and the contracts will share: the calendar, the site and its size, the hands, the placement and its two
// fair-play rules, the stones, the gauge and the rewards. Every figure is the proposal's, to be calibrated before the contracts. The
// client runs one Colossus every week (the owner's ask of 2026-11-10 for the weekly events: a new one starts when one ends), in place
// of the proposal's week 4 of a season; the four seasons' monuments come in turn, a week each.
//
// Plans and orientations are the contracts' codes here (a plan's index in `PlanType`, an orientation 1 North to 4 West): what a
// tile's view holds, and what the engine's tables read.

/** A Colossus's week: Monday 00:00 UTC to the next. */
export const COLOSSUS_WEEK_S = 7 * 86_400;
export const COLOSSUS_DAY_S = 86_400;
/** The days of a week: three tiles each. */
export const COLOSSUS_DAYS = 7;
/** The first Monday of the epoch (1970-01-05): the weeks count from it. */
const FIRST_MONDAY_S = 4 * 86_400;

/** The tiles a day brings each builder, at 00:00 UTC. */
export const COLOSSUS_RATION = 3;
/** The most tiles a hand holds: a day's tiles wait until the next day's end. */
export const COLOSSUS_HAND = 2 * COLOSSUS_RATION;
/** The tiles a builder lays in the week for their name to wear the season's stone in the chat. */
export const COLOSSUS_NAME_TILES = 9;
/** The gauge that opens the heart, in percent. */
export const COLOSSUS_HEART_SHARE = 50;
/** The builders the plaque names and pays on top: the ten with the most stones set. */
export const COLOSSUS_TOP = 10;

/** The Colossus week of a time, in seconds since the epoch. */
export const colossusWeekOf = (seconds: number): number => Math.floor((seconds - FIRST_MONDAY_S) / COLOSSUS_WEEK_S);
/** When a week starts (Monday 00:00 UTC): its site opens. */
export const colossusWeekStart = (week: number): number => FIRST_MONDAY_S + week * COLOSSUS_WEEK_S;
/** When a week ends (Sunday 24:00 UTC, the next week's start): its site takes no more tile, its top 10 is paid. */
export const colossusEndsAt = (week: number): number => colossusWeekStart(week + 1);
/** The day of a time in its week: 0 Monday to 6 Sunday. */
export const colossusDayOf = (seconds: number): number => Math.floor((seconds - colossusWeekStart(colossusWeekOf(seconds))) / COLOSSUS_DAY_S);

/** A tier of the gauge: its share of the site in percent, and the Cobbles it pays every participant. No XP, no chest. */
export interface ColossusTier {
  share: number;
  cobbles: number;
}
export const COLOSSUS_TIERS: readonly ColossusTier[] = [
  { share: 25, cobbles: 10 },
  { share: 50, cobbles: 15 },
  { share: 75, cobbles: 20 },
  { share: 100, cobbles: 30 },
];
/** The Cobbles of a place among the builders by stones set (1 first): 150, 100, 75, then 50 each to the 10th; 0 past it. */
export const colossusTopCobbles = (place: number): number => (place === 1 ? 150 : place === 2 ? 100 : place === 3 ? 75 : place >= 4 && place <= COLOSSUS_TOP ? 50 : 0);

export type ColossusSeason = "winter" | "spring" | "summer" | "autumn";
const SEASONS: readonly ColossusSeason[] = ["winter", "spring", "summer", "autumn"];
/** The season whose monument a week builds: the four in turn (the client's weekly run; the proposal's is the calendar's season). */
export const colossusSeasonOf = (week: number): ColossusSeason => SEASONS[((week % 4) + 4) % 4]!;

/** A season's monument: its name, the stone a builder's name wears, and the kind of area its site is rich in. */
export interface ColossusMonument {
  season: ColossusSeason;
  name: string;
  stone: string;
  /** The area letter of a plan the site's tiles favour: cities, roads, wonders, forests. */
  kind: "C" | "R" | "W" | "F";
}
export const COLOSSUS_MONUMENTS: Record<ColossusSeason, ColossusMonument> = {
  winter: { season: "winter", name: "The Citadel", stone: "the Citadel's grey", kind: "C" },
  spring: { season: "spring", name: "The Great Road", stone: "the Road's sandstone", kind: "R" },
  summer: { season: "summer", name: "The Colossal Wonder", stone: "the Wonder's marble", kind: "W" },
  autumn: { season: "autumn", name: "The Sacred Wood", stone: "the Wood's moss", kind: "F" },
};

/** A district's side, the heart's (two districts wide), and their holes at the start: 36 of 64 cells, 144 of 256. */
export const COLOSSUS_DISTRICT = 8;
export const COLOSSUS_HEART = 2 * COLOSSUS_DISTRICT;
export const COLOSSUS_DISTRICT_HOLES = 36;
/** The holes the site holds for each builder of the last Colossus. */
export const COLOSSUS_HOLES_PER_BUILDER = 10;
/** The most rings of districts around the heart. */
export const COLOSSUS_MAX_RINGS = 20;

/** A site's size: its rings of districts around the heart, its lots a side, its cells and holes, the builders it is sized for. */
export interface ColossusSize {
  rings: number;
  lots: number;
  districts: number;
  cells: number;
  holes: number;
  builders: number;
}
/** The size of a site of `rings` rings: `2 x rings + 2` lots a side, the four middle ones the heart. */
export function colossusSize(rings: number): ColossusSize {
  const lots = 2 * rings + 2;
  const holes = lots * lots * COLOSSUS_DISTRICT_HOLES;
  return { rings, lots, districts: lots * lots - 4, cells: lots * lots * COLOSSUS_DISTRICT * COLOSSUS_DISTRICT, holes, builders: Math.floor(holes / COLOSSUS_HOLES_PER_BUILDER) };
}
/** The rings a site needs for `builders` (those of the last Colossus): the fewest that hold 10 holes each, 20 at most. */
export function colossusRingsFor(builders: number): number {
  for (let rings = 1; rings < COLOSSUS_MAX_RINGS; rings++) if (colossusSize(rings).builders >= builders) return rings;
  return COLOSSUS_MAX_RINGS;
}

/** A lot of the site's grid: its column and row (0 the west, 0 the north), its board (0 the heart), and a district's name ("B3"). */
export interface ColossusLot {
  col: number;
  row: number;
  board: number;
  heart: boolean;
  name: string;
}
/** The site's lots, rows from the north, west to east: the four middle ones are the heart's (board 0), the others a district each. */
export function colossusLots(rings: number): ColossusLot[] {
  const side = 2 * rings + 2;
  const lots: ColossusLot[] = [];
  let board = 1;
  for (let row = 0; row < side; row++) {
    for (let col = 0; col < side; col++) {
      const heart = (row === rings || row === rings + 1) && (col === rings || col === rings + 1);
      const name = heart ? "Heart" : `${col >= 26 ? String.fromCharCode(64 + Math.floor(col / 26)) : ""}${String.fromCharCode(65 + (col % 26))}${row + 1}`;
      lots.push({ col, row, board: heart ? 0 : board++, heart, name });
    }
  }
  return lots;
}

const PLANS = Object.values(PlanType);
/** The 72 cards of the base deck, by plan code: what every hand is drawn from, and what a hole must be fillable by. */
const DECK: readonly number[] = Array.from({ length: DECKS.simple.total }, (_, index) => PLANS.indexOf(DECKS.simple.plan(index)));
/** The deck's distinct plans and their copies. */
const COPIES = new Map<number, number>();
for (const code of DECK) COPIES.set(code, (COPIES.get(code) ?? 0) + 1);
const DISTINCT: readonly number[] = [...COPIES.keys()].sort((a, b) => a - b);

const SIDES: readonly number[] = [NORTH, EAST, SOUTH, WEST];
const EDGES: readonly number[] = [CATEGORY_FOREST, CATEGORY_ROAD, CATEGORY_CITY];
const SCORED: readonly number[] = [CATEGORY_ROAD, CATEGORY_CITY, CATEGORY_FOREST, CATEGORY_WONDER];
/** A side of a hole: a wall (any edge may face it) or another hole (not known yet); else the category of the tile's facing edge. */
const WALL = 0;
const OPEN = -1;

const FITTING = new Map<number, number>();
/**
 * The cards of the deck that fit a hole of these sides (north, east, south, west: a category, or `WALL` for any), in some turn. Of
 * the 81 ways to close a hole on four sides, 26 fit no card at all.
 */
function fitting(sides: readonly number[]): number {
  const key = ((sides[0]! * 4 + sides[1]!) * 4 + sides[2]!) * 4 + sides[3]!;
  let count = FITTING.get(key);
  if (count === undefined) {
    count = 0;
    for (const code of DISTINCT) {
      for (let o = 1; o <= 4; o++) {
        if (SIDES.every((side, i) => sides[i] === WALL || edgeCategory(code, o, side) === sides[i])) {
          count += COPIES.get(code)!;
          break;
        }
      }
    }
    FITTING.set(key, count);
  }
  return count;
}

/** An edge of a tile as a hole sees it: forest, road or city. */
export type ColossusEdge = "F" | "R" | "C";
const EDGE_CODES: Record<ColossusEdge, number> = { F: CATEGORY_FOREST, R: CATEGORY_ROAD, C: CATEGORY_CITY };
/** The cards of the 72 that fit a hole closed by these four edges (north, east, south, west), in some turn; 0: a dead hole. */
export const colossusFitting = (north: ColossusEdge, east: ColossusEdge, south: ColossusEdge, west: ColossusEdge): number => fitting([north, east, south, west].map((edge) => EDGE_CODES[edge]));

const SITE_SALT =0x434f4c4f53535553n; // 'COLOSSUS'
const HAND_SALT = 0x434f4c48414e44n; // 'COLHAND'

/** A small generator in [0, 1) from felts (mulberry32 on their Poseidon's low word): the site's and the hands' draws. */
function generator(...seed: (bigint | number)[]): () => number {
  let a = Number(poseidon(...seed) & 0xffffffffn);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Each day's seed, by week and day, once drawn. */
const DAY_SEEDS = new Map<number, number>();

/** A tile of the hand: `card` is its name in a move (its day times three, plus its place in that day's three), `plan` its code. */
export interface ColossusCard {
  card: number;
  day: number;
  plan: number;
}

/**
 * The three tiles `address` receives on `day` (0 Monday to 6 Sunday) of `week`, public: each player's hand comes from the day's seed
 * and their address. On chain the day's seed is the VRF's (`open_day`) and the draw a Poseidon of it and the address; here, the seed
 * is Poseidon on the week and the day, and the address is mixed in by a plain hash.
 */
export function colossusRation(week: number, day: number, address: bigint): ColossusCard[] {
  const key = week * COLOSSUS_DAYS + day;
  let seed = DAY_SEEDS.get(key);
  if (seed === undefined) DAY_SEEDS.set(key, (seed = Number(poseidon(HAND_SALT, key) & 0xffffffffn)));
  // The day's seed mixed with the address (its 32-bit words folded): one Poseidon a day, not one a builder.
  let mixed = seed;
  for (let rest = address; rest > 0n; rest >>= 32n) mixed = Math.imul(mixed ^ Number(rest & 0xffffffffn), 0x9e3779b1) | 0;
  let a = mixed;
  const random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return Array.from({ length: COLOSSUS_RATION }, (_, slot) => ({ card: day * COLOSSUS_RATION + slot, day, plan: DECK[Math.floor(random() * DECK.length)]! }));
}

/** A tile on a board: pre-built (`by` null) or a builder's, and whether it is a stone of the Colossus yet. */
export interface ColossusTile {
  x: number;
  y: number;
  plan: number;
  orientation: number;
  by: string | null;
  stone: boolean;
}

/** A placement on a board: the turn and the cell (0, 0 the south-west corner). */
export interface ColossusPlacement {
  orientation: number;
  x: number;
  y: number;
}

/** What a tile laid on a board did: the stones it set (the sealed holes apart), the holes sealed after it, whether the board is full. */
export interface ColossusLaid {
  stones: number;
  sealed: { x: number; y: number }[];
  full: boolean;
}

/** A hole closed on its four sides that one or two cards of the deck fit: it waits for its card. */
export interface ColossusHardHole {
  x: number;
  y: number;
  /** The deck's cards that fit it. */
  cards: number;
  /** The plans (codes) that fit it. */
  plans: number[];
}

/**
 * One board of the site: the heart or a district, inside its wall. An edge facing the wall counts as closed, so a full board has
 * no open structure. A tile goes in a hole with a side neighbour, the same edge on every side, and never where it would leave a
 * neighbouring hole that no card fits (the enclosure rule) or two facing holes that no pair of cards fills (the pair rule). A hole
 * that no card can take under these rules is sealed: it becomes a wall.
 */
export class ColossusBoard {
  private cells: (ColossusTile | null)[];
  private sealed: boolean[];
  /** The stones by cell (a tile's, or a sealed hole's), each to the builder who set it; null: nobody's (set at the start, or a seal). */
  private stoneOf = new Map<number, string | null>();
  private engine = new Board();
  /** The cells of the tiles, in the order they came. */
  private order: number[] = [];
  private closedRoots = new Set<number>();
  private _holes = 0;

  /** `tiles`: the pre-built ones; the structures they already close are stones of nobody. */
  constructor(
    readonly index: number,
    readonly size: number,
    tiles: readonly Omit<ColossusTile, "by" | "stone">[],
  ) {
    this.cells = Array.from({ length: size * size }, () => null);
    this.sealed = Array.from({ length: size * size }, () => false);
    this.engine.wall = (x, y) => this.walled(x, y);
    for (const t of tiles) this.put({ ...t, by: null, stone: false });
    this._holes = size * size - tiles.length;
    this.settle(null);
  }

  clone(): ColossusBoard {
    const copy = Object.create(ColossusBoard.prototype) as ColossusBoard;
    Object.assign(copy, this);
    copy.cells = this.cells.map((t) => t && { ...t });
    copy.sealed = [...this.sealed];
    copy.stoneOf = new Map(this.stoneOf);
    copy.engine = this.engine.clone();
    copy.engine.wall = (x, y) => copy.walled(x, y);
    copy.order = [...this.order];
    copy.closedRoots = new Set(this.closedRoots);
    return copy;
  }

  private inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }
  private walled(x: number, y: number): boolean {
    return !this.inside(x, y) || this.sealed[y * this.size + x]!;
  }
  private put(tile: ColossusTile): void {
    const cell = tile.y * this.size + tile.x;
    this.cells[cell] = tile;
    this.order.push(cell);
    this.engine.place({ id: cell + 1, plan: tile.plan, orientation: tile.orientation, x: tile.x, y: tile.y, owner: 0n });
  }

  get cellCount(): number {
    return this.size * this.size;
  }
  /** The holes left: neither a tile nor sealed. */
  get holes(): number {
    return this._holes;
  }
  /** The stones set on this board, the sealed holes included. */
  get stones(): number {
    return this.stoneOf.size;
  }
  get full(): boolean {
    return this._holes === 0;
  }
  tileAt(x: number, y: number): ColossusTile | null {
    return this.inside(x, y) ? this.cells[y * this.size + x]! : null;
  }
  isSealed(x: number, y: number): boolean {
    return this.inside(x, y) && this.sealed[y * this.size + x]!;
  }
  isHole(x: number, y: number): boolean {
    return this.inside(x, y) && !this.cells[y * this.size + x] && !this.sealed[y * this.size + x];
  }
  /** The tiles, rows from the south, west to east. */
  tiles(): ColossusTile[] {
    return this.cells.filter((t): t is ColossusTile => t !== null);
  }

  /** The four sides of a cell, north, east, south, west, with `tile` (not on the board yet) taken as laid. */
  private sidesOf(x: number, y: number, tile?: { plan: number } & ColossusPlacement): number[] {
    return SIDES.map((side) => {
      const [nx, ny] = toward(x, y, side);
      if (tile && tile.x === nx && tile.y === ny) return edgeCategory(tile.plan, tile.orientation, opposite(side));
      if (this.walled(nx, ny)) return WALL;
      const neighbour = this.cells[ny * this.size + nx];
      return neighbour ? edgeCategory(neighbour.plan, neighbour.orientation, opposite(side)) : OPEN;
    });
  }

  /** Why laying `plan` at `placement` is refused, or null. */
  refusal(plan: number, placement: ColossusPlacement, known?: readonly number[]): string | null {
    const { x, y, orientation } = placement;
    if (!this.isHole(x, y)) return "Colossus: not a hole";
    const sides = known ?? this.sidesOf(x, y);
    if (!sides.some((s) => s > 0)) return "Tile: no neighbors";
    if (!SIDES.every((side, i) => sides[i]! <= 0 || edgeCategory(plan, orientation, side) === sides[i])) return "Tile: cannot place";
    const tile = { plan, orientation, x, y };
    for (let i = 0; i < 4; i++) {
      if (sides[i] !== OPEN) continue;
      const [hx, hy] = toward(x, y, SIDES[i]!);
      const hole = this.sidesOf(hx, hy, tile);
      const open = hole.flatMap((s, side) => (s === OPEN ? [side] : []));
      if (open.length === 0 && fitting(hole) === 0) return "Colossus: would leave a hole no tile fits";
      if (open.length !== 1) continue;
      // The pair rule: the hole's last open side is another hole whose own last open side is this one.
      const [px, py] = toward(hx, hy, SIDES[open[0]!]!);
      const pair = this.sidesOf(px, py, tile);
      if (pair.filter((s) => s === OPEN).length !== 1) continue;
      const back = (open[0]! + 2) % 4;
      if (!EDGES.some((edge) => fitting(hole.map((s, side) => (side === open[0] ? edge : s))) > 0 && fitting(pair.map((s, side) => (side === back ? edge : s))) > 0)) return "Colossus: would leave two holes no pair fits";
    }
    return null;
  }

  /** Every legal placement of `plan`, by cell then turn; `sides`, the tiles it would touch. */
  legalPlacements(plan: number): (ColossusPlacement & { sides: number })[] {
    return this.candidates(plan).filter((p) => this.refusal(plan, p) === null);
  }

  /**
   * The placements of `plan` that the edges allow (a hole, a side neighbour, the same edge on every side), by cell then turn, the
   * two fair-play rules not asked yet (`refusal` asks them): what a search sorts before it asks.
   */
  candidates(plan: number): (ColossusPlacement & { sides: number })[] {
    const out: (ColossusPlacement & { sides: number })[] = [];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.cells[y * this.size + x] || this.sealed[y * this.size + x]) continue;
        const sides = this.sidesOf(x, y);
        const count = sides.filter((s) => s > 0).length;
        if (count === 0) continue;
        for (let orientation = 1; orientation <= 4; orientation++) {
          if (SIDES.every((side, i) => sides[i]! <= 0 || edgeCategory(plan, orientation, side) === sides[i])) out.push({ orientation, x, y, sides: count });
        }
      }
    }
    return out;
  }

  /** Whether a hole can never take a tile: no hole beside it and no tile either, or a tile beside it and no card of the deck legal. */
  private dead(x: number, y: number): boolean {
    const sides = this.sidesOf(x, y);
    if (!sides.some((s) => s > 0)) return !sides.includes(OPEN);
    return !DISTINCT.some((plan) => [1, 2, 3, 4].some((orientation) => this.refusal(plan, { orientation, x, y }, sides) === null));
  }

  /** The closed structures not counted yet: each of their tiles not yet a stone becomes one, `builder`'s. */
  private settle(builder: string | null): number {
    let set = 0;
    const stone = (x: number, y: number) => {
      const tile = this.tileAt(x, y);
      if (!tile || tile.stone) return;
      tile.stone = true;
      this.stoneOf.set(y * this.size + x, builder);
      set += 1;
    };
    for (const s of this.engine.structures()) {
      if (s.open !== 0 || this.closedRoots.has(s.root) || !SCORED.includes(s.category)) continue;
      this.closedRoots.add(s.root);
      if (s.category === CATEGORY_WONDER) {
        // A wonder's tiles: itself and the eight around it.
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) stone(s.tile.x + dx, s.tile.y + dy);
      } else {
        for (const { tileId } of this.engine.areasOf(s.root)) stone((tileId - 1) % this.size, Math.floor((tileId - 1) / this.size));
      }
    }
    // A full board has no open edge: all its tiles are stones.
    if (this._holes === 0) for (const tile of this.cells) if (tile) stone(tile.x, tile.y);
    return set;
  }

  /** The structure state again from the tiles, after a hole became a wall. */
  private rebuild(): void {
    this.engine = new Board();
    this.engine.wall = (x, y) => this.walled(x, y);
    this.closedRoots.clear();
    for (const cell of this.order) {
      const t = this.cells[cell]!;
      this.engine.place({ id: cell + 1, plan: t.plan, orientation: t.orientation, x: t.x, y: t.y, owner: 0n });
    }
  }

  /** Lays `plan` for `builder`: the structures it closes set their stones, then every hole no card can take any more is sealed. */
  place(plan: number, placement: ColossusPlacement, builder: string): ColossusLaid {
    const refused = this.refusal(plan, placement);
    if (refused) throw new Error(refused);
    this.put({ ...placement, plan, by: builder, stone: false });
    this._holes -= 1;
    let stones = this.settle(builder);
    const sealed: { x: number; y: number }[] = [];
    // A tile changes what its neighbourhood can take (three cells away at most, the pair rule's reach); a seal, the whole board's.
    for (let reach = 3; ; reach = this.size * 2) {
      const dead: { x: number; y: number }[] = [];
      for (let y = 0; y < this.size; y++) {
        for (let x = 0; x < this.size; x++) {
          if (Math.abs(x - placement.x) + Math.abs(y - placement.y) <= reach && this.isHole(x, y) && this.dead(x, y)) dead.push({ x, y });
        }
      }
      if (dead.length === 0) break;
      for (const { x, y } of dead) {
        this.sealed[y * this.size + x] = true;
        this.stoneOf.set(y * this.size + x, null);
        this._holes -= 1;
      }
      sealed.push(...dead);
      this.rebuild();
      stones += this.settle(builder);
    }
    return { stones, sealed, full: this._holes === 0 };
  }

  /** The stones `plan` would set at `placement` (the holes it would seal apart), on a copy. */
  preview(plan: number, placement: ColossusPlacement): number {
    return this.clone().place(plan, placement, "").stones;
  }

  /** The hard holes: closed on four sides, one or two cards of the deck fit. */
  hardHoles(): ColossusHardHole[] {
    const out: ColossusHardHole[] = [];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (!this.isHole(x, y)) continue;
        const sides = this.sidesOf(x, y);
        if (sides.includes(OPEN)) continue;
        const cards = fitting(sides);
        if (cards === 0 || cards > 2) continue;
        const plans = DISTINCT.filter((plan) => [1, 2, 3, 4].some((o) => SIDES.every((side, i) => sides[i] === WALL || edgeCategory(plan, o, side) === sides[i])));
        out.push({ x, y, cards, plans });
      }
    }
    return out;
  }
}

/** A plan's weight in a season's site: the tiles of the monument's kind come more often. */
function weightOf(plan: number, kind: ColossusMonument["kind"]): number {
  const name = planRow(plan).name;
  if (kind === "W") return wonderArea(plan) !== 0 ? 4 : 1;
  return 1 + [...name].filter((letter) => letter === kind).length / 3;
}

/**
 * A board's tiles at the start: a whole legal tiling of `size` by `size` cells drawn cell by cell (so every hole can be filled),
 * less `holes` cells drawn out of it. The proposal has eight hand-made templates per season, each district's template and turn
 * drawn by the week's seed; here every board is drawn from the week's seed.
 */
function drawBoard(size: number, holes: number, kind: ColossusMonument["kind"], random: () => number): Omit<ColossusTile, "by" | "stone">[] {
  const tiles: Omit<ColossusTile, "by" | "stone">[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const west = x > 0 ? edgeCategory(tiles[y * size + x - 1]!.plan, tiles[y * size + x - 1]!.orientation, EAST) : WALL;
      const south = y > 0 ? edgeCategory(tiles[(y - 1) * size + x]!.plan, tiles[(y - 1) * size + x]!.orientation, NORTH) : WALL;
      const fits: { plan: number; orientation: number; weight: number }[] = [];
      let total = 0;
      for (const plan of DISTINCT) {
        const weight = COPIES.get(plan)! * weightOf(plan, kind);
        for (let orientation = 1; orientation <= 4; orientation++) {
          if ((west !== WALL && edgeCategory(plan, orientation, WEST) !== west) || (south !== WALL && edgeCategory(plan, orientation, SOUTH) !== south)) continue;
          fits.push({ plan, orientation, weight });
          total += weight;
        }
      }
      let pick = random() * total;
      const chosen = fits.find((f) => (pick -= f.weight) < 0) ?? fits[fits.length - 1]!;
      tiles.push({ x, y, plan: chosen.plan, orientation: chosen.orientation });
    }
  }
  const cells = tiles.map((_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cells[i], cells[j]] = [cells[j]!, cells[i]!];
  }
  const out = new Set(cells.slice(0, holes));
  return tiles.filter((_, i) => !out.has(i));
}

/** A builder of the week: the tiles they laid, the stones they set, and when they reached that total (a tie goes to the earlier). */
export interface ColossusBuilder {
  address: string;
  tiles: number;
  stones: number;
  at: number;
}

/** What a tile laid on the site did. */
export interface ColossusMove {
  board: number;
  x: number;
  y: number;
  plan: number;
  orientation: number;
  /** The stones the tile set, its builder's. */
  stones: number;
  sealed: { x: number; y: number }[];
  /** The site's stones before and after. */
  before: number;
  after: number;
  /** The tiers (indexes of `COLOSSUS_TIERS`) the move reached. */
  tiers: number[];
  heartOpened: boolean;
  /** The move completed the Colossus: its builder is the capstone. */
  completed: boolean;
}

/**
 * A week's site: the heart (board 0, closed until the gauge reaches 50%) and its districts, the builders' hands, stones and tiles,
 * the tiers' times and the capstone. Pure: everything follows from the week, the rings and the tiles laid in order.
 */
export class Colossus {
  readonly monument: ColossusMonument;
  readonly size: ColossusSize;
  readonly boards: readonly ColossusBoard[];
  private builders = new Map<string, ColossusBuilder>();
  private used = new Map<string, Set<number>>();
  private _stones = 0;
  /** When each tier was reached; null: not yet. */
  readonly tierAt: (number | null)[] = COLOSSUS_TIERS.map(() => null);
  private _completedAt: number | null = null;
  private _capstone: string | null = null;

  constructor(
    readonly week: number,
    rings: number,
  ) {
    this.monument = COLOSSUS_MONUMENTS[colossusSeasonOf(week)];
    this.size = colossusSize(rings);
    const board = (index: number, size: number) => new ColossusBoard(index, size, drawBoard(size, (size * size * COLOSSUS_DISTRICT_HOLES) / (COLOSSUS_DISTRICT * COLOSSUS_DISTRICT), this.monument.kind, generator(SITE_SALT, week, index)));
    this.boards = [board(0, COLOSSUS_HEART), ...Array.from({ length: this.size.districts }, (_, i) => board(i + 1, COLOSSUS_DISTRICT))];
    this._stones = this.boards.reduce((sum, b) => sum + b.stones, 0);
    this.reach(colossusWeekStart(week));
  }

  /** The site's stones: its gauge is their share of its cells. */
  get stones(): number {
    return this._stones;
  }
  get cells(): number {
    return this.size.cells;
  }
  /** The stones a share of the site in percent asks. */
  stonesFor(share: number): number {
    return Math.ceil((this.size.cells * share) / 100);
  }
  /** The heart takes tiles once the gauge reached 50%. */
  get heartOpen(): boolean {
    return this._stones >= this.stonesFor(COLOSSUS_HEART_SHARE);
  }
  get completedAt(): number | null {
    return this._completedAt;
  }
  /** Whoever laid the tile that completed the Colossus. */
  get capstone(): string | null {
    return this._capstone;
  }
  /** The holes left on the whole site. */
  get holes(): number {
    return this.boards.reduce((sum, b) => sum + b.holes, 0);
  }

  private reach(at: number): number[] {
    const reached: number[] = [];
    COLOSSUS_TIERS.forEach((tier, i) => {
      if (this.tierAt[i] === null && this._stones >= this.stonesFor(tier.share)) {
        this.tierAt[i] = at;
        reached.push(i);
      }
    });
    return reached;
  }

  /** A builder of the week by their address (as given to `build`); null: they laid no tile. */
  builder(address: string): ColossusBuilder | null {
    return this.builders.get(address) ?? null;
  }
  /** The builders by stones set, the first first; a tie goes to the earlier total, then to the address. */
  ranking(): ColossusBuilder[] {
    return [...this.builders.values()].sort((a, b) => b.stones - a.stones || a.at - b.at || (a.address < b.address ? -1 : 1));
  }

  /** The tiles `address` holds on `day`: that day's three and the day before's (inside the week), less those laid. */
  hand(address: string, day: number): ColossusCard[] {
    const used = this.used.get(address);
    const cards: ColossusCard[] = [];
    for (const d of [day - 1, day]) if (d >= 0 && d < COLOSSUS_DAYS) cards.push(...colossusRation(this.week, d, BigInt(address)));
    return cards.filter((c) => !used?.has(c.card));
  }

  /**
   * Where a builder who plays by the site's hints lays `plan`: the legal placement that touches the most tiles (a hole nearly
   * closed first), `random` (in [0, 1)) choosing among equals; null when it fits nowhere. For the client's simulated builders.
   */
  suggest(plan: number, random: () => number): { board: number; placement: ColossusPlacement } | null {
    const found: { board: number; placement: ColossusPlacement; rank: number }[] = [];
    this.boards.forEach((board, index) => {
      if (index === 0 && !this.heartOpen) return;
      for (const { sides, ...placement } of board.candidates(plan)) found.push({ board: index, placement, rank: sides + random() });
    });
    found.sort((a, b) => b.rank - a.rank);
    const best = found.find((f) => this.boards[f.board]!.refusal(plan, f.placement) === null);
    return best ? { board: best.board, placement: best.placement } : null;
  }

  /** Why `address` laying their tile `card` at `placement` of `board` at `at` (seconds) is refused, or null. */
  refusal(address: string, card: number, board: number, placement: ColossusPlacement, at: number): string | null {
    if (colossusWeekOf(at) !== this.week) return "Colossus: the week is over";
    if (this._completedAt !== null) return "Colossus: complete";
    const held = this.hand(address, colossusDayOf(at)).find((c) => c.card === card);
    if (!held) return "Colossus: not in hand";
    const target = this.boards[board];
    if (!target) return "Colossus: no such district";
    if (board === 0 && !this.heartOpen) return "Colossus: the heart is not open";
    return target.refusal(held.plan, placement);
  }

  /** Lays the tile `card` of `address`'s hand: the stones it sets are theirs. */
  build(address: string, card: number, board: number, placement: ColossusPlacement, at: number): ColossusMove {
    const refused = this.refusal(address, card, board, placement, at);
    if (refused) throw new Error(refused);
    const plan = this.hand(address, colossusDayOf(at)).find((c) => c.card === card)!.plan;
    const target = this.boards[board]!;
    const before = this._stones;
    const heartOpen = this.heartOpen;
    const stonesBefore = target.stones;
    const laid = target.place(plan, placement, address);
    this._stones += target.stones - stonesBefore;
    this.used.set(address, (this.used.get(address) ?? new Set()).add(card));
    const builder = this.builders.get(address) ?? { address, tiles: 0, stones: 0, at };
    builder.tiles += 1;
    if (laid.stones > 0) {
      builder.stones += laid.stones;
      builder.at = at;
    }
    this.builders.set(address, builder);
    const tiers = this.reach(at);
    const completed = this._stones >= this.size.cells;
    if (completed) {
      this._completedAt = at;
      this._capstone = address;
    }
    return { board, x: placement.x, y: placement.y, plan, orientation: placement.orientation, stones: laid.stones, sealed: laid.sealed, before, after: this._stones, tiers, heartOpened: !heartOpen && this.heartOpen, completed };
  }
}
