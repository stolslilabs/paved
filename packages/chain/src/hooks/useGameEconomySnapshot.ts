import { useEffect, useState } from "react";
import type { ChainClient } from "../client";

export interface GameEconomySnapshot {
  gameId: number;
  entryMultiplierFp: number;
  entrySupplySnapshot: string;
  entryTargetSnapshot: string;
}

export function useGameEconomySnapshot(client: ChainClient | null, gameId: number | null) {
  const [snapshot, setSnapshot] = useState<GameEconomySnapshot | null>(null);

  useEffect(() => {
    if (!client || gameId == null) {
      setSnapshot(null);
      return;
    }

    const unsub = client.subscribeToEntityUpdates((entity: any) => {
      if (entity.model !== "Game" || Number(entity.data?.id) !== gameId) return;

      setSnapshot({
        gameId,
        entryMultiplierFp: Number(entity.data?.entry_multiplier_fp ?? 0),
        entrySupplySnapshot: String(entity.data?.entry_supply_snapshot ?? "0"),
        entryTargetSnapshot: String(entity.data?.entry_target_snapshot ?? "0"),
      });
    });

    return unsub;
  }, [client, gameId]);

  return { snapshot };
}
