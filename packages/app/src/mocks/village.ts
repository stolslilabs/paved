import type { BoardTile } from "@paved/chain";
import type { RewardOffer } from "../components/containers/reward-sheet";
import { cellKey, legalCells, type Cell, type Village } from "../components/containers/village-rules";
import type { VillageSceneProps } from "../components/scenes/village-scene";
import { PLAYER } from "./players";

const ME = PLAYER.name ?? "bal7hazar";

/**
 * The v1 village's fakes (#646), shared with the PvP flow (#647): villages of every size built by the rules of
 * `village-rules.ts`, and the reward offers; "take Cobbles" is 5 (#642, rule B). The v2 village's are `village-v2.ts` (#739).
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

const P = PLAN;
const MIXED = [P.road, P.roadCross, P.roadBend, P.cityEdge, P.wonder, P.forestCity, P.road, P.stopRoads, P.roadCity, P.cityForest, P.city, P.road, P.wonder, P.roadBend, P.cityEdge, P.road];

function village(owner: string, level: number, cells: Cell[], plans: readonly number[], score: number): Village {
  return { owner, level, cells, tiles: build(cells, plans), score };
}

/** A new village: the 9 cells of the start, a road and a wonder on them. */
export const VILLAGE_START = village(ME, 1, square(1), [P.road, P.wonder], 900);

/** Halfway: 21 cells, 14 tiles. */
export const VILLAGE_GROWING = village(ME, 4, grow(square(1), 12), MIXED.slice(0, 14), 6_420);

/** A large village: 38 cells, 32 tiles. */
export const VILLAGE_FULL = village(ME, 9, grow(square(1), 29), [...MIXED, ...MIXED].slice(0, 32), 14_880);

/**
 * A cramped village: the centre the only free cell, walled by city on every side. A city tile fits it; a road or a wonder fits
 * nowhere (greyed out).
 */
export const VILLAGE_CRAMPED: Village = (() => {
  const cells = square(1);
  const tiles: BoardTile[] = cells
    .filter((c) => c.x !== 0 || c.y !== 0)
    .map((c, i) => ({ id: i + 1, plan: P.city, orientation: 1, x: c.x, y: c.y }));
  return { owner: ME, level: 2, cells, tiles, score: 2_400 };
})();

/** A village not founded yet: the 3 x 3 of the start and the starter (`RFFFRFCFR` facing South), what `found` gives. */
export const VILLAGE_UNFOUNDED: Village = { owner: ME, level: 1, cells: square(1), tiles: [{ id: 1, plan: P.roadBend, orientation: 3, x: 0, y: 0 }], score: 0 };

/** Another player's village, for a visit: from a profile, or the defender of the PvP scout (#647). */
export const VILLAGE_RIVAL = village("Rook of Ashford", 7, grow(square(1), 20), [...MIXED, ...MIXED].slice(0, 26), 11_250);

/** The reward offers: three plans (3 cards of the base deck's 72) and the Cobbles instead. */
export const REWARD: RewardOffer = { plans: [P.road, P.wonder, P.roadCross], cobbles: 5 };
/** In the cramped village: one tile fits, two are greyed out. */
export const REWARD_CRAMPED: RewardOffer = { plans: [P.city, P.road, P.wonder], cobbles: 5 };

/** A scene's data without its callbacks. */
type Data<P> = { [K in keyof P as K extends `on${string}` ? never : K]: P[K] };

/** One fixture per state of the village scene (`Scenes/Village`). */
export const VILLAGE = {
  start: { village: VILLAGE_START, cobbles: 120 },
  growing: { village: VILLAGE_GROWING, cobbles: 640 },
  full: { village: VILLAGE_FULL, cobbles: 2_310 },
  fogOff: { village: VILLAGE_GROWING, cobbles: 640, fog: "off" },
  reward: { village: VILLAGE_GROWING, cobbles: 640, reward: REWARD },
  rewardChosen: { village: VILLAGE_GROWING, cobbles: 640, reward: REWARD, initialSelected: 0 },
  rewardCramped: { village: VILLAGE_CRAMPED, cobbles: 80, reward: REWARD_CRAMPED },
  rewardBusy: { village: VILLAGE_GROWING, cobbles: 640, reward: REWARD, busy: true },
  unfounded: { village: VILLAGE_UNFOUNDED, founded: false },
  waiting: { village: VILLAGE_START, cobbles: 120, pending: 3 },
  refused: { village: VILLAGE_START, cobbles: 5, reward: REWARD, refusal: "Your reward was claimed already. No Cobbles were spent." },
  rewardFailed: { village: VILLAGE_START, cobbles: 120, pending: 2, rewardError: { message: "Rewards: the node did not answer" } },
  loading: { status: { kind: "loading" } },
  guest: { status: { kind: "guest" } },
  unavailable: { village: null },
  visitProfile: { village: VILLAGE_RIVAL, mode: "visit", from: "profile" },
  visitScout: { village: VILLAGE_RIVAL, mode: "visit", from: "scout" },
} satisfies Record<string, Data<VillageSceneProps>>;
