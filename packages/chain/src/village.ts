import type { Decoded } from "./codec";
import type { Call } from "./writer";

// The village (#640, docs/architecture/village-territory.md): the writes a player sends to `Village` (found, buy a parcel,
// demolish a tile) and the shapes of its views, decoded from their ABI structs. Coordinates on chain are the game's
// (`CENTER` the starter); `toCell` and `fromCell` convert to the client's, relative to the starter. The curves (the parcel's
// price and level, the demolition's price) are game-core's (`parcelPrice`, `parcelLevel`, `demolitionPrice`), the
// contract's mirror. `Village` is not deployed yet: the wiring of the village screen (#646) takes its address from the
// deployment once it is.

/** The contracts' `CENTER`: the starter's coordinates on chain. */
const CENTER = 0x7fffffff;

/** `Village.village(player_id)`: the game, the cells (the 9 of the start included), the tiles placed, the score, the next parcel. */
export interface VillageInfo {
  gameId: number;
  cells: number;
  tiles: number;
  score: number;
  /** The next parcel's number, price and level; all 0 once the territory is full. */
  nextParcel: number;
  nextPrice: number;
  nextLevel: number;
}

/** `Village.next_demolition(player_id)`: the chain day, the demolitions made that day, the price of the next. */
export interface DemolitionOffer {
  day: number;
  count: number;
  price: number;
}

/** A cell, relative to the starter. */
export interface VillageCell {
  x: number;
  y: number;
}

/** A tile of `Village.tiles`: its id (1 the starter), plan and orientation codes, cell relative to the starter. */
export interface VillageTile extends VillageCell {
  id: number;
  plan: number;
  orientation: number;
}

/** The struct fields of the views, in ABI order (camelCased); a test checks them against `contracts/abis/Village.json`. */
export const VILLAGE_INFO_FIELDS = ["gameId", "cells", "tiles", "score", "nextParcel", "nextPrice", "nextLevel"];
export const DEMOLITION_OFFER_FIELDS = ["day", "count", "price"];
export const VILLAGE_CELL_FIELDS = ["x", "y"];
export const VILLAGE_TILE_FIELDS = ["id", "plan", "orientation", "x", "y"];

/** The reasons of `Village`'s spends on `Setup` (`CobblesSpent.reason`, a short string). */
export const VILLAGE_SPEND_REASON = { parcel: "VILLAGE_PARCEL", demolition: "VILLAGE_DEMOLISH" } as const;

/** A chain coordinate pair to a cell relative to the starter. */
export const toCell = (x: number, y: number): VillageCell => ({ x: x - CENTER, y: y - CENTER });

/** A cell relative to the starter to the chain's coordinates, as calldata. */
export function fromCell(cell: VillageCell): [string, string] {
  for (const d of [cell.x, cell.y]) {
    if (!Number.isInteger(d) || Math.abs(d) > 64) throw new Error(`Not a village cell: (${cell.x}, ${cell.y})`);
  }
  return [`0x${(CENTER + cell.x).toString(16)}`, `0x${(CENTER + cell.y).toString(16)}`];
}

const n = (value: Decoded | undefined): number => Number(value ?? 0);

export const villageInfo = (s: Record<string, Decoded>): VillageInfo => ({
  gameId: n(s.gameId),
  cells: n(s.cells),
  tiles: n(s.tiles),
  score: n(s.score),
  nextParcel: n(s.nextParcel),
  nextPrice: n(s.nextPrice),
  nextLevel: n(s.nextLevel),
});

export const demolitionOffer = (s: Record<string, Decoded>): DemolitionOffer => ({
  day: n(s.day),
  count: n(s.count),
  price: n(s.price),
});

export const villageCell = (s: Record<string, Decoded>): VillageCell => toCell(n(s.x), n(s.y));

export const villageTile = (s: Record<string, Decoded>): VillageTile => ({
  id: n(s.id),
  plan: n(s.plan),
  orientation: n(s.orientation),
  ...toCell(n(s.x), n(s.y)),
});

/** `Village.found()`: the caller's village, once. */
export const foundVillageCall = (village: string): Call => ({ contractAddress: village, entrypoint: "found", calldata: [] });

/** `Village.buy_parcel(x, y)`: the parcel at `cell`, paid in Cobbles on `Setup`'s ledger. */
export const buyParcelCall = (village: string, cell: VillageCell): Call => ({
  contractAddress: village,
  entrypoint: "buy_parcel",
  calldata: fromCell(cell),
});

/** `Village.demolish(x, y)`: the tile at `cell`, at the price of the day's next demolition (`next_demolition`). */
export const demolishCall = (village: string, cell: VillageCell): Call => ({
  contractAddress: village,
  entrypoint: "demolish",
  calldata: fromCell(cell),
});
