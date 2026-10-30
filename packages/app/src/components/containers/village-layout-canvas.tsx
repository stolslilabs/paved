import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BoardTile } from "@paved/chain";
import type { GameScene, LitTile } from "@paved/renderer";
import type { BoardBubble, BoardGhost, BoardViewportProps } from "./board-viewport";
import type { LayoutBoardView, LayoutPending } from "./layout-board";
import { cellKey, isStarter, type Cell } from "./layout-rules";

/** The layout's first cell on the renderer's board (the contracts' centre): a layout's cells are counted from the starter. */
const ORIGIN = 2_147_483_647;
const toChain = (c: Cell): Cell => ({ x: ORIGIN + c.x, y: ORIGIN + c.y });
const fromChain = (c: Cell): Cell => ({ x: c.x - ORIGIN, y: c.y - ORIGIN });

/** The canvas's signals the village's page listens to. */
export interface LayoutCanvasSignals {
  onScene?: (scene: GameScene | null) => void;
  /**
   * The ready signal (#761): the scene's first frame is drawn with the models of every tile handed over (the boards' asset
   * loading: `GameScene.init` waits for them, then `start` draws that frame), and every tile image is in
   * (`GameScene.tileImagesReady`, which asks again for one that failed). Once per scene. Images that never come call
   * `onError` instead.
   */
  onReady?: () => void;
  /** The renderer could not start: the page falls back to the plan view (`LayoutBoard`). */
  onError?: (error: unknown) => void;
}

/** What the village's editor gives the board's canvas. */
export type LayoutCanvas = Required<Pick<BoardViewportProps, "tiles" | "otherPlates" | "onCellClick" | "onScene" | "cameraMode">> &
  Pick<BoardViewportProps, "slots" | "ghost" | "bubble" | "press" | "onError">;

/**
 * What the scene draws of the editor's state (#758): the layout's tiles, and the tile under the bubble as the ghost, or as a placed
 * tile while the lit structure holds its cell (the ghost takes no feature light, so the structure would show only in part); and
 * the lit structure's areas on the drawn tiles' ids (the board's game 0). Cells are the layout's; the caller moves them to the
 * board's.
 */
export function sceneTilesOf({ tiles, pending, lit }: Pick<LayoutBoardView, "tiles" | "pending" | "lit">): {
  tiles: BoardTile[];
  ghost: LayoutPending | null;
  lit: LitTile[] | null;
} {
  const pendingLit = !!pending && !!lit?.some((c) => cellKey(c) === cellKey(pending));
  const drawn: BoardTile[] = pendingLit
    ? [...tiles, { id: pending.id ?? Math.max(0, ...tiles.map((t) => t.id)) + 1, plan: pending.plan, orientation: pending.orientation, x: pending.x, y: pending.y }]
    : [...tiles];
  const ids = new Map(drawn.map((t) => [cellKey(t), t.id]));
  return {
    tiles: drawn,
    ghost: pendingLit ? null : pending,
    lit: lit
      ? lit.flatMap((c) => {
          const id = ids.get(cellKey(c));
          return id === undefined ? [] : [{ gameId: 0, id, areas: c.areas }];
        })
      : null,
  };
}

/**
 * The v2 village in 3D (#753), as the board's canvas draws it (the board module's `BoardCanvas`, in `home-canvas.tsx`): the
 * free layout on the board's renderer, its camera framed for the screen, the fog lifted around the tiles, the landscape, the
 * weather and the day and night beyond, as on every board. In edit mode it is the editor's board: the legal cells of the tile
 * in hand as plates (its own cells only: no other plate), the tile under the bubble drawn on its cell (its rotation the
 * bubble's) with the bubble by it, following pans, zooms and the compass (#756); a tap on a plate places or moves the tile
 * there, a tap on a placed tile (never the starter) lifts it, a tap on the tile under the bubble lets it go. The ready signal
 * once the village is drawn (#761). A line of the points chosen (#758, `view.lit`) lights its structure's areas and dims the
 * rest (`setLitAreas`). In view, a long press on a tile opens edit mode through its bubble (#799, `view.press`), except in the
 * Camera mode (#875, `view.camera`), where the camera turns and tilts free and a press is the drag's start.
 */
export function useLayoutCanvas(view: LayoutBoardView, { onScene, onReady, onError }: LayoutCanvasSignals = {}): LayoutCanvas {
  const { tiles: layout, plates, pending, editing, onTile, onPlate, onPending } = view;
  const drawn = useMemo(() => sceneTilesOf({ tiles: layout, pending, lit: view.lit }), [layout, pending, view.lit]);
  const tiles = useMemo<BoardTile[]>(() => drawn.tiles.map((t) => ({ ...t, ...toChain(t) })), [drawn]);
  const slots = useMemo(() => (editing ? plates.map((p) => ({ ...toChain(p), fits: true })) : undefined), [editing, plates]);
  const held = drawn.ghost;
  const ghost = useMemo<BoardGhost | null>(() => (held ? { ...toChain(held), plan: held.plan, orientation: held.orientation, placed: true, fits: true } : null), [held]);
  const bubble = useMemo<BoardBubble | null>(() => (view.bubble ? { ...view.bubble, cell: toChain(view.bubble.cell) } : null), [view.bubble]);
  // One stable handler for the viewport (it calls it again on every change of its identity): the page's, then the ready signal
  // once the tile images are in too (`init` lets the scene start without one that failed) and a frame drawn after them; images
  // that never come are the renderer's failure (the plan view), so the signal never comes with an asset missing.
  const latest = useRef({ onScene, onReady, onError });
  useEffect(() => {
    latest.current = { onScene, onReady, onError };
  });
  const current = useRef<GameScene | null>(null);
  // The scene in state too, for the lit structure (#758).
  const [scene, setScene] = useState<GameScene | null>(null);
  const handleScene = useCallback((scene: GameScene | null) => {
    current.current = scene;
    setScene(scene);
    latest.current.onScene?.(scene);
    if (!scene) return;
    scene.tileImagesReady().then(
      () => requestAnimationFrame(() => current.current === scene && latest.current.onReady?.()),
      (error: unknown) => current.current === scene && latest.current.onError?.(error),
    );
  }, []);
  // The lit structure on the scene's tiles, the tile under the bubble included. A scene starts with none: nothing to say until a
  // line is chosen, then each change, the light off included.
  const { lit } = drawn;
  const litOnce = useRef(false);
  useEffect(() => {
    if (!scene || (lit === null && !litOnce.current)) return;
    litOnce.current = true;
    scene.setLitAreas(lit);
  }, [scene, lit]);
  const onCellClick = (chain: Cell) => {
    if (!editing) return;
    const key = cellKey(fromChain(chain));
    if (pending && cellKey(pending) === key) return onPending?.();
    const plate = plates.find((p) => cellKey(p) === key);
    if (plate) return onPlate?.(plate);
    const tile = layout.find((t) => cellKey(t) === key);
    if (tile && !isStarter(tile)) onTile?.(tile);
  };
  const camera = !!view.camera && !editing;
  return {
    tiles,
    slots,
    otherPlates: false,
    ghost,
    bubble,
    press: editing || camera ? null : view.press,
    cameraMode: camera ? "free" : "play",
    onScene: handleScene,
    onCellClick,
    onError,
  };
}
