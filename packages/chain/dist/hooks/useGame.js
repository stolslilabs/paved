import { useState, useEffect } from "react";
import { toGame } from "../models/adapters";
export function useGame(client, gameId) {
    const [game, setGame] = useState(null);
    useEffect(() => {
        if (!client || gameId == null) {
            setGame(null);
            return;
        }
        // Subscribe to game entity updates
        const unsub = client.subscribeToEntityUpdates((entity) => {
            if (entity.model === "Game" && Number(entity.data?.id) === gameId) {
                setGame(toGame(entity.data));
            }
        });
        return unsub;
    }, [client, gameId]);
    return { game };
}
//# sourceMappingURL=useGame.js.map