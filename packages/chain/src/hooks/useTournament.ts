import { useState, useEffect } from "react";
import { Tournament } from "@paved/game-core";
import type { ChainClient } from "../client";
import { toTournament } from "../models/adapters";

export function useTournament(
  client: ChainClient | null,
  tournamentId: number | null
) {
  const [tournament, setTournament] = useState<Tournament | null>(null);

  useEffect(() => {
    if (!client || tournamentId == null) {
      setTournament(null);
      return;
    }

    const unsub = client.subscribeToEntityUpdates((entity: any) => {
      if (entity.model === "Tournament" && Number(entity.data?.id) === tournamentId) {
        setTournament(toTournament(entity.data));
      }
    });

    return unsub;
  }, [client, tournamentId]);

  return { tournament };
}
