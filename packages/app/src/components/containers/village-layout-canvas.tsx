import { useCallback, useEffect, useMemo, useState } from "react";
import type { BoardTile } from "@paved/chain";
import type { GameScene, LitTile, RendererSettingsInput, TileSkins } from "@paved/renderer";
import { BoardViewport, type BoardBubble, type BoardGhost } from "./board-viewport";
import type { LayoutBoardView, LayoutPending } from "./layout-board";
import { cellKey, isStarter, type Cell } from "./layout-rules";

/** The layout's first cell on the renderer's board (the contracts' centre): a layout's cells are counted from the starter. */
const ORIGIN = 2_147_483_647;
const toChain = (c: Cell): Cell => ({ x: ORIGIN + c.x, y: ORIGIN + c.y });
const fromChain = (c: Cell): Cell => ({ x: c.x - ORIGIN, y: c.y - ORIGIN });

export interface VillageLayoutCanvasProps {
  /** The editor's state (`useLayoutEditor`): the layout, its plates, the tile under the bubble, the bubble, and the taps. */
  view: LayoutBoardView;
  /** The renderer's settings (the board's, `useBoardSettings`): quality, the day and night, the weather, the fog. */
  settings?: RendererSettingsInput;
  basePath?: string;
  skins?: TileSkins;
  onScene?: (scene: GameScene | null) => void;
  /** The renderer could not start: the page falls back to the plan view (`LayoutBoard`). */
  onError?: (error: unknown) => void;
}

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
 * The v2 village in 3D (#753): the free layout on the board's renderer, its camera framed for the screen, the fog lifted around
 * the tiles, the landscape, the weather and the day and night beyond, as on every board. In edit mode it is the editor's board:
 * the legal cells of the tile in hand as plates, the tile under the bubble drawn on its cell (its rotation the bubble's) with
 * the bubble by it, following pans, zooms and the compass (#756); a tap on a plate places or moves the tile there, a tap on a
 * placed tile (never the starter) lifts it, a tap on the tile under the bubble lets it go. A line of the points chosen (#758,
 * `view.lit`) lights its structure's areas and dims the rest (`setLitAreas`). Its own lazy chunk: the home's overlays paint
 * before it.
 */
export default function VillageLayoutCanvas({ view, settings, basePath, skins, onScene, onError }: VillageLayoutCanvasProps) {
  const { tiles: layout, plates, pending, editing, onTile, onPlate, onPending } = view;
  const drawn = useMemo(() => sceneTilesOf({ tiles: layout, pending, lit: view.lit }), [layout, pending, view.lit]);
  const tiles = useMemo<BoardTile[]>(() => drawn.tiles.map((t) => ({ ...t, ...toChain(t) })), [drawn]);
  const slots = useMemo(() => (editing ? plates.map((p) => ({ ...toChain(p), fits: true })) : undefined), [editing, plates]);
  const held = drawn.ghost;
  const ghost = useMemo<BoardGhost | null>(() => (held ? { ...toChain(held), plan: held.plan, orientation: held.orientation, placed: true, fits: true } : null), [held]);
  const bubble = useMemo<BoardBubble | null>(() => (view.bubble ? { ...view.bubble, cell: toChain(view.bubble.cell) } : null), [view.bubble]);
  const [scene, setScene] = useState<GameScene | null>(null);
  const handleScene = useCallback(
    (next: GameScene | null) => {
      setScene(next);
      onScene?.(next);
    },
    [onScene],
  );
  // The lit structure on the scene's tiles, the tile under the bubble included.
  const { lit } = drawn;
  useEffect(() => {
    scene?.setLitAreas(lit);
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
  return (
    <BoardViewport
      tiles={tiles}
      basePath={basePath}
      skins={skins}
      settings={settings}
      slots={slots}
      otherPlates={false}
      ghost={ghost}
      bubble={bubble}
      onScene={handleScene}
      onCellClick={onCellClick}
      onError={onError}
    />
  );
}
