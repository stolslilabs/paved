import { Plan, PlanType, getPlanKey } from "@paved/game-core";

/**
 * The board's tile skins (SKIN-RENDER): each plan drawn with its player's active theme (`Setup`'s skins, cobbles v1, part 3),
 * one of the theme's variants per tile. The variants come from the manifest's `themes` (`AssetManifest`); a theme or a
 * plan it does not list, theme 0 (the default) and a variant that does not load draw the plan's base model.
 */

/** The theme of each plan key (`ccccccccc` to its theme id on chain); a plan not named, or at 0, draws its base model. */
export type TileSkins = Readonly<Record<string, number>>;

/** No skin: every tile draws its base model. */
export const NO_SKINS: TileSkins = Object.freeze({});

/**
 * The skins of an active set as the chain reads it (`active_skins(player)`: the theme of plan `p` at `p - 1`, plan 1
 * first, plan numbers as `Plan.from`'s): each plan key to its theme, the plans at 0 left out.
 */
export function skinsOf(active: readonly number[]): TileSkins {
  const skins: Record<string, number> = {};
  active.forEach((theme, i) => {
    const plan = Object.values(PlanType)[i + 1];
    if (theme && plan && plan !== PlanType.None) skins[getPlanKey(plan)] = theme;
  });
  return skins;
}

/**
 * The variant hash of a tile, as origin/dev's `getVarietyModelPath` (`app/src/dojo/game/models/tile.ts`) computed it: over
 * the text `${plan}${x}${y}${gameId}`, the plan as its upper-case name (`CCCCCCCCC`), x and y the contracts' (the board
 * centre is 2147483647), each character shifted in (`h * 31 + c`) then the word rotated left by 13, in 32-bit integers.
 * Every viewer of a game, and every reload, gets the same value.
 */
export function variantHash(plan: number, x: number, y: number, gameId: number): number {
  const input = `${Plan.from(plan).value}${x}${y}${gameId}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    hash = (hash << 13) | (hash >>> 19);
  }
  return hash;
}

/**
 * The variant a hash picks among `count` (0-based), as origin/dev's `Math.abs(hash) % count`: a plan with fewer variants
 * takes the remainder by its own count, so every index is a variant it has (one variant: always the first).
 */
export function variantIndex(hash: number, count: number): number {
  return count > 0 ? Math.abs(hash) % count : 0;
}

/** What picks a tile's model: its plan key's theme in `skins`, and its variant hash. */
export interface SkinRef {
  theme: number;
  hash: number;
}

/** The skin of a tile at (x, y) of game `gameId`, or null when its plan draws the base model (no theme, or theme 0). */
export function skinRef(skins: TileSkins, plan: number, x: number, y: number, gameId: number): SkinRef | null {
  const theme = skins[getPlanKey(Plan.from(plan).value)] ?? 0;
  return theme ? { theme, hash: variantHash(plan, x, y, gameId) } : null;
}
