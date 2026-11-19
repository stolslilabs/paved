import * as THREE from "three";
import { Plan, TOWN_HALL_LEVELS, TOWN_HALL_TILES, type TownHallTile, getPlanKey, townHallLevel } from "@paved/game-core";
import { TOWN_HALL_THEME, type SkinRef } from "./skins";

/**
 * The Town Hall (TOWN-HALL): a 2 x 2 tile, four cells on the board (`TOWN_HALL_TILES`), drawn as one model cut in four. Each
 * cell is a tile model as the others are (40 x 40 columns, in its plan's own frame), listed by the manifest as a variant of
 * its plan under `TOWN_HALL_THEME` (the manifest's `townHall`): the variant `level`, plus `TOWN_HALL_LEVELS` for the second cell of a plan. A host
 * with no manifest, or a model that fails, draws the four plans' base models: the same edges, without the hall.
 */

/** The plan key of a plan code. */
const getKey = (plan: number): string => getPlanKey(Plan.from(plan).value);

/** A cell's place among the Town Hall's cells of its plan: 0, or 1 for the second one. */
const setOf = (cell: TownHallTile): number => TOWN_HALL_TILES.filter((t) => t.plan === cell.plan).indexOf(cell);

/** The skin that draws `cell` of a Town Hall at `level` (`TileRenderData.skin`). */
export function townHallSkin(cell: TownHallTile, level: number): SkinRef {
  return { theme: TOWN_HALL_THEME, hash: townHallLevel(level) - 1 + TOWN_HALL_LEVELS * setOf(cell) };
}

/** The Town Hall cell a tile at the village's (x, y) is (relative to the Town Hall's south-west cell), or null. */
export const townHallCell = (x: number, y: number): TownHallTile | null => TOWN_HALL_TILES.find((t) => t.x === x && t.y === y) ?? null;

/** North, east, south, west as steps of the village's cells (y north). */
const STEPS = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;

/**
 * The sides of a Town Hall cell's model that join another cell, in the model's own frame (north, east, south, west before
 * its orientation turns it), or null for a model that is no Town Hall cell (`models/townhall/<plan>_TH_<n>.<hash>.glb`).
 */
export function townHallSeams(modelId: string): readonly [boolean, boolean, boolean, boolean] | null {
  const match = /(?:^|\/)townhall\/([a-z]{9})_TH_(\d+)\./.exec(modelId);
  if (!match) return null;
  const set = Math.floor((Number(match[2]) - 1) / TOWN_HALL_LEVELS);
  const cell = TOWN_HALL_TILES.filter((t) => getKey(t.plan) === match[1])[set];
  if (!cell) return null;
  const seams: [boolean, boolean, boolean, boolean] = [false, false, false, false];
  STEPS.forEach(([dx, dy], world) => {
    if (!townHallCell(cell.x + dx, cell.y + dy)) return;
    // Orientation code 1 north to 4 west: the model's side `s` looks to the world's side `s + turns` (east is one turn clockwise).
    seams[(world - (cell.orientation - 1) + 4) % 4] = true;
  });
  return seams;
}


/**
 * `edges` (a model's crease segments, `buildEdgesGeometry`) without the ones that lie on a seam: a border plane of the model
 * (`geometry`'s box) where the next cell of the Town Hall carries the model on, so no line cuts the hall or its walls in four.
 * The model's frame: x east, y south, as the tile models are stored (their node turns z up).
 */
export function withoutSeamEdges(edges: THREE.BufferGeometry, geometry: THREE.BufferGeometry, seams: readonly [boolean, boolean, boolean, boolean]): THREE.BufferGeometry {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const eps = Math.max(box.max.x - box.min.x, box.max.y - box.min.y) * 1e-3;
  // [axis, value] of each seam plane: north the least y, east the most x, south the most y, west the least x.
  const planes = [[1, box.min.y], [0, box.max.x], [1, box.max.y], [0, box.min.x]].filter((_, side) => seams[side]) as Array<[number, number]>;
  const position = edges.getAttribute("position");
  const kept: number[] = [];
  for (let i = 0; i + 1 < position.count; i += 2) {
    const a = [position.getX(i), position.getY(i), position.getZ(i)];
    const b = [position.getX(i + 1), position.getY(i + 1), position.getZ(i + 1)];
    if (planes.some(([axis, value]) => Math.abs(a[axis]! - value) < eps && Math.abs(b[axis]! - value) < eps)) continue;
    kept.push(...a, ...b);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(kept, 3));
  edges.dispose();
  return out;
}
