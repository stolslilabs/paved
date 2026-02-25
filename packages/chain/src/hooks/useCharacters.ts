import { useState, useEffect } from "react";
import { Character } from "@paved/game-core";
import type { ChainClient } from "../client";
import { toCharacter } from "../models/adapters";

export function useCharacters(
  client: ChainClient | null,
  gameId: number | null,
  playerId: string | null
) {
  const [characters, setCharacters] = useState<Character[]>([]);

  useEffect(() => {
    if (!client || gameId == null || !playerId) {
      setCharacters([]);
      return;
    }

    const unsub = client.subscribeToEntityUpdates((entity: any) => {
      if (
        entity.model === "Char" &&
        Number(entity.data?.game_id) === gameId &&
        entity.data?.player_id === playerId
      ) {
        const char = toCharacter(entity.data);
        setCharacters((prev) => {
          const next = prev.filter((c) => c.index !== char.index);
          next.push(char);
          return next.sort((a, b) => a.index - b.index);
        });
      }
    });

    return unsub;
  }, [client, gameId, playerId]);

  return { characters };
}
