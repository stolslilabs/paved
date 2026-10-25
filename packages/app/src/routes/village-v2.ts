import { deckArt } from "../components/containers/deck-sheet";
import type { TileArt } from "../components/elements/tile-chip";
import { useBoardSkins } from "../data/board-skins";
import { RENDERER_ASSETS } from "../data/renderer-manifest";
import { useTileArt } from "../data/tile-art";
import { useTileRenders } from "../data/tile-renders";

// What the v2 village's pages (#739: `/village`, `/village/chests`, `/village/shop`) share: the shapes between the hooks
// (`data/free-village.ts`, game-core's codes, the starter left out) and the scenes (`BoardTile`s, the starter included), the
// tile art in the owner's skins, and a refusal in words. The shapes and the words are `village-shapes.ts`, which the home reads
// without the art (#753).

/** Each tile in the theme its owner made active, its top-down render, else the base art (as the boards draw them). */
export function useVillageArt(playerId: string | null): TileArt | undefined {
  const skins = useBoardSkins(playerId);
  const renders = useTileRenders(RENDERER_ASSETS);
  return deckArt(renders, skins, useTileArt(RENDERER_ASSETS));
}

export { boardTilesOf, countsByPlan, layoutTilesOf, refusalText } from "./village-shapes";
