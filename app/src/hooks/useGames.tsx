import { useEffect, useState } from "react";
import { useDojo } from "@/dojo/useDojo";
import { getComponentValue, Has, HasValue } from "@dojoengine/recs";
import { useEntityQuery } from "@dojoengine/react";
import { Game } from "@/dojo/game/models/game";
import { Mode } from "@/dojo/game/types/mode";

export const useGames = ({ mode }: { mode: Mode }): { games: Game[] } => {
  const [games, setGames] = useState<any>({});

  const {
    setup: {
      clientModels: {
        models: { Game },
        classes: { Game: GameClass },
      },
    },
  } = useDojo();

  const gameKeys = useEntityQuery([
    Has(Game),
    HasValue(Game, { mode: mode.into() }),
    HasValue(Game, { over: true }),
  ]);

  useEffect(() => {
    const components = gameKeys.map((entity) => {
      const component = getComponentValue(Game, entity);
      if (!component) {
        return undefined;
      }
      return new GameClass(component);
    });

    const objectified = components.reduce(
      (obj: any, game: Game | undefined) => {
        if (game) {
          obj[game.id] = game;
        }
        return obj;
      },
      {},
    );

    setGames(objectified);
  }, [gameKeys]);

  return { games: Object.values(games) };
};
