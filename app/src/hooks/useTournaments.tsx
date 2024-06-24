import { useEffect, useState } from "react";
import { useDojo } from "@/dojo/useDojo";
import { getComponentValue, Has, HasValue } from "@dojoengine/recs";
import { useEntityQuery } from "@dojoengine/react";
import { Tournament } from "@/dojo/game/models/tournament";

export const useTournaments = (): { tournaments: Tournament[] } => {
  const [tournaments, setTournaments] = useState<any>({});

  const {
    setup: {
      clientModels: {
        models: { Tournament },
        classes: { Tournament: TournamentClass },
      },
    },
  } = useDojo();

  const tournamentKeys = useEntityQuery([Has(Tournament)]);

  useEffect(() => {
    const components = tournamentKeys.map((entity) => {
      const component = getComponentValue(Tournament, entity);
      if (!component) {
        return undefined;
      }
      return new TournamentClass(component);
    });

    const objectified = components.reduce(
      (obj: any, tournament: Tournament | undefined) => {
        if (tournament) {
          obj[tournament.id] = tournament;
        }
        return obj;
      },
      {},
    );

    setTournaments(objectified);
  }, [tournamentKeys]);

  return { tournaments: Object.values(tournaments) };
};
