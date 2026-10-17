import { useEffect, useState, type CSSProperties } from "react";
import type { BoardTile } from "@paved/chain";
import { cn } from "../../lib/utils";
import { TileChip } from "../elements/tile-chip";
import type { BoardGhost } from "./board-viewport";

/** Board centre of the contracts (0x7FFFFFFF): the starter tile's x and y. */
const CENTER = 2_147_483_647;

export interface BoardMapProps {
  tiles: BoardTile[];
  /**
   * The legal slots of the tile in hand in any rotation, as buttons (the contracts' coordinates): dashed, solid where the
   * current rotation fits (`fits`, unset: it fits).
   */
  slots?: { x: number; y: number; fits?: boolean }[];
  /** The tile in hand where it would go: placed (a yellow ring, red while its rotation does not fit) or a preview. */
  ghost?: BoardGhost | null;
  /** A move just sent: its cell flashes green and fades (`useConfirmFlash`). */
  confirmed?: (BoardGhost & { key: number }) | null;
  onSlotClick?: (slot: { x: number; y: number }) => void;
  /** The slots are lit (dashed, tinted). Off (the player's placement highlight setting): they stay buttons, drawn plain. */
  highlight?: boolean;
  className?: string;
}

/** A slot's name, from the starter: "2 east, 1 north". */
const slotName = (x: number, y: number) => {
  const dx = x - CENTER;
  const dy = y - CENTER;
  const part = (n: number, plus: string, minus: string) => (n === 0 ? null : `${Math.abs(n)} ${n > 0 ? plus : minus}`);
  return [part(dx, "east", "west"), part(dy, "north", "south")].filter(Boolean).join(", ") || "centre";
};

/** The grid's rings drawn around the tiles in the plan view (the board's 3D grid goes to 3; two keep the tiles large). */
const MAP_RINGS = 2;
/** A ring's grid opacity, as the board's (`gridRingOpacity`): full next to a tile, fainter one ring out. */
const RING_OPACITY = [0, 0.32, 0.13];

/** The cell's flash on confirm: green, fading to nothing over 700 ms (150 ms under reduced motion). */
function ConfirmFlash({ style }: { style: CSSProperties }) {
  const [faded, setFaded] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setFaded(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <span
      aria-hidden
      data-confirm
      style={style}
      className={cn(
        "pointer-events-none block min-h-0 min-w-0 rounded-[2px] border-2 border-meadow-400 bg-meadow-400/14 shadow-[0_0_12px_var(--color-meadow-400)] transition-opacity duration-700 ease-out motion-reduce:duration-150",
        faded && "opacity-0",
      )}
    />
  );
}

/**
 * The board seen from above, one tile chip per tile (x east, y north as the contracts count). The board scene draws
 * it where the 3D canvas is not given or cannot start: in the render tests (jsdom has no WebGL), without WebGL, and as
 * a plan view. With `slots` it is playable: each legal slot is a button, the ghost shows the tile in hand.
 */
export function BoardMap({ tiles, slots = [], ghost, confirmed, onSlotClick, highlight = true, className }: BoardMapProps) {
  if (tiles.length === 0) return null;
  const cells = [...tiles, ...slots];
  const xs = cells.map((t) => t.x);
  const ys = cells.map((t) => t.y);
  // The grid's rings around the tiles widen the map.
  const minX = Math.min(...xs) - MAP_RINGS;
  const maxY = Math.max(...ys) + MAP_RINGS;
  const cols = Math.max(...xs) + MAP_RINGS - minX + 1;
  const rows = maxY - (Math.min(...ys) - MAP_RINGS) + 1;
  // The empty cells within the rings, each with its ring (Chebyshev, as the board's grid): faint outlines.
  const taken = new Set(cells.map((c) => `${c.x},${c.y}`));
  const grid: { x: number; y: number; ring: number }[] = [];
  for (let x = minX; x < minX + cols; x++) {
    for (let y = maxY - rows + 1; y <= maxY; y++) {
      if (taken.has(`${x},${y}`)) continue;
      const ring = Math.min(...tiles.map((t) => Math.max(Math.abs(t.x - x), Math.abs(t.y - y))));
      if (ring <= MAP_RINGS) grid.push({ x, y, ring });
    }
  }
  const at = (x: number, y: number) => ({ gridColumn: x - minX + 1, gridRow: maxY - y + 1 });
  return (
    <div className={cn("absolute inset-0 grid place-items-center overflow-hidden bg-board p-6", className)}>
      <div
        // A picture, unless its slots make it a set of controls.
        role={slots.length ? "group" : "img"}
        aria-label={`Board of ${tiles.length} tiles`}
        className="grid aspect-square w-full max-w-[min(90vw,70vh)] gap-px"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)`, aspectRatio: `${cols} / ${rows}` }}
      >
        {grid.map((c) => (
          <span
            key={`g${c.x},${c.y}`}
            aria-hidden
            data-ring={c.ring}
            style={{ ...at(c.x, c.y), opacity: RING_OPACITY[c.ring] }}
            className="block min-h-0 min-w-0 border border-ink-200"
          />
        ))}
        {tiles.map((t) => (
          <span key={t.id} style={at(t.x, t.y)} className="block min-h-0 min-w-0">
            <TileChip
              plan={t.plan}
              orientation={t.orientation}
              state={t.pending ? "pending" : "default"}
              className="size-full rounded-[2px] border"
            />
          </span>
        ))}
        {slots.map((s) => {
          const chosen = ghost?.x === s.x && ghost.y === s.y;
          // A ghost given without `placed` is the chosen slot (the plan view has no hover).
          const placed = chosen && ghost?.placed !== false;
          const red = placed && ghost?.fits === false;
          return (
            <button
              key={`${s.x},${s.y}`}
              type="button"
              aria-label={`Slot ${slotName(s.x, s.y)}`}
              aria-pressed={placed}
              onClick={() => onSlotClick?.(s)}
              style={at(s.x, s.y)}
              data-lit={highlight}
              data-fits={s.fits !== false}
              data-placed={placed ? (red ? "red" : "yellow") : undefined}
              className={cn(
                "relative block min-h-0 min-w-0 rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !highlight
                  ? "border border-transparent"
                  : placed
                    ? red
                      ? "border-2 border-ember-500 shadow-[0_0_12px_var(--color-ember-500)] transition-colors duration-200 motion-reduce:transition-none"
                      : "border-2 border-primary shadow-[0_0_12px_var(--color-primary)] transition-colors duration-200 motion-reduce:transition-none"
                    : s.fits === false
                      ? "border border-dashed border-primary/70 bg-primary/10 hover:bg-primary/25"
                      : "border border-primary bg-primary/10 shadow-[0_0_6px_var(--color-primary)] hover:bg-primary/25",
              )}
            >
              {chosen && ghost && (
                <>
                  <TileChip plan={ghost.plan} orientation={ghost.orientation} state="default" className="size-full rounded-[2px] border opacity-90" />
                  {/* The veil: the state's own colour, the neon's (the renderer's pinned tokens), at its 0.14 (SLOTS2). */}
                  <span aria-hidden data-veil={red ? "red" : "yellow"} className={cn("absolute inset-0 rounded-[2px]", red ? "bg-ember-500/14" : "bg-gold-300/14")} />
                </>
              )}
            </button>
          );
        })}
        {confirmed && <ConfirmFlash key={confirmed.key} style={at(confirmed.x, confirmed.y)} />}
      </div>
    </div>
  );
}
