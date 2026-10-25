import { useCallback, useEffect, useMemo, useRef } from "react";
import type { BoardTile } from "@paved/chain";
import type { GameScene, RendererSettingsInput, TileSkins } from "@paved/renderer";
import { BoardViewport, type BoardGhost } from "./board-viewport";
import type { LayoutBoardView } from "./layout-board";
import { cellKey, isStarter, type Cell } from "./layout-rules";

/** The layout's first cell on the renderer's board (the contracts' centre): a layout's cells are counted from the starter. */
const ORIGIN = 2_147_483_647;
const toChain = (c: Cell): Cell => ({ x: ORIGIN + c.x, y: ORIGIN + c.y });
const fromChain = (c: Cell): Cell => ({ x: c.x - ORIGIN, y: c.y - ORIGIN });

export interface VillageLayoutCanvasProps {
  /** The editor's state (`useLayoutEditor`): the layout, its plates, the tile set on a cell, and the two taps. */
  view: LayoutBoardView;
  /** The renderer's settings (the board's, `useBoardSettings`): quality, the day and night, the weather, the fog. */
  settings?: RendererSettingsInput;
  basePath?: string;
  skins?: TileSkins;
  onScene?: (scene: GameScene | null) => void;
  /**
   * The ready signal (#761): the scene's first frame is drawn, with the models of every tile handed over and the tile images
   * (the boards' asset loading: `GameScene.init` waits for them, then `start` draws that frame). Once per scene.
   */
  onReady?: () => void;
  /** The renderer could not start: the page falls back to the plan view (`LayoutBoard`). */
  onError?: (error: unknown) => void;
}

/**
 * The v2 village in 3D (#753): the free layout on the board's renderer, its camera framed for the screen, the fog lifted around
 * the tiles, the landscape, the weather and the day and night beyond, as on every board. In edit mode it is the editor's board:
 * the legal cells of the tile in hand as plates, the tile set on a cell drawn there (placed, its rotation the bubble's), a tap
 * on a plate sets the tile there, a tap on a placed tile (never the starter) lifts it. Its own lazy chunk: the home's overlays
 * paint before it.
 */
export default function VillageLayoutCanvas({ view, settings, basePath, skins, onScene, onReady, onError }: VillageLayoutCanvasProps) {
  const { tiles: layout, plates, pending, editing, onTile, onPlate } = view;
  const tiles = useMemo<BoardTile[]>(() => layout.map((t) => ({ ...t, ...toChain(t) })), [layout]);
  const slots = useMemo(() => (editing ? plates.map((p) => ({ ...toChain(p), fits: true })) : undefined), [editing, plates]);
  const ghost = useMemo<BoardGhost | null>(() => (pending ? { ...toChain(pending), plan: pending.plan, orientation: pending.orientation, placed: true, fits: true } : null), [pending]);
  // One stable handler for the viewport (it calls it again on every change of its identity): the page's, then the ready signal.
  const latest = useRef({ onScene, onReady });
  useEffect(() => {
    latest.current = { onScene, onReady };
  });
  const handleScene = useCallback((scene: GameScene | null) => {
    latest.current.onScene?.(scene);
    if (scene) latest.current.onReady?.();
  }, []);
  const onCellClick = (chain: Cell) => {
    if (!editing) return;
    const key = cellKey(fromChain(chain));
    const plate = plates.find((p) => cellKey(p) === key);
    if (plate) return onPlate?.(plate);
    const tile = layout.find((t) => cellKey(t) === key);
    if (tile && !isStarter(tile)) onTile?.(tile);
  };
  return (
    <BoardViewport
      tiles={tiles}
      basePath={basePath}
      skins={skins}
      settings={settings}
      slots={slots}
      otherPlates={false}
      ghost={ghost}
      onScene={handleScene}
      onCellClick={onCellClick}
      onError={onError}
    />
  );
}
