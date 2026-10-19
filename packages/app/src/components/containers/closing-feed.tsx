import type { ScoredStructure } from "@paved/chain";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "../../lib/utils";
import { CategoryIcon, categoryInfo } from "../elements/category";
import { formatPoints } from "../elements/score";

export interface ClosingLineProps {
  closing: ScoredStructure;
  /** The move that closed it, when the list shows the whole game. */
  move?: number;
  /** Its distinct tiles (`gameStats`): shown instead of `size`, which counts the areas it spans. */
  tiles?: number;
  className?: string;
}

/** One closed structure: its category, its size in tiles, the points it scored (a forest can close at 0). */
export function ClosingLine({ closing, move, tiles, className }: ClosingLineProps) {
  const info = categoryInfo(closing.category);
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <CategoryIcon category={closing.category} size="sm" />
      <span className="flex min-w-0 flex-1 items-baseline gap-2 text-sm">
        <span>{info.label}</span>
        <span className="text-xs text-muted-foreground">
          {tiles ?? closing.size} tiles{move != null && <> · tile {move}</>}
        </span>
      </span>
      <span className={cn("numeric text-sm font-semibold", closing.points > 0 ? "text-success" : "text-muted-foreground")}>
        +{formatPoints(closing.points)}
      </span>
    </div>
  );
}

export interface ClosingFeedProps {
  /** What the last move closed (`SessionState.lastScored`), in receipt order. */
  closings: ScoredStructure[];
  className?: string;
}

/** The closing points as they appear: each structure the last move closed slides in over the board, then the next move clears them. */
export function ClosingFeed({ closings, className }: ClosingFeedProps) {
  return (
    <div aria-live="polite" className={cn("pointer-events-none flex flex-col items-center gap-1.5", className)}>
      <AnimatePresence>
        {closings.map((c, i) => (
          <m.div
            key={`${i}-${c.category}-${c.size}-${c.points}`}
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: i * 0.15, type: "spring", stiffness: 400, damping: 30 }}
            className="w-64 rounded-lg border border-primary/30 bg-card/95 px-3 py-2 shadow-lg backdrop-blur"
          >
            <ClosingLine closing={c} />
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
