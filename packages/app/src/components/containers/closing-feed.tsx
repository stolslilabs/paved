import type { ScoredStructure } from "@paved/chain";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { CategoryType } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { CategoryIcon, categoryInfo } from "../elements/category";
import { HudFrame } from "../elements/hud-frame";
import type { UiIconName } from "../elements/ui-art";
import { UiIcon } from "../elements/ui-icon";
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

/** A category's painting: a name of the HUD's paintings (its own alias, so the Font Awesome subset reads no name in the table). */
type Painting = UiIconName;
/** Each category's painting (the Tiles page's), by the contracts' index: the city's castle, the road, the forest, the wonder. */
const PAINTED: Readonly<Partial<Record<string, Painting>>> = {
  [CategoryType.City]: "city",
  [CategoryType.Road]: "road",
  [CategoryType.Forest]: "forest",
  [CategoryType.Wonder]: "wonder",
};

/** A closing's painting, or the category's relief icon where none is painted (a category the client does not know). */
function ClosingArt({ category }: { category: number }) {
  const art = PAINTED[Object.values(CategoryType)[category] as string];
  return art ? <UiIcon name={art} px={28} className="drawer-icon size-7 shrink-0" /> : <CategoryIcon category={category} size="sm" />;
}

/**
 * The closing points as they appear (GAME-OVERLAY: on the HUD's capsules, the categories painted): each structure the last move
 * closed slides in over the board, its painting, its name and size, the points in green, outlined; the next move clears them.
 */
export function ClosingFeed({ closings, className }: ClosingFeedProps) {
  return (
    <div aria-live="polite" className={cn("pointer-events-none flex flex-col items-center gap-1.5", className)}>
      <AnimatePresence>
        {closings.map((c, i) => {
          const info = categoryInfo(c.category);
          return (
            <m.div
              key={`${i}-${c.category}-${c.size}-${c.points}`}
              data-closing
              initial={{ opacity: 0, y: -12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: i * 0.15, type: "spring", stiffness: 400, damping: 30 }}
              className="relative isolate flex w-64 max-w-full items-center gap-2 py-1 pr-3 pl-1.5"
            >
              <HudFrame px={10} />
              <ClosingArt category={c.category} />
              <span className="text-outline flex min-w-0 flex-1 items-baseline gap-2 text-sm font-bold">
                <span>{info.label}</span>
                <span className="text-xs text-muted-foreground">{c.size} tiles</span>
              </span>
              <span className={cn("numeric text-outline text-sm font-bold", c.points > 0 ? "text-success" : "text-muted-foreground")}>+{formatPoints(c.points)}</span>
            </m.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
