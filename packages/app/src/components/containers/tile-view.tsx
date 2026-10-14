import { useMemo } from "react";
import { GameCanvas } from "@paved/renderer/react";
import type { GameScene } from "@paved/renderer";
import { cn } from "../../lib/utils";
import { planCode } from "../elements/tile-chip";
import { toRenderTiles } from "./board-viewport";

/** Board centre of the contracts: the one tile sits where the starter would. */
const CENTER = 2_147_483_647;

/**
 * The camera's zoom that frames one tile: the renderer's camera starts 240 units above the board with a 50° field of
 * view and zoom 5, which shows about 45 units, so one tile (3 units) fills the view near zoom 70.
 */
const ONE_TILE_ZOOM = 64;

export interface TileViewProps {
  plan: number;
  orientation: number;
  /** As `BoardViewport`'s: where the renderer finds the models. */
  basePath?: string;
  className?: string;
}

/**
 * One tile drawn by the real renderer, framed alone: the hand shows the tile exactly as the board will draw it (the
 * PM's ruling, 2026-10-14). A second WebGL canvas; it takes no input, the hand's buttons turn it.
 */
export function TileView({ plan, orientation, basePath, className }: TileViewProps) {
  const tiles = useMemo(() => toRenderTiles([{ id: 1, plan, orientation, x: CENTER, y: CENTER }], 0), [plan, orientation]);
  const frame = (scene: GameScene) => {
    scene.camera.zoom = ONE_TILE_ZOOM;
    scene.camera.updateProjectionMatrix();
    scene.focusBoard();
  };
  return (
    <span role="img" aria-label={`Tile ${planCode(plan).toLowerCase()}, ${["north", "east", "south", "west"][(orientation - 1 + 4) % 4]}`} className={cn("pointer-events-none block size-full bg-board", className)}>
      <GameCanvas tiles={tiles} basePath={basePath} onReady={frame} />
    </span>
  );
}
