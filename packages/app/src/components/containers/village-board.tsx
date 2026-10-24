import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { ScrollRegion } from "../ui/scroll-region";
import { cellKey, clearCells, type Cell, type LegalCell, type Village } from "./village-rules";

/**
 * The plan's fog (#633's village variant): `village` clears the owned cells and the cells next to them, the rest of the ground
 * is veiled; `off` draws no fog. The 3D village (`VillageViewport`, #648) draws the renderer's fog of war instead.
 */
export type VillageFog = "village" | "off";

/** The reward's tile while the player places it: where it can go. */
export interface VillagePlacing {
  plan: number;
  orientation: number;
  legal: readonly LegalCell[];
}

export interface VillageBoardProps {
  village: Pick<Village, "cells" | "tiles">;
  fog?: VillageFog;
  placing?: VillagePlacing | null;
  /** The cell the dragged tile is over: the tile is previewed there. */
  over?: Cell | null;
  tileArt?: TileArt;
  /** A legal free cell chosen for the tile being placed. */
  onPlace?: (cell: Cell) => void;
  className?: string;
}

/** A cell's least width with its gap: the 44 px touch floor and the grid's 2 px gap. */
const MIN_CELL = 46;

/** The rings of fogged ground drawn around the clear cells. */
const FOG_RINGS = 2;

/**
 * The fog in the plan view: one veil over the board, cut out over the clear cells, its edge blurred so it rolls off them (#633's
 * rule; the 3D village, `VillageViewport`, draws the renderer's fog instead). Decorative: the cells say what is there.
 */
export function FogVeil({ clear, minX, maxY, cols, rows }: { clear: readonly Cell[]; minX: number; maxY: number; cols: number; rows: number }) {
  const id = useId();
  return (
    <svg aria-hidden data-fog viewBox={`0 0 ${cols} ${rows}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full">
      <defs>
        <filter id={`${id}b`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="0.35" />
        </filter>
        <mask id={`${id}m`} maskUnits="userSpaceOnUse" x={0} y={0} width={cols} height={rows}>
          <rect width={cols} height={rows} fill="white" />
          <g filter={`url(#${id}b)`}>
            {clear.map((c) => (
              <rect key={cellKey(c)} x={c.x - minX - 0.05} y={maxY - c.y - 0.05} width={1.1} height={1.1} fill="black" />
            ))}
          </g>
        </mask>
      </defs>
      <rect width={cols} height={rows} fill="var(--fog)" opacity={0.42} mask={`url(#${id}m)`} />
    </svg>
  );
}

/** A cell's name from the village's first cell: "2 east, 1 north". */
export function cellName(c: Cell): string {
  const part = (n: number, plus: string, minus: string) => (n === 0 ? null : `${Math.abs(n)} ${n > 0 ? plus : minus}`);
  return [part(c.x, "east", "west"), part(c.y, "north", "south")].filter(Boolean).join(", ") || "centre";
}

/**
 * The village seen from above (#646): the owned cells (the placed tiles, the free cells dashed) and the fog over the rest.
 * While a reward's tile is placed, its legal cells are lit plates: buttons, and `data-cell` lets a drag find them under the
 * pointer. Shared with the PvP flow (#647): the attack draws the defender's territory with it. The parcels and the tiers'
 * bases left with v2 (#739); the v2 village draws its free layout with `LayoutBoard`.
 */
export function VillageBoard({ village, fog = "village", placing, over, tileArt, onPlace, className }: VillageBoardProps) {
  const grid = useRef<HTMLDivElement>(null);
  // A board wider than the screen opens on its middle, where the village is (the scroll region holds the grid).
  const extent = village.cells.length;
  useLayoutEffect(() => {
    const el = grid.current?.parentElement;
    if (!el) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  }, [extent]);
  const owned = new Set(village.cells.map(cellKey));
  const clear = clearCells(village.cells);
  const legal = new Map((placing?.legal ?? []).map((c) => [cellKey(c), c]));
  const byCell = new Map(village.tiles.map((t) => [cellKey(t), t]));
  const clearList = [...clear].map((k) => {
    const [x, y] = k.split(",").map(Number);
    return { x: x!, y: y! };
  });
  if (clearList.length === 0) return null;
  const margin = fog === "village" ? FOG_RINGS : 0;
  const minX = Math.min(...clearList.map((c) => c.x)) - margin;
  const maxX = Math.max(...clearList.map((c) => c.x)) + margin;
  const minY = Math.min(...clearList.map((c) => c.y)) - margin;
  const maxY = Math.max(...clearList.map((c) => c.y)) + margin;
  const cols = maxX - minX + 1;
  const rows = maxY - minY + 1;
  const at = (c: Cell) => ({ gridColumn: c.x - minX + 1, gridRow: maxY - c.y + 1 });
  const overKey = over ? cellKey(over) : null;

  const cells: ReactNode[] = [];
  for (let y = maxY; y >= minY; y--) {
    for (let x = minX; x <= maxX; x++) {
      const c = { x, y };
      const key = cellKey(c);
      const tile = byCell.get(key);
      if (tile) {
        cells.push(
          <span key={key} data-cell={key} data-kind="tile" style={at(c)} className={cn("block min-h-0 min-w-0", placing && "opacity-60")}>
            <TileChip plan={tile.plan} orientation={tile.orientation} art={tileArt} className="size-full rounded-[3px] border-0" />
          </span>,
        );
        continue;
      }
      if (owned.has(key)) {
        const spot = legal.get(key);
        if (spot) {
          const hovered = overKey === key;
          cells.push(
            <button
              key={key}
              type="button"
              data-cell={key}
              data-kind="legal"
              aria-label={`Place it at ${cellName(c)}`}
              onClick={() => onPlace?.(c)}
              style={at(c)}
              className="state-layer relative block min-h-0 min-w-0 rounded-[3px] border border-primary/60 bg-plate/55 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {hovered && placing && (
                <TileChip
                  plan={placing.plan}
                  orientation={spot.orientations.includes(placing.orientation) ? placing.orientation : spot.orientations[0]}
                  art={tileArt}
                  className="size-full rounded-[2px] border-0 opacity-80"
                />
              )}
            </button>,
          );
        } else {
          cells.push(
            <span
              key={key}
              data-cell={key}
              data-kind="free"
              aria-hidden
              style={at(c)}
              className={cn("block min-h-0 min-w-0 rounded-[3px] border border-dashed border-input bg-secondary/50", placing && "opacity-40")}
            />,
          );
        }
        continue;
      }
      // The ground: clear next to the village, under the fog beyond it.
      cells.push(<span key={key} aria-hidden style={at(c)} className="block min-h-0 min-w-0 rounded-[3px] bg-secondary/20" />);
    }
  }

  return (
    // `safe center`: a board wider than the screen scrolls from its edge, not from a centre cut off on both sides.
    <ScrollRegion orientation="both" className={cn("grid size-full bg-board p-4", className)} style={{ placeItems: "safe center" }}>
      <div
        ref={grid}
        role={placing ? "group" : "img"}
        aria-label={`Village of ${village.cells.length} cells and ${village.tiles.length} tiles`}
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
        {fog === "village" && <FogVeil clear={clearList} minX={minX} maxY={maxY} cols={cols} rows={rows} />}
      </div>
    </ScrollRegion>
  );
}
