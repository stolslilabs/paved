import { Suspense, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { BoardTile } from "@paved/chain";
import { GameCanvas } from "@paved/renderer/react";
import type { GameScene, HoverState, RendererSettingsInput, TileRenderData, TileSkins } from "@paved/renderer";
import { boardPlates, confirmHoldMs } from "../../data/placement";
import { cn } from "../../lib/utils";
import { BoardCovered } from "./board-covered";
import { LazyTileBubble } from "./lazy-tile-bubble";

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

/** The session's tiles as the renderer draws them (world x east, world z south), as the removed legacy client's `toRenderBoard` drew them. */
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
  /** Placed on its slot, not yet sent (SLOTS): its tint turns yellow. Unset: a hover preview, blue at half opacity. */
  placed?: boolean;
  /** Its rotation fits the slot. False: red, and Confirm is disabled. Unset: it fits. */
  fits?: boolean;
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
   * `assets/tiles/<plan>.png` without one, as in Storybook, which maps `asset-sources/`).
   */
  basePath?: string;
  /**
   * The legal slots of the tile in hand in any rotation (the contracts' coordinates): one blue plate each (`fits`, whether
   * the current rotation fits there, is the caller's, for its buttons). Every other free
   * cell next to a tile gets an invalid plate (`boardPlates`). Unset: no tile in hand, no plate; an empty list: a tile that
   * fits nowhere, invalid plates all around.
   */
  slots?: { x: number; y: number; fits?: boolean }[];
  ghost?: BoardGhost | null;
  /**
   * A move the session just accepted (`useConfirmFlash`): the tile drops voxel by voxel, then a green tint on it fades out
   * (`useDropThenConfirm`). A new `key` plays again.
   */
  confirmed?: (BoardGhost & { key: number }) | null;
  /**
   * The renderer's settings (`RendererSettingsInput`: the graphics quality). Keep the object between renders while the
   * settings do not change; a new one is applied to the open board at once (`GameScene.setSettings`), no reload.
   */
  settings?: RendererSettingsInput;
  /** Draw the hover preview (the tile under the pointer before it is placed). Default true; off: only a placed tile shows. */
  tilePreview?: boolean;
  /** Draw the plates. Default true; off: no plate is drawn. */
  placementHighlight?: boolean;
  /** A cell was clicked or tapped (the contracts' coordinates); the page decides whether it is a slot. */
  onCellClick?: (slot: { x: number; y: number }) => void;
  /** The pointer is over a cell, or (null) left the board. */
  onCellHover?: (slot: { x: number; y: number } | null) => void;
  /** The tile placed and not yet sent: the bubble (Close, Rotate, Validate) follows its corner. Unset: none. */
  bubble?: BoardBubble | null;
  /** The scene is up (or gone, null): the season wheel reads the cycle from it. */
  onScene?: (scene: GameScene | null) => void;
  /** The renderer could not start (no WebGL, a model that does not load). */
  onError?: (error: unknown) => void;
  className?: string;
}

/** The bubble on the placed tile (`TileBubble`): `cell` is the tile's, in the contracts' coordinates. */
export interface BoardBubble {
  cell: { x: number; y: number };
  rotations: number;
  onRotate: () => void;
  onClose: () => void;
  /** The end of the hold on Validate: the page sends the move (#568). */
  onConfirm?: () => void;
  /** Validate is enabled: the rotation fits and the points are known. */
  canConfirm?: boolean;
  /** The move is on its way: Validate's spinner. */
  busy?: boolean;
  /** A Story coach mark points at the placement: Validate is ringed. */
  coach?: boolean;
  /** The tile's rotation now: a change drops a hold on Validate under way. */
  orientation?: number;
}

/**
 * The confirm on the 3D board (PLACE-POLISH, #568): when the session accepts a move (a new `confirmed.key`), the landed tile
 * drops voxel by voxel (`GameScene.dropTile`), then the green tint fades on it, for the time `useConfirmFlash` holds it
 * after the drop. A skipped or failed drop (reduced motion, the model not in, its chunk not downloaded) goes straight to the
 * green; a tile gone when the drop ends (a refusal rolled the board back, which cuts the drop) gets no green. Nothing plays at the first frame or a reload:
 * only a key that changes while the board is up. The next tile is never held: the drop plays on while the player places it,
 * and a newer confirm's green wins over an older drop's.
 */
export function useDropThenConfirm(scene: GameScene | null, tiles: TileRenderData[], confirmed: (HoverState & { key: number }) | null | undefined, confirmMs?: number) {
  const [green, setGreen] = useState<(HoverState & { key: number }) | null>(null);
  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;
  // The key the board opened with is never played (a remount with a confirm still held).
  const seen = useRef(confirmed?.key ?? null);
  const latest = useRef(0);
  const holdMs = confirmHoldMs(confirmMs);
  useEffect(() => {
    if (!confirmed || confirmed.key === seen.current || !scene) return;
    seen.current = confirmed.key;
    const run = ++latest.current;
    const at = (t: TileRenderData) => t.worldX === confirmed.x && t.worldZ === confirmed.y;
    const tile = tilesRef.current.find(at);
    const toGreen = () => {
      if (run !== latest.current || !tilesRef.current.some(at)) return;
      setGreen(confirmed);
    };
    if (!tile) return toGreen();
    // The drop is optional: whatever becomes of it (skipped, cut short, failed), the move still gets its green.
    void scene
      .dropTile(tile)
      .then((drop) => (drop.status === "started" ? drop.finished : undefined))
      .catch(() => undefined)
      .then(toGreen);
  }, [confirmed, scene]);
  useEffect(() => {
    if (!green) return;
    const id = setTimeout(() => setGreen(null), holdMs);
    return () => clearTimeout(id);
  }, [green, holdMs]);
  return green;
}

/** A ghost as the renderer's hover: its grid cell, its state, and the cell its skin variant is picked for. */
function hoverOf(ghost: BoardGhost, gameId: number): HoverState {
  return {
    ...toGridSlot(ghost.x, ghost.y),
    valid: ghost.fits !== false,
    idle: true,
    placed: !!ghost.placed,
    planIndex: ghost.plan,
    orientation: ghost.orientation,
    cell: { x: ghost.x, y: ghost.y, gameId },
  };
}

/** The real renderer (`@paved/renderer`'s canvas) on a board: what the board scene puts under its overlays. */
export function BoardViewport({ tiles, gameId = 0, skins, basePath, slots, ghost, confirmed, settings, tilePreview = true, placementHighlight = true, bubble, onCellClick, onCellHover, onScene, onError, className }: BoardViewportProps) {
  const [scene, setScene] = useState<GameScene | null>(null);
  // A sheet or the score panel over the board: the ambient effects stop (`BoardCovered`).
  const covered = useContext(BoardCovered);
  useEffect(() => {
    onScene?.(scene);
    return () => onScene?.(null);
  }, [scene, onScene]);
  const renderTiles = useMemo(() => toRenderTiles(tiles, gameId), [tiles, gameId]);
  // A plate on every free cell next to a tile: playable or invalid (`boardPlates`), in the renderer's grid.
  const gridSlots = useMemo(
    () =>
      placementHighlight
        ? boardPlates(tiles, slots).map((p) => ({ ...toGridSlot(p.x, p.y), ...(p.state === "invalid" ? { legal: false } : {}) }))
        : [],
    [tiles, slots, placementHighlight],
  );
  // The ghost draws the variant the tile would have in the cell it hovers. The tile preview setting hides only the hover
  // preview: a placed tile is always drawn, with its tint (yellow, red: Confirm is disabled, the board says why).
  const hover = useMemo<HoverState | null>(() => (ghost && (tilePreview || ghost.placed) ? hoverOf(ghost, gameId) : null), [ghost, gameId, tilePreview]);
  const confirm = useMemo(() => (confirmed ? { ...hoverOf(confirmed, gameId), key: confirmed.key } : null), [confirmed, gameId]);
  const green = useDropThenConfirm(scene, renderTiles, confirm, settings?.placement?.motion?.confirmMs);
  // The tile placed and not yet validated: the drop's chunk and its model's voxels load now, so the drop at the confirm
  // begins in the call (`GameScene.prepareDropAt`).
  const prepareKey = hover?.placed ? `${hover.planIndex}:${hover.cell?.x}:${hover.cell?.y}` : null;
  useEffect(() => {
    if (scene && hover?.placed) void scene.prepareDropAt(hover).catch(() => {});
  }, [scene, prepareKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    // The canvas owns its pinch, pan and rotate (`touch-none`), and the browser's context menu stays off the board (APP-FEEL, P-69).
    <div className={cn("absolute inset-0 touch-none bg-board", className)} onContextMenu={(e) => e.preventDefault()}>
      <GameCanvas
        tiles={renderTiles}
        basePath={basePath}
        skins={skins}
        settings={settings}
        covered={covered}
        availableSlots={gridSlots}
        hover={hover}
        confirmed={green}
        onReady={setScene}
        onError={onError}
        onTileClick={onCellClick && ((gx, gy) => onCellClick(toChainSlot(gx, gy)))}
        onTileHover={onCellHover && ((gx, gy) => onCellHover(toChainSlot(gx, gy)))}
        onHoverLeave={onCellHover && (() => onCellHover(null))}
      />
      {bubble && scene && (
        <Suspense fallback={null}>
          <LazyTileBubble
            scene={scene}
            cell={toGridSlot(bubble.cell.x, bubble.cell.y)}
            rotations={bubble.rotations}
            onRotate={bubble.onRotate}
            onClose={bubble.onClose}
            onConfirm={bubble.onConfirm}
            canConfirm={bubble.canConfirm}
            busy={bubble.busy}
            coach={bubble.coach}
            orientation={bubble.orientation}
          />
        </Suspense>
      )}
    </div>
  );
}
