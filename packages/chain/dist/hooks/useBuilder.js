import { useState, useEffect } from "react";
import { toBuilder } from "../models/adapters";
export function useBuilder(client, gameId, playerId) {
    const [builder, setBuilder] = useState(null);
    useEffect(() => {
        if (!client || gameId == null || !playerId) {
            setBuilder(null);
            return;
        }
        const unsub = client.subscribeToEntityUpdates((entity) => {
            if (entity.model === "Builder" &&
                Number(entity.data?.game_id) === gameId &&
                entity.data?.player_id === playerId) {
                setBuilder(toBuilder(entity.data));
            }
        });
        return unsub;
    }, [client, gameId, playerId]);
    return { builder };
}
//# sourceMappingURL=useBuilder.js.map