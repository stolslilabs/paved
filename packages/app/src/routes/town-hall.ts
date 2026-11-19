import { TOWN_HALL_LEVELS, townHallPlayerLevel, townHallPrice, townHallSlots } from "@paved/game-core";
import type { TownHallProps } from "../components/containers/town-hall-dialog";
import { useCobbleAccount } from "../data/cobbles";
import type { FreeVillageHeld } from "../data/free-village-base";
import { useTownHallWrites } from "../data/town-hall";
import { refusalText } from "./village-shapes";

// The Town Hall's upgrade as the home's stage wires it (TOWN-HALL): the level read with the village, the rule's price and
// player level, the Cobbles held, the write. In the stage's chunk, never the home's first one.

/** The Town Hall's props for the player's own village, or undefined where the upgrade is not served or the village not read. */
export function useStageTownHall(playerId: string | null, village: Pick<FreeVillageHeld, "level" | "townHall"> | null | undefined): TownHallProps | undefined {
  const writes = useTownHallWrites(playerId);
  const cobbles = useCobbleAccount(writes.signer ? playerId : null).data?.cobbles ?? null;
  if (!village || !writes.signer) return undefined;
  const level = village.townHall;
  const last = level >= TOWN_HALL_LEVELS;
  const price = townHallPrice(level);
  return {
    level,
    slots: townHallSlots(level),
    next: last ? null : { slots: townHallSlots(level + 1), price, playerLevel: townHallPlayerLevel(level) },
    playerLevel: village.level,
    cobbles,
    busy: writes.pending,
    error: writes.error ? refusalText(writes.error) : null,
    onUpgrade: () => {
      writes.reset();
      void writes.upgrade({ confirmedPrice: price }).catch(() => undefined);
    },
    onDismissError: writes.reset,
  };
}
