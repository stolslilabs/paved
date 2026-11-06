import { memo } from "react";
import { CategoryType, type LayoutBreakdown } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { formatPoints } from "../elements/score";
import { ClosingLine } from "./closing-feed";

// The village's points by structure (#758): the lines of a game's score screen (`ClosingLine`), each a toggle that lights its
// structure on the scene: edit mode's Score tab (EDIT-VILLAGE; a fold in its panel before). The home's view has the kinds' sums instead (#831, `village-score.tsx`).

const CATEGORIES = Object.values(CategoryType);

export interface PointsListProps {
  breakdown: LayoutBreakdown;
  /** The line lit (its structure's `key`), or none. */
  selected: string | null;
  /** A line tapped: its key to light it, null to turn the light off (the lit line tapped again). */
  onSelect: (key: string | null) => void;
  className?: string;
}

/**
 * The lines, the most points first: a tap lights the line's structure (`aria-pressed`), a tap on the lit line turns it off, a
 * tap on another moves the light. Points no structure holds take a line of their own, not a toggle. No entry animation.
 */
function PointsListBase({ breakdown, selected, onSelect, className }: PointsListProps) {
  const { lines, other } = breakdown;
  if (lines.length === 0 && other === 0) return <p className={cn("px-1 py-2 text-xs text-muted-foreground", className)}>No structure closed yet: close a road, a city or a forest to score.</p>;
  return (
    <ul aria-label="Points by structure" className={cn("flex flex-col gap-1", className)}>
      {lines.map((line) => {
        const on = line.key === selected;
        return (
          <li key={line.key}>
            <button
              type="button"
              aria-pressed={on}
              data-line={line.key}
              onClick={() => onSelect(on ? null : line.key)}
              className={cn(
                "state-layer flex min-h-11 w-full items-center rounded-lg border px-3 py-1.5 text-left transition-colors outline-none",
                on ? "border-primary bg-primary/15" : "border-transparent",
              )}
            >
              <ClosingLine closing={{ category: CATEGORIES.indexOf(line.category), size: line.size, points: line.points }} tiles={line.tiles} className="w-full" />
            </button>
          </li>
        );
      })}
      {other !== 0 && (
        <li className="flex min-h-11 items-center justify-between px-3 text-sm">
          <span className="text-muted-foreground">Other</span>
          <span className="numeric font-semibold">
            {other > 0 ? "+" : "−"}
            {formatPoints(Math.abs(other))}
          </span>
        </li>
      )}
    </ul>
  );
}

/** The points' lines, drawn again only when their props change (the board's changes leave them, #803): the editor's Score tab. */
export const PointsList = memo(PointsListBase);
