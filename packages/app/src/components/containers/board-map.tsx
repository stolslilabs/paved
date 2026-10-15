import type { BoardTile } from "@paved/chain";
import { cn } from "../../lib/utils";
import { TileChip } from "../elements/tile-chip";
import type { BoardGhost } from "./board-viewport";

/** Board centre of the contracts (0x7FFFFFFF): the starter tile's x and y. */
const CENTER = 2_147_483_647;

export interface BoardMapProps {
  tiles: BoardTile[];
  /** The legal slots of the tile in hand, as buttons (the contracts' coordinates). */
  slots?: { x: number; y: number }[];
  /** The tile in hand where it would go. */
  ghost?: BoardGhost | null;
  onSlotClick?: (slot: { x: number; y: number }) => void;
  className?: string;
}

/** A slot's name, from the starter: "2 east, 1 north". */
const slotName = (x: number, y: number) => {
  const dx = x - CENTER;
  const dy = y - CENTER;
  const part = (n: number, plus: string, minus: string) => (n === 0 ? null : `${Math.abs(n)} ${n > 0 ? plus : minus}`);
  return [part(dx, "east", "west"), part(dy, "north", "south")].filter(Boolean).join(", ") || "centre";
};

/**
 * The board seen from above, one tile chip per tile (x east, y north as the contracts count). The board scene draws
 * it where the 3D canvas is not given or cannot start: in the render tests (jsdom has no WebGL), without WebGL, and as
 * a plan view. With `slots` it is playable: each legal slot is a button, the ghost shows the tile in hand.
 */
export function BoardMap({ tiles, slots = [], ghost, onSlotClick, className }: BoardMapProps) {
  if (tiles.length === 0) return null;
  const cells = [...tiles, ...slots];
  const xs = cells.map((t) => t.x);
  const ys = cells.map((t) => t.y);
  const minX = Math.min(...xs);
  const maxY = Math.max(...ys);
  const cols = Math.max(...xs) - minX + 1;
  const rows = maxY - Math.min(...ys) + 1;
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
          return (
            <button
              key={`${s.x},${s.y}`}
              type="button"
              aria-label={`Slot ${slotName(s.x, s.y)}`}
              aria-pressed={chosen}
              onClick={() => onSlotClick?.(s)}
              style={at(s.x, s.y)}
              className="block min-h-0 min-w-0 rounded-[2px] border border-dashed border-primary/70 bg-primary/10 outline-none hover:bg-primary/25 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {chosen && ghost && <TileChip plan={ghost.plan} orientation={ghost.orientation} state="selected" className="size-full rounded-[2px] border opacity-80" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
