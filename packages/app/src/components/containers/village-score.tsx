import { Suspense, lazy } from "react";
import * as m from "motion/react-m";
import { formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { Plate, PLATE_FIGURE, plateHudIconClass, plateHudIconPx } from "../elements/plate";
import { UiIcon } from "../elements/ui-icon";
import type { LayoutSaved } from "./layout-editor";

// The score's count after a save (#802, the balances' change) and the save's notice (EDIT-VILLAGE): their own chunk, loaded by a save alone.
const LazyScoreCount = lazy(() => import("../elements/score-count").then((m) => ({ default: m.ScoreCount })));

export interface VillageScoreProps {
  /** The total shown: the score just saved, until the village's read has it too. */
  score: number;
  /** The last save landed (#802): the total counts to it once, from the score before. */
  saved?: LayoutSaved | null;
  /** Opens edit mode. None (a guest, a village to look at): the capsule is the score alone, not a button. */
  onEdit?: () => void;
  className?: string;
}

/** The total, still. */
const figure = (score: number) => <span className={cn(PLATE_FIGURE, "text-outline text-foreground")}>{formatInteger(score)}</span>;

/**
 * The home's village score under the crowns (#755; a capsule since HOME-UI-CAPSULES, `docs/design/home.webp`): the HUD's frame, the
 * HUD's village capping its left end, the total in it. A tap opens edit mode, which has the kinds' points (#758): the accordion of
 * #831 went (the owner's decision of 2026-11-02). After a save the total counts to the new score (#802).
 */
export function VillageScore({ score, saved, onEdit, className }: VillageScoreProps) {
  const plate = (
    <Plate side="left" size="auto" frame="hud" className="flex-1" end={<UiIcon name="village" px={plateHudIconPx("auto")} className={plateHudIconClass("auto")} />}>
      <span aria-hidden className="flex items-center">
        {saved ? (
          // Back in view after a save (#802), the score counts from the one before, the balances' way: once, as it mounts.
          <Suspense fallback={figure(saved.previous)}>
            <LazyScoreCount value={score} from={saved.previous} className={cn(PLATE_FIGURE, "text-outline text-foreground")} />
          </Suspense>
        ) : (
          figure(score)
        )}
      </span>
    </Plate>
  );
  const name = formatInteger(score);
  return onEdit ? (
    <m.button
      type="button"
      onClick={onEdit}
      whileTap={{ scale: 0.95 }}
      aria-label={`Edit village, score ${name}`}
      data-slot="village-score"
      className={cn("group flex min-h-11 items-center rounded-full outline-none", className)}
    >
      {plate}
    </m.button>
  ) : (
    <div role="group" aria-label={`Village score ${name}`} data-slot="village-score" className={cn("flex min-h-11 items-center", className)}>
      {plate}
    </div>
  );
}
