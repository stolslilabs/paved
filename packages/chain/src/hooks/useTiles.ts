import { useState, useEffect, useCallback } from "react";
import { Tile } from "@paved/game-core";
import type { ChainClient } from "../client";
import { toTile } from "../models/adapters";

export function useTiles(client: ChainClient | null, gameId: number | null) {
  const [tiles, setTiles] = useState<Map<string, Tile>>(new Map());

  useEffect(() => {
    if (!client || gameId == null) {
      setTiles(new Map());
      return;
    }

    const unsub = client.subscribeToEntityUpdates((entity: any) => {
      if (entity.model === "Tile" && Number(entity.data?.game_id) === gameId) {
        const tile = toTile(entity.data);
        setTiles((prev) => {
          const next = new Map(prev);
          next.set(`${tile.gameId}-${tile.id}`, tile);
          return next;
        });
      }
    });

    return unsub;
  }, [client, gameId]);

  const tilesArray = Array.from(tiles.values());

  return { tiles: tilesArray, tilesMap: tiles };
}
