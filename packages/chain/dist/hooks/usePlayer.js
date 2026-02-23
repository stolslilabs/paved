import { useState, useEffect } from "react";
import { toPlayer } from "../models/adapters";
export function usePlayer(client, playerId) {
    const [player, setPlayer] = useState(null);
    useEffect(() => {
        if (!client || !playerId) {
            setPlayer(null);
            return;
        }
        const unsub = client.subscribeToEntityUpdates((entity) => {
            if (entity.model === "Player" && entity.data?.id === playerId) {
                setPlayer(toPlayer(entity.data));
            }
        });
        return unsub;
    }, [client, playerId]);
    return { player };
}
//# sourceMappingURL=usePlayer.js.map