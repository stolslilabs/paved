import { useState, useEffect } from "react";
import { toTournament } from "../models/adapters";
export function useTournament(client, tournamentId) {
    const [tournament, setTournament] = useState(null);
    useEffect(() => {
        if (!client || tournamentId == null) {
            setTournament(null);
            return;
        }
        const unsub = client.subscribeToEntityUpdates((entity) => {
            if (entity.model === "Tournament" && Number(entity.data?.id) === tournamentId) {
                setTournament(toTournament(entity.data));
            }
        });
        return unsub;
    }, [client, tournamentId]);
    return { tournament };
}
//# sourceMappingURL=useTournament.js.map