import type { ClosedTileAreas, PageState, ScoredStructure } from "@paved/game-core";
import type { BoardSceneProps } from "../components/scenes/board-scene";

// What a board reads of its session's state: `boardOf` the Puzzle's, the Joust's and the Tournament's; `remainingOf` a Challenge's and a
// Story level's too.

/**
 * The tiles left to play, the one in hand included: the deck's size less the tiles placed (the starter counts as
 * placed, as on chain) and the tiles discarded, so a discard counts as spent (P3).
 */
export const remainingOf = (game: NonNullable<PageState["game"]>): number => Math.max(0, game.deckSize - game.placedCount - game.discardedCount);

/** The board scene's data a session gives (the hand's orientation and state are the page's). */
export type SessionBoard = Pick<BoardSceneProps, "tiles" | "score" | "remaining" | "discardedPlans" | "lastScored"> & {
  /** The tile in hand, null once the game is over. */
  hand: { plan: number } | null;
  /** The tiles known after it, in draw order (#645): the next two, fewer at the deck's end. */
  coming: { plan: number }[];
  over: boolean;
  /** Every structure closed so far, as its areas on its tiles (`PageState.closed`): the board pulses and shines them (#722). */
  closed: ClosedTileAreas[][];
};

/** A session's state as the board scene reads it. */
export function boardOf(state: PageState): SessionBoard {
  return {
    tiles: state.tiles,
    score: state.game?.score ?? 0,
    remaining: state.game ? remainingOf(state.game) : 0,
    discardedPlans: state.discardedPlans ?? [],
    lastScored: state.lastScored,
    hand: state.hand ? { plan: state.hand.plan } : null,
    coming: (state.coming ?? []).map((t) => ({ plan: t.plan })),
    over: state.game?.over ?? false,
    closed: state.closed ?? [],
  };
}

/** A structure the game closed, with the tile that closed it (the over scene's list). */
export type Closing = ScoredStructure & { tileId: number };
