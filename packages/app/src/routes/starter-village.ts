import { layoutScore, starterLayout } from "@paved/game-core";
import type { VillageLayout } from "../components/containers/layout-rules";
import { boardTilesOf } from "./village-shapes";

/**
 * A starter village (game-core's layouts, picked by the address, scored by the engine): a guest's home, or a player's where the
 * v2 village is not served yet (#753). Loaded on demand: the engine stays out of the home's first chunk.
 */
export function starterVillage(owner: string, address: string | null): VillageLayout {
  const layout = starterLayout(address ? BigInt(address) : 0n);
  return { owner, level: 1, tiles: boardTilesOf(layout), score: layoutScore(layout) };
}
