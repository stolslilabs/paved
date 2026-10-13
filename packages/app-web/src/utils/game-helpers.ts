import type { TileRenderData } from "@paved/renderer";
import type { SessionState } from "@paved/chain";

/** Board centre of the contracts (0x7FFFFFFF): the starter tile's x and y. */
export const CENTER = 2147483647;

/** The session's board as the renderer draws it (world x east, world z south). */
export function toRenderBoard(state: Pick<SessionState, "tiles"> & { key: Pick<SessionState["key"], "gameId"> }, playerId: string): TileRenderData[] {
  return state.tiles.map((t) => ({
    game_id: state.key.gameId,
    id: t.id,
    player_id: playerId,
    plan: t.plan,
    orientation: t.orientation,
    x: t.x,
    y: t.y,
    worldX: t.x - CENTER,
    worldZ: CENTER - t.y,
    ...(t.pending ? { pending: true } : {}),
  }));
}
