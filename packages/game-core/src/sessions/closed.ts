import type { TileAreas } from "../engine";
import type { ClosedTileAreas } from "./types";

/**
 * The closed structures as `PageState.closed` gives them (#722): each one's areas on its tiles, from the engine's
 * `closings()` (a played game) or `closedOnBoard()` (a board written as it is). `tileIdOf` names each tile as the board
 * does: a board written with its ids moved past the engine's own gives them back as the chain names them.
 */
export function closedOf(
  closings: readonly { readonly areas?: readonly TileAreas[] }[],
  tileIdOf: (engineId: number) => number = (id) => id,
): ClosedTileAreas[][] {
  return closings.map((c) => (c.areas ?? []).map(({ tileId, areas }) => ({ tileId: tileIdOf(tileId), areas })));
}
