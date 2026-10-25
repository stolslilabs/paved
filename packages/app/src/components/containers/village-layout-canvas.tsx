import { useMemo } from "react";
import type { BoardTile } from "@paved/chain";
import type { BoardBubble, BoardGhost, BoardViewportProps } from "./board-viewport";
import type { LayoutBoardView } from "./layout-board";
import { cellKey, isStarter, type Cell } from "./layout-rules";

/** The layout's first cell on the renderer's board (the contracts' centre): a layout's cells are counted from the starter. */
const ORIGIN = 2_147_483_647;
const toChain = (c: Cell): Cell => ({ x: ORIGIN + c.x, y: ORIGIN + c.y });
const fromChain = (c: Cell): Cell => ({ x: c.x - ORIGIN, y: c.y - ORIGIN });

/** What the village's editor gives the board's canvas. */
export type LayoutCanvas = Required<Pick<BoardViewportProps, "tiles" | "otherPlates" | "onCellClick">> & Pick<BoardViewportProps, "slots" | "ghost" | "bubble">;

/**
 * The v2 village in 3D (#753), as the board's canvas draws it (the board module's `VillageCanvas`): the free layout on the
 * board's renderer, its camera framed for the screen, the fog lifted around the tiles, the landscape, the weather and the day
 * and night beyond, as on every board. In edit mode it is the editor's board: the legal cells of the tile in hand as plates
 * (its own cells only: no other plate), the tile under the bubble drawn on its cell (its rotation the bubble's) with the bubble
 * by it, following pans, zooms and the compass (#756); a tap on a plate places or moves the tile there, a tap on a placed tile
 * (never the starter) lifts it, a tap on the tile under the bubble lets it go.
 */
export function useLayoutCanvas(view: LayoutBoardView): LayoutCanvas {
  const { tiles: layout, plates, pending, editing, onTile, onPlate, onPending } = view;
  const tiles = useMemo<BoardTile[]>(() => layout.map((t) => ({ ...t, ...toChain(t) })), [layout]);
  const slots = useMemo(() => (editing ? plates.map((p) => ({ ...toChain(p), fits: true })) : undefined), [editing, plates]);
  const ghost = useMemo<BoardGhost | null>(() => (pending ? { ...toChain(pending), plan: pending.plan, orientation: pending.orientation, placed: true, fits: true } : null), [pending]);
  const bubble = useMemo<BoardBubble | null>(() => (view.bubble ? { ...view.bubble, cell: toChain(view.bubble.cell) } : null), [view.bubble]);
  const onCellClick = (chain: Cell) => {
    if (!editing) return;
    const key = cellKey(fromChain(chain));
    if (pending && cellKey(pending) === key) return onPending?.();
    const plate = plates.find((p) => cellKey(p) === key);
    if (plate) return onPlate?.(plate);
    const tile = layout.find((t) => cellKey(t) === key);
    if (tile && !isStarter(tile)) onTile?.(tile);
  };
  return { tiles, slots, otherPlates: false, ghost, bubble, onCellClick };
}
