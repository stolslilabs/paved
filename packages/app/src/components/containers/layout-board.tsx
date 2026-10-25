import { useLayoutEffect, useRef, type ReactNode } from "react";
import * as m from "motion/react-m";
import type { BoardTile } from "@paved/chain";
import { cn } from "../../lib/utils";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import { Icon } from "../ui/icon";
import { ScrollRegion } from "../ui/scroll-region";
import { FogVeil, cellName } from "./village-board";
import { SIDES, cellKey, isStarter, type Cell, type Spot } from "./layout-rules";

/** The tile in hand set on a cell, waiting for the hold that places it. */
export interface LayoutPending extends Cell {
  plan: number;
  orientation: number;
}

export interface LayoutBoardProps {
  /** The layout's tiles (a tile lifted into the hand is not among them). */
  tiles: readonly BoardTile[];
  /** The layout being edited: the placed tiles and the plates are buttons. Off: drawn, inert, under the fog. */
  editing?: boolean;
  /** The legal cells of the tile in hand, as the board's plates. */
  plates?: readonly Spot[];
  /** The tile in hand on its cell, ringed: the bubble's hold places it there. */
  pending?: LayoutPending | null;
  /** A tile that cannot be lifted (its removal would split the village): it shakes. */
  shaking?: number | null;
  tileArt?: TileArt;
  /**
   * Fit the plan to its box, below the 44 px touch floor if need be, so it never scrolls across: a view where no cell is tapped
   * (the home, #753). Off: every cell keeps the floor, and a plan wider than the box scrolls.
   */
  fit?: boolean;
  /** A placed tile chosen (never the starter): lift it into the hand. */
  onTile?: (tile: BoardTile) => void;
  /** A plate chosen: the tile in hand goes there. */
  onPlate?: (spot: Spot) => void;
  className?: string;
}

/** What a drawing of the layout takes (the plan view here, the home's 3D scene, #753): the editor's state and its two taps. */
export type LayoutBoardView = Required<Pick<LayoutBoardProps, "tiles" | "editing" | "plates" | "pending" | "shaking">> & Pick<LayoutBoardProps, "onTile" | "onPlate">;

/** A cell's least width with its gap: the 44 px touch floor and the grid's 2 px gap. */
const MIN_CELL = 46;

/** The empty rings around the tiles: room for the plates while editing, the fog's roll-off in the view. */
const RINGS = 2;

/** A shake, as a refused move on the board. */
const SHAKE = { x: [0, -5, 5, -4, 4, 0] };

/**
 * The v2 village from above (#739): a free layout of tiles, no territory. In the view, the tiles under the fog, which lifts
 * around them as on every board. While editing, placing works as on the board: the tile in hand lights its legal cells
 * (plates, `data-cell`), a tap sets it on one (ringed, the bubble's hold places it), and a placed tile is a button that lifts
 * it into the hand. The starter wears its lock and is never a button.
 */
export function LayoutBoard({ tiles, editing = false, plates = [], pending = null, shaking = null, fit = false, tileArt, onTile, onPlate, className }: LayoutBoardProps) {
  const grid = useRef<HTMLDivElement>(null);
  // A board wider than the screen opens on its middle, where the village is.
  const extent = tiles.length;
  useLayoutEffect(() => {
    const el = grid.current?.parentElement;
    if (!el) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  }, [extent, editing]);

  const byCell = new Map(tiles.map((t) => [cellKey(t), t]));
  const plateAt = new Map(plates.map((p) => [cellKey(p), p]));
  const all: Cell[] = [...tiles, ...plates, ...(pending ? [pending] : [])];
  const xs = all.length ? all.map((t) => t.x) : [0];
  const ys = all.length ? all.map((t) => t.y) : [0];
  const minX = Math.min(...xs) - RINGS;
  const maxX = Math.max(...xs) + RINGS;
  const minY = Math.min(...ys) - RINGS;
  const maxY = Math.max(...ys) + RINGS;
  const cols = maxX - minX + 1;
  const rows = maxY - minY + 1;
  const at = (c: Cell) => ({ gridColumn: c.x - minX + 1, gridRow: maxY - c.y + 1 });
  const pendingKey = pending ? cellKey(pending) : null;
  // The fog's clear cells in the view: the tiles and the cells next to them, as on every board (#739).
  const clear: Cell[] = [];
  if (!editing) {
    const keys = new Set<string>();
    for (const t of tiles) for (const c of [{ x: t.x, y: t.y }, ...SIDES.map(([dx, dy]) => ({ x: t.x + dx, y: t.y + dy }))]) keys.add(cellKey(c));
    for (const k of keys) {
      const [x, y] = k.split(",").map(Number);
      clear.push({ x: x!, y: y! });
    }
  }

  const cells: ReactNode[] = [];
  for (let y = maxY; y >= minY; y--) {
    for (let x = minX; x <= maxX; x++) {
      const c = { x, y };
      const key = cellKey(c);
      const tile = byCell.get(key);
      if (tile) {
        const starter = isStarter(tile);
        const chip = <TileChip plan={tile.plan} orientation={tile.orientation} art={tileArt} className={cn("size-full rounded-[2px] border-0", editing && pending && "opacity-70")} />;
        const lock = starter && (
          <span aria-hidden className="absolute top-0.5 left-0.5 grid size-4 place-items-center rounded-sm bg-background/80 text-primary">
            <Icon name="lock" size="xs" />
          </span>
        );
        cells.push(
          editing && !starter ? (
            <m.button
              key={key}
              type="button"
              data-cell={key}
              data-kind="tile"
              data-tile={tile.id}
              aria-label={`${tileName(tile.plan)} at ${cellName(c)}: lift it`}
              onClick={() => onTile?.(tile)}
              animate={shaking === tile.id ? SHAKE : { x: 0 }}
              transition={{ duration: 0.4 }}
              style={at(c)}
              className={cn("relative block min-h-0 min-w-0 rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring", shaking === tile.id && "ring-2 ring-warning")}
            >
              {chip}
            </m.button>
          ) : (
            <span key={key} data-cell={key} data-kind={starter ? "starter" : "tile"} aria-label={starter && editing ? "The starter: it stays" : undefined} style={at(c)} className="relative block min-h-0 min-w-0 rounded-[3px]">
              {chip}
              {lock}
            </span>
          ),
        );
        continue;
      }
      if (key === pendingKey && pending) {
        cells.push(
          <span key={key} data-cell={key} data-kind="pending" style={at(c)} className="relative z-10 block min-h-0 min-w-0 rounded-[3px] ring-2 ring-primary ring-offset-2 ring-offset-board">
            <TileChip plan={pending.plan} orientation={pending.orientation} art={tileArt} className="size-full rounded-[2px] border-0" />
          </span>,
        );
        continue;
      }
      const plate = editing ? plateAt.get(key) : undefined;
      if (plate) {
        cells.push(
          <button
            key={key}
            type="button"
            data-cell={key}
            data-kind="plate"
            aria-label={`Place it at ${cellName(c)}`}
            onClick={() => onPlate?.(plate)}
            style={at(c)}
            className="state-layer relative block min-h-0 min-w-0 rounded-[3px] border border-primary/60 bg-plate/55 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />,
        );
        continue;
      }
      cells.push(<span key={key} aria-hidden style={at(c)} className={cn("block min-h-0 min-w-0 rounded-[3px]", editing ? "border border-dashed border-input/40" : "bg-secondary/20")} />);
    }
  }

  return (
    // `safe center`: a board wider than the screen scrolls from its edge, not from a centre cut off on both sides.
    <ScrollRegion orientation="both" className={cn("grid size-full bg-board p-4", className)} style={{ placeItems: "safe center" }}>
      <div
        ref={grid}
        role={editing ? "group" : "img"}
        aria-label={`Village layout of ${tiles.length} ${tiles.length === 1 ? "tile" : "tiles"}`}
        className="relative grid shrink-0 gap-0.5"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          aspectRatio: `${cols} / ${rows}`,
          // Every cell keeps the 44 px touch floor: past what the screen holds, the board scrolls.
          width: fit ? "min(100%, 70dvh)" : `max(${cols * MIN_CELL}px, min(100%, 70dvh))`,
        }}
      >
        {cells}
        {!editing && <FogVeil clear={clear} minX={minX} maxY={maxY} cols={cols} rows={rows} />}
      </div>
    </ScrollRegion>
  );
}
