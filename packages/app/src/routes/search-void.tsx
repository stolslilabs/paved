import type { BoardTile } from "@paved/chain";
import { useScoutBoard } from "./attack-board";

const NO_TILES: BoardTile[] = [];

/**
 * The search's backdrop (ATTACK-SCOUT, the user's ask of 2026-11-07: an empty village, the board's animated void alone behind the
 * radar): the scout's board with no tile, in the rival's void, on summer's day. Given to `PvpSearchScene` as its `canvas`, the same
 * element in each of the search's states, so the board stays up from the draw to the rival found. Nothing where the board cannot
 * draw (no WebGL, the renderer failed): the scene's own ground.
 */
export function SearchVoid() {
  return useScoutBoard(null, NO_TILES).canvas ?? null;
}
