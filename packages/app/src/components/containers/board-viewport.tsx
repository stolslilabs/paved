import { useMemo } from "react";
import type { BoardTile } from "@paved/chain";
import { GameCanvas } from "@paved/renderer/react";
import type { HoverState, TileRenderData } from "@paved/renderer";
import { cn } from "../../lib/utils";

/** Board centre of the contracts (0x7FFFFFFF): the starter tile's x and y. */
const CENTER = 2_147_483_647;

/**
 * A renderer grid slot (x east, y south of the starter: the cell `onTileClick` names) as the contracts' absolute x and
 * y (y north). The move a page sends is built from this, so it is the slot the player sees (D1, #379).
 */
export function toChainSlot(gridX: number, gridY: number): { x: number; y: number } {
  return { x: gridX + CENTER, y: CENTER - gridY };
}

/** The contracts' x and y as the renderer's grid slot: the inverse of `toChainSlot`, and where `toRenderTiles` draws a tile. */
export function toGridSlot(x: number, y: number): { x: number; y: number } {
  return { x: x - CENTER, y: CENTER - y };
}

/** The session's tiles as the renderer draws them (world x east, world z south): app-web's `toRenderBoard`. */
export function toRenderTiles(tiles: BoardTile[], gameId: number): TileRenderData[] {
  return tiles.map((t) => {
    const grid = toGridSlot(t.x, t.y);
    return {
      game_id: gameId,
      id: t.id,
      player_id: "0x0",
      plan: t.plan,
      orientation: t.orientation,
      x: t.x,
      y: t.y,
      worldX: grid.x,
      worldZ: grid.y,
      ...(t.pending ? { pending: true } : {}),
    };
  });
}

/** The tile in hand drawn where it would go (the ghost), in the contracts' coordinates. */
export interface BoardGhost {
  x: number;
  y: number;
  plan: number;
  orientation: number;
}

export interface BoardViewportProps {
  tiles: BoardTile[];
  gameId?: number;
  /**
   * Where the renderer finds `models/<plan>.glb` and `assets/tiles/<plan>.png`. The files are app-web's `public/`; this
   * package serves them once its Storybook and build map that folder (escalated with SC1).
   */
  basePath?: string;
  /** The legal slots of the tile in hand, lit on the board (the contracts' coordinates). */
  slots?: { x: number; y: number }[];
  ghost?: BoardGhost | null;
  /** A cell was clicked or tapped (the contracts' coordinates); the page decides whether it is a slot. */
  onCellClick?: (slot: { x: number; y: number }) => void;
  /** The pointer is over a cell, or (null) left the board. */
  onCellHover?: (slot: { x: number; y: number } | null) => void;
  /** The renderer could not start (no WebGL, a model that does not load). */
  onError?: (error: unknown) => void;
  className?: string;
}

/** The real renderer (`@paved/renderer`'s canvas) on a board: what the board scene puts under its overlays. */
export function BoardViewport({ tiles, gameId = 0, basePath, slots, ghost, onCellClick, onCellHover, onError, className }: BoardViewportProps) {
  const renderTiles = useMemo(() => toRenderTiles(tiles, gameId), [tiles, gameId]);
  const gridSlots = useMemo(() => (slots ?? []).map((s) => toGridSlot(s.x, s.y)), [slots]);
  const hover = useMemo<HoverState | null>(
    () => (ghost ? { ...toGridSlot(ghost.x, ghost.y), valid: true, idle: true, planIndex: ghost.plan, orientation: ghost.orientation } : null),
    [ghost],
  );
  return (
    <div className={cn("absolute inset-0 bg-board", className)}>
      <GameCanvas
        tiles={renderTiles}
        basePath={basePath}
        availableSlots={gridSlots}
        hover={hover}
        onError={onError}
        onTileClick={onCellClick && ((gx, gy) => onCellClick(toChainSlot(gx, gy)))}
        onTileHover={onCellHover && ((gx, gy) => onCellHover(toChainSlot(gx, gy)))}
        onHoverLeave={onCellHover && (() => onCellHover(null))}
      />
    </div>
  );
}
