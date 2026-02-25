import { useState, useEffect, useCallback } from "react";
import { Game } from "@paved/game-core";
import type { ChainClient } from "../client";
import { toGame } from "../models/adapters";

export function useGame(client: ChainClient | null, gameId: number | null) {
  const [game, setGame] = useState<Game | null>(null);

  useEffect(() => {
    if (!client || gameId == null) {
      setGame(null);
      return;
    }

    // Subscribe to game entity updates
    const unsub = client.subscribeToEntityUpdates((entity: any) => {
      if (entity.model === "Game" && Number(entity.data?.id) === gameId) {
        setGame(toGame(entity.data));
      }
    });

    return unsub;
  }, [client, gameId]);

  return { game };
}
