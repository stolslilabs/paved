import type { BoardTile } from "@paved/chain";
import type { ParcelOffer } from "../components/containers/parcel-sheet";
import type { SkinTierGate } from "../components/containers/skin-grid";
import type { RewardOffer } from "../components/containers/reward-sheet";
import { TIERS, buyableCells, cellKey, legalCells, tierOf, type Cell, type Village } from "../components/containers/village-rules";
import type { VillageSceneProps } from "../components/scenes/village-scene";
import { PLAYER } from "./players";

const ME = PLAYER.name ?? "bal7hazar";

/**
 * The village's fakes (#646), shared with the PvP flow (#647): villages of every size built by the rules of
 * `village-rules.ts`, the reward offers and the parcel prices. Until #640 and #642 say otherwise, the prices and levels are
 * proposals: a parcel costs 20 Cobbles per cell owned past the 9 of the start, and every 4 cells past the start need one
 * more level (the 13th cell level 2, ... the 38th level 8).
 */

/** Chain plan ids by their nine letters (`PlanType`'s index): the plans the fakes use. */
export const PLAN = {
  city: 1, // CCCCCCCCC
  cityForest: 2, // CCCCCFFFC
  forestCity: 7, // FFFFCCCFF
  cityEdge: 8, // FFFFFFCFF
  roadBend: 9, // RFFFRFCFR
  road: 10, // RFFFRFFFR
  roadCity: 12, // RFRFFFCFR
  roadCross: 13, // RFRFFFFFR
  stopRoads: 17, // SFRFRFRFR
  wonder: 18, // WFFFFFFFF
} as const;

/** A square of cells around (0, 0): `radius` 1 is the 3x3 start of 9 cells. */
export function square(radius: number): Cell[] {
  const cells: Cell[] = [];
  for (let y = radius; y >= -radius; y--) for (let x = -radius; x <= radius; x++) cells.push({ x, y });
  return cells;
}

/** `cells` grown by `extra` cells next to it, in a fixed walk outward from the centre: a connected shape. */
export function grow(cells: readonly Cell[], extra: number): Cell[] {
  const out = [...cells];
  const owned = new Set(out.map(cellKey));
  const order: Cell[] = [];
  for (let r = 1; r <= 6; r++) {
    for (let y = r; y >= -r; y--) for (let x = -r; x <= r; x++) if (Math.max(Math.abs(x), Math.abs(y)) === r) order.push({ x, y });
  }
  // The nearest cells first, east before west: a compact shape, leaning east as a player's might.
  order.sort((a, b) => Math.abs(a.x) + Math.abs(a.y) - (Math.abs(b.x) + Math.abs(b.y)) || b.x - a.x || b.y - a.y);
  let added = 0;
  while (added < extra) {
    const next = order.find((c) => !owned.has(cellKey(c)) && out.some((o) => Math.abs(o.x - c.x) + Math.abs(o.y - c.y) === 1));
    if (!next) break;
    out.push(next);
    owned.add(cellKey(next));
    added++;
  }
  return out;
}

/** Places `plans` one by one on the first legal cell and orientation (cells nearest the centre first): a village by the rules. */
export function build(cells: readonly Cell[], plans: readonly number[]): BoardTile[] {
  const tiles: BoardTile[] = [];
  for (const plan of plans) {
    const spots = legalCells({ cells, tiles }, plan).sort((a, b) => Math.abs(a.x) + Math.abs(a.y) - (Math.abs(b.x) + Math.abs(b.y)) || b.y - a.y || a.x - b.x);
    const spot = spots[0];
    if (spot) tiles.push({ id: tiles.length + 1, plan, orientation: spot.orientations[0]!, x: spot.x, y: spot.y });
  }
  return tiles;
}

/** Each plan placed counts one copy; `extra` adds the copies merged on top. */
export function copiesOf(tiles: readonly BoardTile[], extra: Readonly<Record<number, number>> = {}): Record<number, number> {
  const copies: Record<number, number> = {};
  for (const t of tiles) copies[t.plan] = (copies[t.plan] ?? 0) + 1;
  for (const [plan, n] of Object.entries(extra)) copies[Number(plan)] = (copies[Number(plan)] ?? 0) + n;
  return copies;
}

const P = PLAN;
const MIXED = [P.road, P.roadCross, P.roadBend, P.cityEdge, P.wonder, P.forestCity, P.road, P.stopRoads, P.roadCity, P.cityForest, P.city, P.road, P.wonder, P.roadBend, P.cityEdge, P.road];

function village(owner: string, level: number, cells: Cell[], plans: readonly number[], extra: Record<number, number>, score: number): Village {
  const tiles = build(cells, plans);
  return { owner, level, cells, tiles, copies: copiesOf(tiles, extra), score };
}

/** A new village: the 9 cells of the start, a road and a wonder on them. */
export const VILLAGE_START = village(ME, 1, square(1), [P.road, P.wonder], {}, 900);

/** Halfway: 21 cells, 14 tiles, a few plans in silver and gold. */
export const VILLAGE_GROWING = village(ME, 4, grow(square(1), 12), MIXED.slice(0, 14), { [P.road]: 1, [P.wonder]: 2 }, 6_420);

/** The most a village holds: 38 cells, 32 tiles, every tier on some plan. */
export const VILLAGE_FULL = village(ME, 9, grow(square(1), 29), [...MIXED, ...MIXED].slice(0, 32), { [P.road]: 10, [P.wonder]: 4, [P.cityEdge]: 2 }, 14_880);

/**
 * A cramped village: the centre the only free cell, walled by city on every side. A city tile fits it; a road or a wonder fits
 * nowhere and has no tile of its plan to copy onto (greyed out).
 */
export const VILLAGE_CRAMPED: Village = (() => {
  const cells = square(1);
  const tiles: BoardTile[] = cells
    .filter((c) => c.x !== 0 || c.y !== 0)
    .map((c, i) => ({ id: i + 1, plan: P.city, orientation: 1, x: c.x, y: c.y }));
  return { owner: ME, level: 2, cells, tiles, copies: copiesOf(tiles), score: 2_400 };
})();

/** Another player's village, for a visit: from a profile, or the defender of the PvP scout (#647). */
export const VILLAGE_RIVAL = village("Rook of Ashford", 7, grow(square(1), 20), [...MIXED, ...MIXED].slice(0, 26), { [P.roadCross]: 3, [P.wonder]: 6, [P.stopRoads]: 1 }, 11_250);

/** The reward offers: three distinct plans (the sims' model, 3 of 72 cards) and the Cobbles instead. */
export const REWARD: RewardOffer = { plans: [P.road, P.wonder, P.roadCross], cobbles: 15 };
/** In the cramped village: one tile fits, two are greyed out. */
export const REWARD_CRAMPED: RewardOffer = { plans: [P.city, P.road, P.wonder], cobbles: 15 };

/**
 * The skins reserved to a tier (#642 decides which), for a theme's shop: the plan's tier from `VILLAGE_FULL`'s copies. The first
 * row of the shop shows both: the city's Silver reached, the other two not.
 */
export const SKIN_TIER_GATES: Readonly<Record<number, SkinTierGate>> = Object.fromEntries(
  ([
    [P.city, 1],
    [P.cityForest, 3],
    [3, 2],
    [P.road, 3],
    [P.stopRoads, 4],
    [P.wonder, 2],
  ] as const).map(([plan, tier]) => [plan, { tier, name: TIERS[tier].name, reached: tierOf(VILLAGE_FULL.copies[plan] ?? 0) >= tier }]),
);

/** The parcel price and level gate for a village of `cells` cells (the proposal above); null once full. */
export function parcelFor(cells: number): ParcelOffer | null {
  if (cells >= 38) return null;
  return { price: 20 * Math.max(1, cells - 8), level: 1 + Math.floor((cells + 1 - 9) / 4) };
}

/** A parcel next to the growing village. */
const GROWING_PARCEL = buyableCells(VILLAGE_GROWING.cells)[0]!;

/** A scene's data without its callbacks. */
type Data<P> = { [K in keyof P as K extends `on${string}` ? never : K]: P[K] };

/** One fixture per state of the village scene (`Scenes/Village`). */
export const VILLAGE = {
  start: { village: VILLAGE_START, cobbles: 120, parcel: parcelFor(9) },
  growing: { village: VILLAGE_GROWING, cobbles: 640, parcel: parcelFor(21) },
  full: { village: VILLAGE_FULL, cobbles: 2_310, parcel: parcelFor(38) },
  fogOff: { village: VILLAGE_GROWING, cobbles: 640, parcel: parcelFor(21), fog: "off" },
  reward: { village: VILLAGE_GROWING, cobbles: 640, parcel: parcelFor(21), reward: REWARD },
  rewardChosen: { village: VILLAGE_GROWING, cobbles: 640, parcel: parcelFor(21), reward: REWARD, initialSelected: 0 },
  rewardCopy: { village: VILLAGE_GROWING, cobbles: 640, parcel: parcelFor(21), reward: REWARD, initialSelected: 1 },
  rewardCramped: { village: VILLAGE_CRAMPED, cobbles: 80, parcel: parcelFor(9), reward: REWARD_CRAMPED },
  rewardBusy: { village: VILLAGE_GROWING, cobbles: 640, parcel: parcelFor(21), reward: REWARD, busy: true },
  parcelReady: { village: VILLAGE_START, cobbles: 120, parcel: parcelFor(9), initialParcel: { x: 2, y: 0 } },
  parcelLevel: { village: VILLAGE_GROWING, cobbles: 640, parcel: { price: 260, level: 5 }, initialParcel: GROWING_PARCEL },
  parcelCobbles: { village: VILLAGE_GROWING, cobbles: 90, parcel: parcelFor(21), initialParcel: GROWING_PARCEL },
  tiers: { village: VILLAGE_FULL, cobbles: 2_310, parcel: parcelFor(38), initialTiers: true },
  visitProfile: { village: VILLAGE_RIVAL, mode: "visit", from: "profile" },
  visitScout: { village: VILLAGE_RIVAL, mode: "visit", from: "scout" },
} satisfies Record<string, Data<VillageSceneProps>>;
