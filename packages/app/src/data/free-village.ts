import { useMemo } from "react";
import { freeInventory } from "@paved/game-core";
import { useFreeVillageHeld, type FreeVillageHeld, type Result } from "./free-village-base";

export * from "./free-village-base";

// PvP v2's village side (#741): `free-village-base.ts` holds the reads, the writes and their shapes; this module adds the free
// count, game-core's rule, whose engine stays out of the home's first chunk (#753).

/** A village with its inventory: what the editor and the village screen show. */
export interface FreeVillageData extends FreeVillageHeld {
  /** The inventory's tiles not placed, by plan. */
  free: number[];
}

/**
 * A player's village and inventory (#739's screens): `freeVillage` and `inventory` joined, with the tiles not placed. Null where
 * they are not served (the chain before step 3); disabled without a player.
 */
export function useFreeVillage(playerId: string | null): Result<FreeVillageData> {
  const held = useFreeVillageHeld(playerId);
  const data = useMemo(() => (held.data ? { ...held.data, free: freeInventory(held.data.inventory, held.data.tiles) } : held.data), [held.data]);
  return { ...held, data };
}
