// Rotation and lookups on the plan tables, as `contracts/src/structure/tables.cairo` and
// `oriented.cairo` answer them for a placed tile. Codes are the contracts' (see `tables.ts`).

import { PLAN_ROWS, type AreaRow, type PlanRow } from "./tables";

export const NO_RECORD = 15;
export const NORTH = 2;
export const EAST = 4;
export const SOUTH = 6;
export const WEST = 8;

export const CATEGORY_FOREST = 1;
export const CATEGORY_ROAD = 2;
export const CATEGORY_CITY = 3;
export const CATEGORY_WONDER = 5;

/** The row of a plan code; throws for an unknown plan. */
export function planRow(plan: number): PlanRow {
  const row = PLAN_ROWS[plan];
  if (!row) throw new Error(`Engine: unknown plan ${plan}`);
  return row;
}

/** The row of an area of a plan, or `null` when the plan has no such area. */
export function areaRow(plan: number, area: number): AreaRow | null {
  return planRow(plan).areas[area - 1] ?? null;
}

/** Quarter turns of an orientation code (1 north .. 4 west). */
export function turns(orientation: number): number {
  if (orientation < 1 || orientation > 4) throw new Error("Tables: invalid orientation");
  return orientation - 1;
}

/** Rotates a direction clockwise by `count` quarter turns. */
export function rotateDirection(direction: number, count: number): number {
  return direction === 0 ? 0 : ((direction - 1 + 2 * count) % 8) + 1;
}

/** Rotates a spot clockwise by `count` quarter turns (the center and none stay). */
export function rotateSpot(spot: number, count: number): number {
  return spot < 2 ? spot : ((spot - 2 + 2 * count) % 8) + 2;
}

/** Returns the opposite direction. */
export function opposite(direction: number): number {
  return rotateDirection(direction, 2);
}

/** The area on `spot` of a tile of `plan` placed with `orientation` (0 for no spot). */
export function areaAt(plan: number, orientation: number, spot: number): number {
  if (spot < 1 || spot > 9) return 0;
  const north = rotateSpot(spot, (4 - turns(orientation)) % 4);
  return planRow(plan).spots[north - 1];
}

/** The moves `[direction, spot]` of an area of a placed tile, rotated by its orientation. */
export function movesOf(plan: number, orientation: number, area: number): [number, number][] {
  const row = areaRow(plan, area);
  if (!row) return [];
  const count = turns(orientation);
  return row.moves.map(([direction, spot]) => [
    rotateDirection(direction, count),
    rotateSpot(spot, count),
  ]);
}

/** The category code of an area of a plan (0 when the plan has no such area). */
export function categoryOf(plan: number, area: number): number {
  return areaRow(plan, area)?.category ?? 0;
}

/** The areas of a plan that have moves, in area order: those a placed tile puts on the state. */
export function recordAreas(plan: number): number[] {
  const areas: number[] = [];
  planRow(plan).areas.forEach((row, index) => {
    if (row && row.recordIndex !== NO_RECORD) areas.push(index + 1);
  });
  return areas;
}

/** The wonder area of a plan, 0 for a plan without a wonder (`oriented::wonder_area`). */
export function wonderArea(plan: number): number {
  const row = planRow(plan);
  return row.wonder === 0 ? 0 : row.spots[row.wonder - 1];
}

/**
 * The category of the middle spot of the edge of a placed tile that looks in `direction` (2, 4,
 * 6 or 8): what two facing edges must share (`placement::edge_category`).
 */
export function edgeCategory(plan: number, orientation: number, direction: number): number {
  const key = (plan * 5 + orientation) * 9 + direction;
  let category = EDGE_CACHE[key];
  if (category === undefined) {
    category = categoryOf(plan, areaAt(plan, orientation, direction + 1));
    EDGE_CACHE[key] = category;
  }
  return category;
}
const EDGE_CACHE: number[] = [];

/** The position next to `(x, y)` in `direction` (y grows to the north). */
export function toward(x: number, y: number, direction: number): [number, number] {
  switch (direction) {
    case 1:
      return [x - 1, y + 1];
    case 2:
      return [x, y + 1];
    case 3:
      return [x + 1, y + 1];
    case 4:
      return [x + 1, y];
    case 5:
      return [x + 1, y - 1];
    case 6:
      return [x, y - 1];
    case 7:
      return [x - 1, y - 1];
    default:
      return [x - 1, y];
  }
}
