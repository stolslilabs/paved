import type { TileArt } from "../components/elements/tile-chip";
import { useBoardSkins } from "../data/board-skins";
import { RENDERER_ASSETS } from "../data/renderer-manifest";
import { useTileRenders } from "../data/tile-renders";

/**
 * Each tile's angled render in the theme its owner made active, else the base theme's (CHESTS-PAGE: the chests' cards, the book's 3D
 * tiles). A module of its own, read by the chests' chunks alone: `village-v2.ts` is the home's.
 */
export function useAngledArt(playerId: string | null): TileArt | undefined {
  const skins = useBoardSkins(playerId);
  const renders = useTileRenders(RENDERER_ASSETS);
  return renders && ((key) => renders(skins[key] ?? 0, key) ?? renders(0, key));
}
