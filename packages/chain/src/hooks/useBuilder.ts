import { useState, useEffect } from "react";
import { Builder } from "@paved/game-core";
import type { ChainClient } from "../client";
import { toBuilder } from "../models/adapters";

export function useBuilder(
  client: ChainClient | null,
  gameId: number | null,
  playerId: string | null
) {
  const [builder, setBuilder] = useState<Builder | null>(null);

  useEffect(() => {
    if (!client || gameId == null || !playerId) {
      setBuilder(null);
      return;
    }

    const unsub = client.subscribeToEntityUpdates((entity: any) => {
      if (
        entity.model === "Builder" &&
        Number(entity.data?.game_id) === gameId &&
        entity.data?.player_id === playerId
      ) {
        setBuilder(toBuilder(entity.data));
      }
    });

    return unsub;
  }, [client, gameId, playerId]);

  return { builder };
}
