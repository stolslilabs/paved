import { useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { BoardTile } from "@paved/chain";
import { cn } from "../../lib/utils";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import { Icon } from "../ui/icon";
import { ScrollRegion } from "../ui/scroll-region";
import { FogVeil, cellName } from "./village-board";
import { SIDES, cellKey, isStarter, type Cell, type Fault } from "./layout-rules";

export interface LayoutBoardProps {
  tiles: readonly BoardTile[];
  /** The layout being edited: tiles and empty cells are buttons. Off: drawn, inert, under the fog. */
  editing?: boolean;
  /** The placed tile chosen (its id): ringed. */
  selected?: number | null;
  /** A plan held from the tray, or a tile chosen: the empty cells take it. */
  targets?: boolean;
  faults?: readonly Fault[];
  /** The ids of the tiles cut off from the starter: outlined. */
  detached?: ReadonlySet<number>;
  /** The cell a dragged tile is over. */
  over?: Cell | null;
  /** What the drag would put there: a preview on an empty cell. */
  preview?: { plan: number; orientation: number } | null;
  tileArt?: TileArt;
  onTile?: (tile: BoardTile) => void;
  /** A press on a placed tile while editing: the scene starts a drag from it once the pointer moves. */
  onTilePress?: (tile: BoardTile, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onCell?: (cell: Cell) => void;
  className?: string;
}

/** A cell's least width with its gap: the 44 px touch floor and the grid's 2 px gap. */
const MIN_CELL = 46;

/** The empty rings around the tiles: room to place while editing, the fog's roll-off in the view. */
const EDIT_RINGS = 2;
const VIEW_RINGS = 2;

/**
 * The v2 village from above (#739): a free layout of tiles, no territory. In the view, the tiles under the fog, which lifts
 * around them as on every board. While editing, every tile and every empty cell in reach is a button (`data-cell`, so a
 * drag finds it under the pointer): a tile is chosen, an empty cell takes the plan held or the tile chosen. The faulty edges
 * are red marks on the edge itself, the tiles cut off from the starter are outlined, the starter wears its lock.
 */
export function LayoutBoard({ tiles, editing = false, selected = null, targets = false, faults = [], detached, over, preview, tileArt, onTile, onTilePress, onCell, className }: LayoutBoardProps) {
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
  const ring = editing ? EDIT_RINGS : VIEW_RINGS;
  const xs = tiles.length ? tiles.map((t) => t.x) : [0];
  const ys = tiles.length ? tiles.map((t) => t.y) : [0];
  const minX = Math.min(...xs) - ring;
  const maxX = Math.max(...xs) + ring;
  const minY = Math.min(...ys) - ring;
  const maxY = Math.max(...ys) + ring;
  const cols = maxX - minX + 1;
  const rows = maxY - minY + 1;
  const at = (c: Cell) => ({ gridColumn: c.x - minX + 1, gridRow: maxY - c.y + 1 });
  const overKey = over ? cellKey(over) : null;
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
        const cut = detached?.has(tile.id) ?? false;
        const chosen = selected === tile.id;
        const swapping = overKey === key && preview != null;
        const body = (
          <>
            <TileChip plan={tile.plan} orientation={tile.orientation} art={tileArt} className={cn("size-full rounded-[2px] border-0", swapping && "opacity-50")} />
            {starter && (
              <span aria-hidden className="absolute top-0.5 left-0.5 grid size-4 place-items-center rounded-sm bg-background/80 text-primary">
                <Icon name="lock" size="xs" />
              </span>
            )}
          </>
        );
        const ringed = cn(
          "relative block min-h-0 min-w-0 rounded-[3px]",
          cut && "outline-2 outline-offset-1 outline-dashed outline-destructive-text",
          chosen && "z-10 ring-2 ring-primary ring-offset-2 ring-offset-board",
        );
        cells.push(
          editing ? (
            <button
              key={key}
              type="button"
              data-cell={key}
              data-kind="tile"
              data-tile={tile.id}
              aria-pressed={chosen}
              aria-label={`${starter ? "The starter" : tileName(tile.plan)} at ${cellName(c)}${cut ? ", cut off" : ""}`}
              onClick={() => onTile?.(tile)}
              onPointerDown={(e) => onTilePress?.(tile, e)}
              style={at(c)}
              className={cn(ringed, "touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring")}
            >
              {body}
            </button>
          ) : (
            <span key={key} data-cell={key} data-kind="tile" style={at(c)} className={ringed}>
              {body}
            </span>
          ),
        );
        continue;
      }
      if (editing) {
        const hovered = overKey === key;
        cells.push(
          <button
            key={key}
            type="button"
            data-cell={key}
            data-kind="free"
            aria-label={`Empty cell at ${cellName(c)}`}
            disabled={!targets}
            onClick={() => onCell?.(c)}
            style={at(c)}
            className={cn(
              "relative block min-h-0 min-w-0 rounded-[3px] border border-dashed border-input/60 bg-secondary/25 outline-none focus-visible:ring-2 focus-visible:ring-ring",
              targets && "state-layer border-primary/50 bg-plate/40",
              hovered && "border-solid border-primary",
            )}
          >
            {hovered && preview && <TileChip plan={preview.plan} orientation={preview.orientation} art={tileArt} className="size-full rounded-[2px] border-0 opacity-80" />}
          </button>,
        );
        continue;
      }
      cells.push(<span key={key} aria-hidden style={at(c)} className="block min-h-0 min-w-0 rounded-[3px] bg-secondary/20" />);
    }
  }

  return (
    // `safe center`: a board wider than the screen scrolls from its edge, not from a centre cut off on both sides.
    <ScrollRegion orientation="both" className={cn("grid size-full bg-board p-4", className)} style={{ placeItems: "safe center" }}>
      <div
        ref={grid}
        role={editing ? "group" : "img"}
        aria-label={`Village layout of ${tiles.length} ${tiles.length === 1 ? "tile" : "tiles"}${faults.length ? `, ${faults.length} faulty ${faults.length === 1 ? "edge" : "edges"}` : ""}`}
        className="relative grid shrink-0 gap-0.5"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          aspectRatio: `${cols} / ${rows}`,
          // Every cell keeps the 44 px touch floor: past what the screen holds, the board scrolls.
          width: `max(${cols * MIN_CELL}px, min(100%, 70dvh))`,
        }}
      >
        {cells}
        {faults.map((f) => {
          // The mark sits on the shared edge: the north edge of `cell` (side 0), or its east edge (side 1).
          const left = f.side === 0 ? (f.cell.x - minX + 0.5) / cols : (f.cell.x - minX + 1) / cols;
          const top = f.side === 0 ? (maxY - f.cell.y) / rows : (maxY - f.cell.y + 0.5) / rows;
          return (
            <span
              key={`${cellKey(f.cell)}:${f.side}`}
              aria-hidden
              data-fault={`${cellKey(f.cell)}:${f.side}`}
              className={cn(
                "pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-destructive shadow-[0_0_0_2px_var(--board)]",
                f.side === 0 ? "h-1.5" : "w-1.5",
              )}
              style={{
                left: `${left * 100}%`,
                top: `${top * 100}%`,
                // Six tenths of the edge it marks.
                ...(f.side === 0 ? { width: `${(60 / cols).toFixed(3)}%` } : { height: `${(60 / rows).toFixed(3)}%` }),
              }}
            />
          );
        })}
        {!editing && <FogVeil clear={clear} minX={minX} maxY={maxY} cols={cols} rows={rows} />}
      </div>
    </ScrollRegion>
  );
}
