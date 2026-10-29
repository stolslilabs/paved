import { Suspense, lazy } from "react";
import { AnimatePresence, useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { GameIcon } from "../elements/game-icon";
import type { LayoutSaved } from "./layout-editor";
import type { VillageLayout } from "./layout-rules";

// The score's count after a save (#802, the balances' change): its own chunk, loaded by a save alone.
const LazyScoreCount = lazy(() => import("../elements/score-count").then((m) => ({ default: m.ScoreCount })));
// The kinds' sums (#831), computed with the engine: their own chunk, loaded as the accordion first unfolds.
const LazyScoreKinds = lazy(() => import("./score-kinds").then((m) => ({ default: m.ScoreKinds })));

/** The kinds' box while their chunk arrives: four rows of `ScoreKinds` (1.5 rem) and its foot, so the unfolding runs to the list's height. */
const KINDS_STAND_IN = <div aria-hidden className="h-25" />;

/** The village's game icon (#870). */
const ICON = <GameIcon name="house-tree" size="xs" />;
/** The total's figure, still. */
const figure = (score: number) => (
  <>
    {ICON}
    <span className="numeric font-semibold">{formatInteger(score)}</span>
  </>
);

export interface VillageScoreProps {
  /** The total shown: the score just saved, until the village's read has it too. */
  score: number;
  /** The village's tiles: the kinds' sums. */
  tiles: VillageLayout["tiles"];
  /** The last save landed (#802): the total counts to it once, from the score before. */
  saved?: LayoutSaved | null;
  /** Unfolded: the four kinds under the total. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}

/**
 * The home's village score under the profile (#831, the owner's decisions of 2026-10-27), an inline accordion in the overlay,
 * never a panel over the scene: folded, the total alone (the house, the figure, a chevron); a tap on it unfolds, in place, the
 * four kinds' sums under it (`ScoreKinds`), with a short height animation (none under reduced motion); another folds them. The
 * total is a button with `aria-expanded`, the kinds a list. After a save the total counts to the new score (#802).
 */
export function VillageScore({ score, tiles, saved, open, onOpenChange, className }: VillageScoreProps) {
  const reduced = useReducedMotionConfig();
  return (
    <div data-slot="village-score" className={cn("flex min-w-0 flex-col items-stretch rounded-md bg-background/70 text-xs backdrop-blur desktop:text-sm", className)}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label={`Village score ${formatInteger(score)}`}
        aria-expanded={open}
        aria-controls={open ? "village-score-kinds" : undefined}
        className="state-layer flex min-h-7 items-center gap-1.5 rounded-md px-2 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {saved ? (
          // Back in view after a save (#802), the score counts from the one before, the balances' way: once, as it mounts.
          <Suspense fallback={figure(saved.previous)}>
            <LazyScoreCount value={score} from={saved.previous} icon={ICON} className="font-semibold" />
          </Suspense>
        ) : (
          figure(score)
        )}
        <Icon name="chevron-right" size="xs" fixedWidth className={cn("ml-auto text-muted-foreground", !reduced && "transition-transform", open && "rotate-90")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <m.div
            key="kinds"
            id="village-score-kinds"
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <Suspense fallback={KINDS_STAND_IN}>
              <LazyScoreKinds tiles={tiles} className="px-2 pb-1" />
            </Suspense>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
