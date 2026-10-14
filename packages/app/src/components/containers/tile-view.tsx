import { useMemo } from "react";
import { GameCanvas } from "@paved/renderer/react";
import type { GameScene } from "@paved/renderer";
import { cn } from "../../lib/utils";
import { TileChip, planCode } from "../elements/tile-chip";
import { toRenderTiles } from "./board-viewport";

/** Board centre of the contracts: the one tile sits where the starter would. */
const CENTER = 2_147_483_647;

/**
 * The camera's zoom that frames one tile: the renderer's camera starts 240 units above the board with a 50° field of
 * view and zoom 5, which shows about 45 units, so one tile (3 units) fills the view near zoom 70.
 */
const ONE_TILE_ZOOM = 64;

let webgl: boolean | undefined;

/**
 * Whether this browser gives a WebGL context, probed once on a throwaway canvas. Without one, three's renderer throws in
 * `GameCanvas`'s init, an unhandled rejection that leaves an empty box: `TileView` shows the tile art instead.
 */
export function hasWebGL(): boolean {
  if (webgl === undefined) {
    try {
      const canvas = document.createElement("canvas");
      webgl = !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

export interface TileViewProps {
  plan: number;
  orientation: number;
  /** As `BoardViewport`'s: where the renderer finds the models. */
  basePath?: string;
  className?: string;
}

/**
 * One tile drawn by the real renderer, framed alone: the hand shows the tile exactly as the board will draw it (the
 * PM's ruling, 2026-10-14). A second WebGL canvas; it takes no input, the hand's buttons turn it. Without WebGL it is
 * the tile chip with the board's art from the same `basePath`.
 */
export function TileView({ plan, orientation, basePath, className }: TileViewProps) {
  const tiles = useMemo(() => toRenderTiles([{ id: 1, plan, orientation, x: CENTER, y: CENTER }], 0), [plan, orientation]);
  const frame = (scene: GameScene) => {
    scene.camera.zoom = ONE_TILE_ZOOM;
    scene.camera.updateProjectionMatrix();
    scene.focusBoard();
  };
  if (!hasWebGL()) return <TileChip plan={plan} orientation={orientation} artBase={basePath ?? ""} size="lg" className={cn("size-full border-0", className)} />;
  return (
    <span role="img" aria-label={`Tile ${planCode(plan).toLowerCase()}, ${["north", "east", "south", "west"][(orientation - 1 + 4) % 4]}`} className={cn("pointer-events-none block size-full bg-board", className)}>
      <GameCanvas tiles={tiles} basePath={basePath} onReady={frame} />
    </span>
  );
}
