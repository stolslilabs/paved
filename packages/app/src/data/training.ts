import { useCallback, useState, useSyncExternalStore } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { LocalSession, loadGame, openTraining, randomSeed, type PageState } from "@paved/game-core";
import type { BoardSceneProps } from "../components/scenes/board-scene";
import type { TrainingSave } from "../components/scenes/home-scene";
import { queryKeys } from "./keys";
import { trainingStore, useDataSources } from "./sources";

/** The board scene's data a session gives (the hand's orientation and state are the page's). */
export type SessionBoard = Pick<BoardSceneProps, "tiles" | "score" | "remaining" | "lastScored"> & {
  /** The tile in hand, null once the game is over. */
  hand: { plan: number } | null;
  over: boolean;
};

/**
 * The tiles left to play, the one in hand included: the deck's size less the tiles placed (the starter counts as
 * placed, as on chain) and the tiles discarded, so a discard counts as spent (P3).
 */
export const remainingOf = (game: NonNullable<PageState["game"]>): number => Math.max(0, game.deckSize - game.placedCount - game.discardedCount);

/** A session's state as the board scene reads it. */
export function boardOf(state: PageState): SessionBoard {
  return {
    tiles: state.tiles,
    score: state.game?.score ?? 0,
    remaining: state.game ? remainingOf(state.game) : 0,
    lastScored: state.lastScored,
    hand: state.hand ? { plan: state.hand.plan } : null,
    over: state.game?.over ?? false,
  };
}

/**
 * The board's session in Training: the saved game of this browser resumed (replayed once), or a new one; each move is
 * applied to the session's engine, never replayed (`LocalSession`). `newGame` starts another seed. The state is read
 * with `useSyncExternalStore`, so a move re-renders the board once.
 */
export function useTrainingSession(): { session: LocalSession; state: PageState; board: SessionBoard; newGame: () => void } {
  const sources = useDataSources();
  const store = trainingStore(sources);
  const [session, setSession] = useState(() => openTraining(store));
  const subscribe = useCallback((listener: () => void) => session.subscribe(listener), [session]);
  const state = useSyncExternalStore(subscribe, () => session.state);
  const newGame = useCallback(() => setSession(LocalSession.start(randomSeed(), store)), [store]);
  return { session, state, board: boardOf(state), newGame };
}

/** The home scene's `training`: the saved game's score and tiles left; null when none is saved or it is over. */
export function useTrainingSave(): UseQueryResult<TrainingSave | null> {
  const sources = useDataSources();
  return useQuery({
    queryKey: queryKeys.local.trainingSave(),
    queryFn: () => {
      const store = trainingStore(sources);
      const saved = loadGame(store);
      const session = saved && LocalSession.resume(saved, store);
      const game = session?.state.game;
      return game && !game.over ? { score: game.score, remaining: remainingOf(game) } : null;
    },
  });
}
