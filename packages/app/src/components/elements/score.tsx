import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { formatInteger } from "@paved/game-core";
import { cva, type VariantProps } from "class-variance-authority";
import { lazy, Suspense } from "react";
import { cn } from "../../lib/utils";
import type { IconSize } from "../ui/icon";
import { ValueRow } from "./value-row";

const scoreVariants = cva("numeric font-semibold leading-none", {
  variants: {
    size: { sm: "text-base", hud: "text-xl tablet:text-2xl", md: "text-2xl", lg: "text-4xl", xl: "text-5xl tablet:text-6xl" },
    tone: { default: "text-foreground", gold: "text-primary", muted: "text-muted-foreground" },
  },
  defaultVariants: { size: "md", tone: "default" },
});

// The count after a save (#802, the balances' change): its own chunk, loaded by a save alone.
const LazyScoreCount = lazy(() => import("./amount-change").then((m) => ({ default: m.ScoreCount })));

/** Points with a comma every three digits, in en-US like every number (P-66): "1,270". The owner's word wins over the mockups' "1 240". */
export function formatPoints(points: number): string {
  return formatInteger(points);
}

/** The icon beside each size's figure (Font Awesome sizes an icon as its font size). */
const ICON_SIZE: Record<NonNullable<VariantProps<typeof scoreVariants>["size"]>, IconSize> = { sm: "sm", hud: "md", md: "md", lg: "lg", xl: "xl" };

export interface ScoreProps extends VariantProps<typeof scoreVariants> {
  value: number;
  label?: string;
  /** A Font Awesome name: the icon shares the value's row (`ValueRow`), under the label. */
  icon?: string;
  /** On the icon's wrapper, e.g. `hidden tablet:inline-flex` to drop it on a phone; `text-primary` is its default colour. */
  iconClassName?: string;
  /** Points the last move added: shown with the score, then gone when the next move clears it. */
  delta?: number | null;
  /**
   * The points the tile placed, not yet validated, would score (the engine's preview, PLACE-POLISH, issue 568): "(+154)" in
   * the primary colour and in brackets, beside the value. With a label it rides on the label's line, in place of the last
   * move's gain (`delta`, green, moving in), which it outdates, and in place of the label (kept for screen readers): "(+154)"
   * over "1,000". The HUD keeps its width down to 320 px, where "1,000 (+154)" on one line left no room for the title beside
   * the season wheel and the deck. Unset or null: none.
   */
  preview?: number | null;
  /** The score shown before (a save that just landed, #802): it counts from it to `value` once, the balances' way. */
  from?: number;
  className?: string;
}

/**
 * A score: the font token `mono` with tabular figures, so a counting score never shifts its neighbours. The last move's
 * points ride on the label's line, so a narrow header keeps its width.
 */
export function Score({ value, label, icon, iconClassName, delta, preview, from, size, tone, className }: ScoreProps) {
  const gain = (
    <AnimatePresence>
      {delta ? (
        <m.span
          key={`${value}-${delta}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="numeric text-xs font-semibold text-success"
        >
          +{formatPoints(delta)}
        </m.span>
      ) : null}
    </AnimatePresence>
  );
  const previewed =
    preview != null ? (
      <span data-testid="score-preview" title="The points this tile would score" className="numeric text-xs font-semibold text-primary">
        (+{formatPoints(preview)})<span className="sr-only"> if placed</span>
      </span>
    ) : null;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <span className="flex items-baseline gap-2 text-xs text-muted-foreground">
          {/* With a preview, the preview takes the label's place (the label read, not shown): the column keeps its width. */}
          <span className={cn(previewed && "sr-only")}>{label}</span>
          {previewed ?? gain}
        </span>
      )}
      <ValueRow icon={icon} iconSize={ICON_SIZE[size ?? "md"]} iconClassName={cn("text-primary", iconClassName)}>
        <span className={scoreVariants({ size, tone })} data-testid="score-value">
          {from === undefined ? (
            formatPoints(value)
          ) : (
            <Suspense fallback={formatPoints(from)}>
              <LazyScoreCount value={value} from={from} />
            </Suspense>
          )}
        </span>
        {!label && (previewed ?? gain)}
      </ValueRow>
    </div>
  );
}
