import { useMemo } from "react";
import type { BoardTile } from "@paved/chain";
import { GameCanvas } from "@paved/renderer/react";
import type { TileRenderData } from "@paved/renderer";
import { cn } from "../../lib/utils";

/** Board centre of the contracts (0x7FFFFFFF): the starter tile's x and y. */
const CENTER = 2_147_483_647;

/** The session's tiles as the renderer draws them (world x east, world z south): app-web's `toRenderBoard`. */
export function toRenderTiles(tiles: BoardTile[], gameId: number): TileRenderData[] {
  return tiles.map((t) => ({
    game_id: gameId,
    id: t.id,
    player_id: "0x0",
    plan: t.plan,
    orientation: t.orientation,
    x: t.x,
    y: t.y,
    worldX: t.x - CENTER,
    worldZ: CENTER - t.y,
    ...(t.pending ? { pending: true } : {}),
  }));
}

export interface BoardViewportProps {
  tiles: BoardTile[];
  gameId?: number;
  /**
   * Where the renderer finds `models/<plan>.glb` and `assets/tiles/<plan>.png`. The files are app-web's `public/`; this
   * package serves them once its Storybook and build map that folder (escalated with SC1).
   */
  basePath?: string;
  className?: string;
}

/** The real renderer (`@paved/renderer`'s canvas) on a board: what the board scene puts under its overlays. */
export function BoardViewport({ tiles, gameId = 0, basePath, className }: BoardViewportProps) {
  const renderTiles = useMemo(() => toRenderTiles(tiles, gameId), [tiles, gameId]);
  return (
    <div className={cn("absolute inset-0 bg-board", className)}>
      <GameCanvas tiles={renderTiles} basePath={basePath} />
    </div>
  );
}
