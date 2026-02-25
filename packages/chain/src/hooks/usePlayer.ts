import { useState, useEffect } from "react";
import { Player } from "@paved/game-core";
import type { ChainClient } from "../client";
import { toPlayer } from "../models/adapters";

export function usePlayer(client: ChainClient | null, playerId: string | null) {
  const [player, setPlayer] = useState<Player | null>(null);

  useEffect(() => {
    if (!client || !playerId) {
      setPlayer(null);
      return;
    }

    const unsub = client.subscribeToEntityUpdates((entity: any) => {
      if (entity.model === "Player" && entity.data?.id === playerId) {
        setPlayer(toPlayer(entity.data));
      }
    });

    return unsub;
  }, [client, playerId]);

  return { player };
}
