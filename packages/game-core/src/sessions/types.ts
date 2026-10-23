// The shapes a game page reads of a session. `@paved/chain` depends on this package, so these are structural copies
// of the chain's types (`BoardTile`, `PlaceMove`, `ScoredStructure`, `SessionState`): its `GameSession` satisfies
// `PageSession` unchanged, and nothing here imports the chain.

/** A tile on the board, in the chain's absolute coordinates (the starter at `CENTER`, `CENTER`). */
export interface BoardTile {
  id: number;
  plan: number;
  orientation: number;
  x: number;
  y: number;
  /** Drawn by the client, not yet confirmed by a receipt. */
  pending?: boolean;
}

/** The placement of the tile in hand, in the chain's absolute coordinates. */
export interface PlaceMove {
  orientation: number;
  x: number;
  y: number;
}

/** A structure a move closed (one `Scored` event): its category as its code, its size and its points. */
export interface ScoredStructure {
  category: number;
  size: number;
  points: number;
}

/** A closed structure as the closures list shows it: the same shape as a `Scored` event. */
export type Closure = ScoredStructure;

/** What the game page reads of a session's state: the chain's `SessionState` and `LocalSession`'s both have it. */
export interface PageState {
  key: { gameId: number };
  status: "loading" | "ready" | "error";
  /** Why the game cannot be shown (the chain's `ViewErrorKind`); null otherwise. */
  error: string | null;
  message: string | null;
  game: {
    playerId: string;
    score: number;
    over: boolean;
    placedCount: number;
    deckSize: number;
    discardedCount: number;
  } | null;
  tiles: BoardTile[];
  /** Chain plan ids of the discarded tiles (the deck sheet crosses them out); absent when the session does not give them. */
  discardedPlans?: number[];
  hand: { tileId: number; plan: number } | null;
  /**
   * The tiles known after the one in hand, in draw order (#645): the next and the one after it, fewer at the deck's end.
   * Read only: only the tile in hand is placed. A Story level gives the next two of its fixed order (`StoryRun`). Absent or
   * empty when the session knows none (a game drawn one tile at a time).
   */
  coming?: { tileId: number; plan: number }[];
  /**
   * The chain is drawing the queue's last tile (a VRF Challenge, a move sent and not yet confirmed): the hand panel shows
   * its slot waiting. The tiles already known stay shown.
   */
  drawing?: boolean;
  lastScored: ScoredStructure[];
  readonly: boolean;
  pending: boolean;
  writeError: string | null;
  readError: string | null;
}

/** What a move sends on chain (the chain's `WriteResult` as `R`); a local session never calls it. */
export type Send<R = unknown> = () => Promise<R>;

/** What the game page drives: the chain's `GameSession` satisfies it unchanged, `LocalSession` runs the engine. */
export interface PageSession<R = unknown> {
  readonly state: PageState;
  place(move: PlaceMove, send: Send<R>): Promise<boolean>;
  discard(send: Send<R>): Promise<boolean>;
  surrender(send: Send<R>): Promise<boolean>;
}

/** The writes of a game on chain, for the page; null when there is no writer (read only). */
export interface MoveSenders<R = unknown> {
  build(move: PlaceMove): Promise<R>;
  discard(): Promise<R>;
  surrender(): Promise<R>;
}
