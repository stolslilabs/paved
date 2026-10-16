import { useMemo } from "react";
import type { BoardTile } from "@paved/chain";
import { GameCanvas } from "@paved/renderer/react";
import type { HoverState, RendererSettingsInput, TileRenderData, TileSkins } from "@paved/renderer";
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
  /** The game's id: with each tile's x and y, it picks the tile's skin variant (the same for every viewer and reload). */
  gameId?: number;
  /**
   * The theme of each plan (`useBoardSkins`: the active skins of the player whose board this is): skinned plans draw a
   * variant per tile, the others their base models. Unset: every tile on its base model.
   */
  skins?: TileSkins;
  /**
   * Where the renderer finds `manifest.json`, which lists its hashed models and tile images (`models/<plan>.glb` and
   * `assets/tiles/<plan>.png` without one, as in Storybook, which maps app-web's `public/`).
   */
  basePath?: string;
  /** The legal slots of the tile in hand, lit on the board (the contracts' coordinates). */
  slots?: { x: number; y: number }[];
  ghost?: BoardGhost | null;
  /**
   * The renderer's settings (`RendererSettingsInput`: the graphics quality). Keep the object between renders while the
   * settings do not change; a new one is applied to the open board at once (`GameScene.setSettings`), no reload.
   */
  settings?: RendererSettingsInput;
  /** Draw the ghost (the tile on the slot before it is placed). Default true; off: the tile is not shown on the slot. */
  tilePreview?: boolean;
  /** Light the legal slots. Default true; off: no slot is outlined. */
  placementHighlight?: boolean;
  /** A cell was clicked or tapped (the contracts' coordinates); the page decides whether it is a slot. */
  onCellClick?: (slot: { x: number; y: number }) => void;
  /** The pointer is over a cell, or (null) left the board. */
  onCellHover?: (slot: { x: number; y: number } | null) => void;
  /** The renderer could not start (no WebGL, a model that does not load). */
  onError?: (error: unknown) => void;
  className?: string;
}

/** The real renderer (`@paved/renderer`'s canvas) on a board: what the board scene puts under its overlays. */
export function BoardViewport({ tiles, gameId = 0, skins, basePath, slots, ghost, settings, tilePreview = true, placementHighlight = true, onCellClick, onCellHover, onError, className }: BoardViewportProps) {
  const renderTiles = useMemo(() => toRenderTiles(tiles, gameId), [tiles, gameId]);
  const gridSlots = useMemo(() => (placementHighlight ? (slots ?? []).map((s) => toGridSlot(s.x, s.y)) : []), [slots, placementHighlight]);
  const hover = useMemo<HoverState | null>(
    // The ghost draws the variant the tile would have in the cell it hovers.
    () =>
      ghost && tilePreview
        ? { ...toGridSlot(ghost.x, ghost.y), valid: true, idle: true, planIndex: ghost.plan, orientation: ghost.orientation, cell: { x: ghost.x, y: ghost.y, gameId } }
        : null,
    [ghost, gameId, tilePreview],
  );
  return (
    // The canvas owns its pinch, pan and rotate (`touch-none`), and the browser's context menu stays off the board (APP-FEEL, P-69).
    <div className={cn("absolute inset-0 touch-none bg-board", className)} onContextMenu={(e) => e.preventDefault()}>
      <GameCanvas
        tiles={renderTiles}
        basePath={basePath}
        skins={skins}
        settings={settings}
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
