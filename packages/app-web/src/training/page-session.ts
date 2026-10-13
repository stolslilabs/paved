import type { GameView, GameKey, PlaceMove, SessionState, WriteResult } from "@paved/chain";

/** What a move sends on chain; a local session never calls it. */
export type Send = () => Promise<WriteResult>;

/** What `Game.tsx` reads of a session's state: `SessionState` (chain) and `LocalSession`'s both have it. */
export type PageState = Pick<
  SessionState,
  "status" | "error" | "message" | "tiles" | "hand" | "lastScored" | "readonly" | "pending" | "writeError" | "readError"
> & {
  key: Pick<GameKey, "gameId">;
  game: Pick<GameView, "playerId" | "score" | "over" | "placedCount" | "deckSize" | "discardedCount"> | null;
};

/** What `Game.tsx` drives: `GameSession` satisfies it unchanged, `LocalSession` runs the engine. */
export interface PageSession {
  readonly state: PageState;
  place(move: PlaceMove, send: Send): Promise<boolean>;
  discard(send: Send): Promise<boolean>;
  surrender(send: Send): Promise<boolean>;
}

/** The writes of a game on chain, for the page; null when there is no writer (read only). */
export interface MoveSenders {
  build(move: PlaceMove): Promise<WriteResult>;
  discard(): Promise<WriteResult>;
  surrender(): Promise<WriteResult>;
}
