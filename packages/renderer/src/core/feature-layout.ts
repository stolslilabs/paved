import { AreaType, Plan, PlanType, SpotType } from "@paved/game-core";
import type { PlanLayout, SpotCategory } from "./features";

/**
 * What the classifier (`features.ts`, loaded on its own) needs to know of a model, read here from `@paved/game-core`: its
 * plan's layout, its plan key and its palette. The classifier itself imports neither three nor the game's types, so its
 * chunk shares nothing with the board's but `feature-codes.ts`.
 */

/** The plan key's spots in order: the centre, then north-west clockwise to west. */
const SPOTS = [
  SpotType.Center,
  SpotType.NorthWest,
  SpotType.North,
  SpotType.NorthEast,
  SpotType.East,
  SpotType.SouthEast,
  SpotType.South,
  SpotType.SouthWest,
  SpotType.West,
];

/** The areas by code, as a label holds them: 0 for none, 1 to 9 for A to I (the contracts' area codes). */
const AREA_CODES: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9 };

/** The layout of a plan (`PlanLayout`): each spot's category and area code, in plan-key order. */
export function planLayout(planKey: string): PlanLayout {
  const value = planKey.toUpperCase() as PlanType;
  if (!Object.values(PlanType).includes(value) || value === PlanType.None) throw new Error(`features: unknown plan ${planKey}`);
  const plan = new Plan(value);
  const category = plan.unpack().map((c) => c.value as SpotCategory);
  const area = SPOTS.map((spot) => AREA_CODES[plan.area(spot) as AreaType] ?? 0);
  return { category, area };
}

/**
 * The plan key of a model id: a plan key as is, or a variant's path (`models/forest/cccccfffc_HF_1.<hash>.glb`) by its file
 * name. Null when the id names no plan.
 */
export function planKeyOfModel(id: string): string | null {
  const name = id.slice(id.lastIndexOf("/") + 1).split(/[_.]/)[0].toLowerCase();
  return Object.values(PlanType).includes(name.toUpperCase() as PlanType) && name !== "none" ? name : null;
}

/** The palettes whose classes the classifier knows (`PALETTE_CLASSES`). */
export type PaletteName = "base" | "forest";

/**
 * The palette of a model id: a plan key is a base model; a variant's path names its theme's folder
 * (`models/forest/<plan>_HF_<n>.<hash>.glb`). Null for a palette with no class table (another theme): such a model is
 * not labelled, rather than labelled wrong. `features.test.ts` pins each palette's colours, so a changed palette fails
 * there before its classes go stale.
 */
export function paletteOfModel(id: string): PaletteName | null {
  const parts = id.split("/");
  if (parts.length === 1) return "base";
  return parts[parts.length - 2] === "forest" ? "forest" : null;
}
