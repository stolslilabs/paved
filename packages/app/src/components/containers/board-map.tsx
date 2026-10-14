import type { BoardTile } from "@paved/chain";
import { cn } from "../../lib/utils";
import { TileChip } from "../elements/tile-chip";

export interface BoardMapProps {
  tiles: BoardTile[];
  className?: string;
}

/**
 * The board seen from above, one tile chip per tile (x east, y north as the contracts count). The board scene draws
 * it where the 3D canvas is not given: in the render tests (jsdom has no WebGL) and as a plan view.
 */
export function BoardMap({ tiles, className }: BoardMapProps) {
  if (tiles.length === 0) return null;
  const xs = tiles.map((t) => t.x);
  const ys = tiles.map((t) => t.y);
  const minX = Math.min(...xs);
  const maxY = Math.max(...ys);
  const cols = Math.max(...xs) - minX + 1;
  const rows = maxY - Math.min(...ys) + 1;
  return (
    <div className={cn("absolute inset-0 grid place-items-center overflow-hidden bg-board p-6", className)}>
      <div
        role="img"
        aria-label={`Board of ${tiles.length} tiles`}
        className="grid aspect-square w-full max-w-[min(90vw,70vh)] gap-px"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)`, aspectRatio: `${cols} / ${rows}` }}
      >
        {tiles.map((t) => (
          <span key={t.id} style={{ gridColumn: t.x - minX + 1, gridRow: maxY - t.y + 1 }} className="block min-h-0 min-w-0">
            <TileChip
              plan={t.plan}
              orientation={t.orientation}
              state={t.pending ? "pending" : "default"}
              className="size-full rounded-[2px] border"
            />
          </span>
        ))}
      </div>
    </div>
  );
}
