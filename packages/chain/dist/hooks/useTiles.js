import { useState, useEffect } from "react";
import { toTile } from "../models/adapters";
export function useTiles(client, gameId) {
    const [tiles, setTiles] = useState(new Map());
    useEffect(() => {
        if (!client || gameId == null) {
            setTiles(new Map());
            return;
        }
        const unsub = client.subscribeToEntityUpdates((entity) => {
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
//# sourceMappingURL=useTiles.js.map