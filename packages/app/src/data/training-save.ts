import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { loadGame, type PageState } from "@paved/game-core";
import type { TrainingSave } from "../components/scenes/home-scene";
import { queryKeys } from "./keys";
import { trainingStore, useDataSources } from "./sources";

// The Training save as the home card reads it. Apart from `data/training.ts` so that the first route does not load the
// engine: the module that replays the save (`training-resume.ts`, the engine) is fetched by the query, after the first paint.

/**
 * The tiles left to play, the one in hand included: the deck's size less the tiles placed (the starter counts as
 * placed, as on chain) and the tiles discarded, so a discard counts as spent (P3).
 */
export const remainingOf = (game: NonNullable<PageState["game"]>): number => Math.max(0, game.deckSize - game.placedCount - game.discardedCount);

/** The home scene's `training`: the saved game's score and tiles left; null when none is saved or it is over. */
export function useTrainingSave(): UseQueryResult<TrainingSave | null> {
  const sources = useDataSources();
  return useQuery({
    queryKey: queryKeys.local.trainingSave(),
    queryFn: async () => {
      const store = trainingStore(sources);
      const saved = loadGame(store);
      if (!saved) return null;
      const game = (await import("./training-resume")).resumedGame(saved, store);
      return game && !game.over ? { score: game.score, remaining: remainingOf(game) } : null;
    },
  });
}
