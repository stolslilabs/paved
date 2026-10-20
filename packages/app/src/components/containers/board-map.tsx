import { useEffect, useState, type CSSProperties } from "react";
import type { BoardTile } from "@paved/chain";
import { boardPlates, type PlateState } from "../../data/placement";
import { cn } from "../../lib/utils";
import { TileChip } from "../elements/tile-chip";
import type { BoardGhost } from "./board-viewport";

/** Board centre of the contracts (0x7FFFFFFF): the starter tile's x and y. */
const CENTER = 2_147_483_647;

export interface BoardMapProps {
  tiles: BoardTile[];
  /**
   * The legal slots of the tile in hand in any rotation, as buttons (the contracts' coordinates): a plate each
   * (`fits`: the current rotation fits there, unset: it does). Every other free cell
   * next to a tile gets an invalid plate, not a button (`boardPlates`). Unset: no tile in hand, no plate; an empty list: a tile
   * that fits nowhere, invalid plates all around.
   */
  slots?: { x: number; y: number; fits?: boolean }[];
  /** The tile in hand where it would go: placed (tinted yellow) or a preview. */
  ghost?: BoardGhost | null;
  /** A move just sent: a green tint fades (`useConfirmFlash`). */
  confirmed?: (BoardGhost & { key: number }) | null;
  onSlotClick?: (slot: { x: number; y: number }) => void;
  /** The plates are drawn. Off (the player's placement highlight setting): the slots stay buttons, drawn plain. */
  highlight?: boolean;
  /** The faint cell outlines around the tiles by ring (SLOTS' grid): off by default, as the board's (PLATES). */
  grid?: boolean;
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

/**
 * A plate in its cell, as the board's (`DEFAULT_PLACEMENT_SETTINGS.plates`): inset by half the 4-voxel gap of a 40-voxel
 * tile (5 %) on each side, its corners rounded, each change eased over 150 ms.
 */
const PLATE = "pointer-events-none absolute inset-[5%] block rounded-[2px] transition duration-150 ease-out motion-reduce:transition-none";
/** The two states, on the token the renderer's colour is pinned to: one grey, flat, the opacities the board's. */
const PLATE_STATE: Record<PlateState, string> = {
  playable: "bg-plate/55",
  invalid: "bg-plate/20",
};
/** The placed tile's tint, over the tile: yellow (gold-300, the renderer's). */
const TINT = "pointer-events-none absolute inset-0 block rounded-[2px] transition duration-150 ease-out motion-reduce:transition-none";
const TINT_TONE = "bg-gold-300/40";

/** The cell's green tint on confirm, fading to nothing over 700 ms (150 ms under reduced motion). */
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
        "pointer-events-none block min-h-0 min-w-0 rounded-[2px] bg-meadow-400/60 transition-opacity duration-700 ease-out motion-reduce:duration-150",
        faded && "opacity-0",
      )}
    />
  );
}

/**
 * The board seen from above, one tile chip per tile (x east, y north as the contracts count). The board scene draws
 * it where the 3D canvas is not given or cannot start: in the render tests (jsdom has no WebGL), without WebGL, and as
 * a plan view. With `slots` it is playable: each legal slot is a button on its plate, the ghost shows the tile in hand.
 */
export function BoardMap({ tiles, slots, ghost, confirmed, onSlotClick, highlight = true, grid: showGrid = false, className }: BoardMapProps) {
  const slotList = slots ?? [];
  if (tiles.length === 0) return null;
  const plates = highlight ? boardPlates(tiles, slots) : [];
  const invalid = plates.filter((p) => p.state === "invalid");
  const cells = [...tiles, ...slotList, ...invalid];
  const xs = cells.map((t) => t.x);
  const ys = cells.map((t) => t.y);
  // The grid's rings around the tiles widen the map (drawn or not, the map keeps its frame).
  const minX = Math.min(...xs) - MAP_RINGS;
  const maxY = Math.max(...ys) + MAP_RINGS;
  const cols = Math.max(...xs) + MAP_RINGS - minX + 1;
  const rows = maxY - (Math.min(...ys) - MAP_RINGS) + 1;
  // The empty cells within the rings, each with its ring (Chebyshev, as the board's grid): faint outlines.
  const taken = new Set(cells.map((c) => `${c.x},${c.y}`));
  const grid: { x: number; y: number; ring: number }[] = [];
  if (showGrid) {
    for (let x = minX; x < minX + cols; x++) {
      for (let y = maxY - rows + 1; y <= maxY; y++) {
        if (taken.has(`${x},${y}`)) continue;
        const ring = Math.min(...tiles.map((t) => Math.max(Math.abs(t.x - x), Math.abs(t.y - y))));
        if (ring <= MAP_RINGS) grid.push({ x, y, ring });
      }
    }
  }
  const stateOf = new Map(plates.map((p) => [`${p.x},${p.y}`, p.state]));
  const at = (x: number, y: number) => ({ gridColumn: x - minX + 1, gridRow: maxY - y + 1 });
  return (
    <div className={cn("absolute inset-0 grid place-items-center overflow-hidden bg-board p-6", className)}>
      <div
        // A picture, unless its slots make it a set of controls.
        role={slotList.length ? "group" : "img"}
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
            className="block min-h-0 min-w-0 border border-charcoal-200"
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
        {invalid.map((p) => (
          <span key={`i${p.x},${p.y}`} aria-hidden style={at(p.x, p.y)} className="relative block min-h-0 min-w-0">
            <span data-plate="invalid" className={cn(PLATE, PLATE_STATE.invalid)} />
          </span>
        ))}
        {slotList.map((s) => {
          const chosen = ghost?.x === s.x && ghost.y === s.y;
          // A ghost given without `placed` is the chosen slot (the plan view has no hover).
          const placed = chosen && ghost?.placed !== false;
          const state = stateOf.get(`${s.x},${s.y}`);
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
              data-placed={placed ? "pending" : undefined}
              className="state-layer relative block min-h-0 min-w-0 rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {state && <span data-plate={state} className={cn(PLATE, PLATE_STATE[state])} />}
              {chosen && ghost && <TileChip plan={ghost.plan} orientation={ghost.orientation} state="default" className="relative size-full rounded-[2px] border opacity-90" />}
              {placed && highlight && <span aria-hidden data-tint="pending" className={cn(TINT, TINT_TONE)} />}
            </button>
          );
        })}
        {confirmed && <ConfirmFlash key={confirmed.key} style={at(confirmed.x, confirmed.y)} />}
      </div>
    </div>
  );
}
