// The village's territory (#640, `docs/architecture/village-territory.md`), as `contracts/src/systems/village.cairo`
// rules it: the 3 x 3 of the start around the starter, parcels bought one by one next to an owned cell, at most 38
// cells, each parcel gated by the player's level and priced in Cobbles. Relative coordinates (the starter at (0, 0)).

/** A cell of a territory, relative to the starter. */
export interface Cell {
  readonly x: number;
  readonly y: number;
}

/** The most cells a village owns, the 9 of the start included (`MAX_CELLS`). */
export const VILLAGE_MAX_CELLS = 38;
/** The cells of the start (`START_CELLS`). */
export const VILLAGE_START_CELLS = 9;
/** The most parcels a village buys (`MAX_PARCELS`). */
export const VILLAGE_MAX_PARCELS = VILLAGE_MAX_CELLS - VILLAGE_START_CELLS;
/** The Cobbles of parcel `k` are `PARCEL_COBBLES x k` (`PARCEL_COBBLES`). */
export const PARCEL_COBBLES = 10;

/** The Cobbles of a chain day's first demolition (`DEMOLITION_COBBLES`); each one doubles the next. */
export const DEMOLITION_COBBLES = 5;
/** The exponent stops here (`MAX_DOUBLINGS`): `5 x 2^29`, the last price under a `u32` (what `Setup.spend_cobbles` takes). */
export const MAX_DOUBLINGS = 29;

/** `demolition_price`: the Cobbles of a demolition after `count` of them that chain day (5, 10, 20, 40...). */
export function demolitionPrice(count: number): number {
  return DEMOLITION_COBBLES * 2 ** Math.min(Math.max(0, Math.floor(count)), MAX_DOUBLINGS);
}

/** The 9 cells of the start, as `Village.cells` lists them: rows from the south, west to east. */
export function startTerritory(): Cell[] {
  const cells: Cell[] = [];
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) cells.push({ x, y });
  return cells;
}

/** `parcel_price`: the Cobbles of parcel `parcel` (1 to 29), 0 otherwise. */
export function parcelPrice(parcel: number): number {
  return Number.isInteger(parcel) && parcel >= 1 && parcel <= VILLAGE_MAX_PARCELS ? PARCEL_COBBLES * parcel : 0;
}

/** `parcel_level`: the level parcel `parcel` needs, its number (the 5th parcel needs level 5); 0 outside 1 to 29. */
export function parcelLevel(parcel: number): number {
  return Number.isInteger(parcel) && parcel >= 1 && parcel <= VILLAGE_MAX_PARCELS ? parcel : 0;
}
