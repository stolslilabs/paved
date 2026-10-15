import { useCallback, useEffect, useState } from "react";
import { LocalSession, browserStore, openTraining, randomSeed, type PageState } from "@paved/game-core";

export { openTraining, savedTrainingStatus } from "@paved/game-core";

/** The Training game of the page: the saved one on load, a new seed on `newGame`. */
export function useTrainingSession(): { session: LocalSession; state: PageState; newGame: () => void } {
  const [session, setSession] = useState(() => openTraining());
  const [state, setState] = useState(session.state);
  useEffect(() => {
    setState(session.state);
    return session.subscribe(setState);
  }, [session]);
  const newGame = useCallback(() => setSession(LocalSession.start(randomSeed(), browserStore)), []);
  return { session, state, newGame };
}
