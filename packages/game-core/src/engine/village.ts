// The village's territory (#640, `docs/architecture/village-territory.md`), as `contracts/src/systems/village.cairo`
// rules it: the 3 x 3 of the start around the starter, parcels bought one by one next to an owned cell up to the owner's
// cap (`max_cells`, at most `VILLAGE_MAX_CELLS_LIMIT`), each parcel gated by the player's level and priced in Cobbles. Relative coordinates (the starter at (0, 0)).

/** A cell of a territory, relative to the starter. */
export interface Cell {
  readonly x: number;
  readonly y: number;
}

/**
 * The highest cap the owner may set on a territory, the 9 of the start included (`MAX_CELLS_LIMIT`): a technical bound,
 * not a game rule. The cap in force is the chain's `max_cells`, given to `EngineGame.village` as `maxCells`.
 */
export const VILLAGE_MAX_CELLS_LIMIT = 100;
/** The cells of the start (`START_CELLS`). */
export const VILLAGE_START_CELLS = 9;
/** The most parcels a village can ever buy (`MAX_PARCELS`). */
export const VILLAGE_MAX_PARCELS = VILLAGE_MAX_CELLS_LIMIT - VILLAGE_START_CELLS;
/** The Cobbles of parcel `k` are `PARCEL_COBBLES x k` (`PARCEL_COBBLES`). */
export const PARCEL_COBBLES = 10;

/** The Cobbles of a chain day's first demolition (`DEMOLITION_COBBLES`); each one doubles the next. */
export const DEMOLITION_COBBLES = 5;
/**
 * The most Cobbles one demolition can be paid (`MAX_DEMOLITION_PRICE`: `Setup.spend_cobbles` takes a `u32`). A price above
 * it, from the 31st demolition of a day, is refused (`Village: price too high`), never charged lower.
 */
export const MAX_DEMOLITION_PRICE = 0xffffffff;

/**
 * `demolition_price`: the Cobbles of a demolition after `count` of them that chain day (5, 10, 20, 40...), doubled after
 * each one with no cap (exact as a number: 5 x 2^k is a float with no rounding).
 */
export function demolitionPrice(count: number): number {
  return DEMOLITION_COBBLES * 2 ** Math.max(0, Math.floor(count));
}

/** Whether a demolition after `count` of them that day can be paid on chain (`demolitionPrice` within `MAX_DEMOLITION_PRICE`). */
export const demolitionPayable = (count: number): boolean => demolitionPrice(count) <= MAX_DEMOLITION_PRICE;

/** The 9 cells of the start, as `Village.cells` lists them: rows from the south, west to east. */
export function startTerritory(): Cell[] {
  const cells: Cell[] = [];
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) cells.push({ x, y });
  return cells;
}

/** `parcel_price`: the Cobbles of parcel `parcel` (1 to `VILLAGE_MAX_PARCELS`), 0 otherwise. */
export function parcelPrice(parcel: number): number {
  return Number.isInteger(parcel) && parcel >= 1 && parcel <= VILLAGE_MAX_PARCELS ? PARCEL_COBBLES * parcel : 0;
}

/** `parcel_level`: the level parcel `parcel` needs, its number (the 5th parcel needs level 5); 0 outside 1 to `VILLAGE_MAX_PARCELS`. */
export function parcelLevel(parcel: number): number {
  return Number.isInteger(parcel) && parcel >= 1 && parcel <= VILLAGE_MAX_PARCELS ? parcel : 0;
}
