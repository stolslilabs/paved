import { useCallback, useEffect, useState } from "react";
import { LocalSession } from "./local-session";
import type { PageState } from "./page-session";
import { randomSeed } from "./seed";
import { browserStore, loadGame, type KeyValueStore } from "./storage";

/** Resumes the saved game of this browser, or starts one with a random seed. */
export function openTraining(store: () => KeyValueStore | null = browserStore): LocalSession {
  const saved = loadGame(store);
  return (saved && LocalSession.resume(saved, store)) || LocalSession.start(randomSeed(), store);
}

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

/** What the landing card says of the saved game: none (or one that does not replay), in progress, or finished. */
export function savedTrainingStatus(store: () => KeyValueStore | null = browserStore): "none" | "playing" | "over" {
  const saved = loadGame(store);
  const session = saved && LocalSession.resume(saved, store);
  if (!session) return "none";
  return session.state.game?.over ? "over" : "playing";
}
