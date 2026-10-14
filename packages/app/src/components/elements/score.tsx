import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const scoreVariants = cva("font-mono font-semibold tabular-nums leading-none", {
  variants: {
    size: { sm: "text-base", hud: "text-xl tablet:text-2xl", md: "text-2xl", lg: "text-4xl", xl: "text-5xl tablet:text-6xl" },
    tone: { default: "text-foreground", gold: "text-primary", muted: "text-muted-foreground" },
  },
  defaultVariants: { size: "md", tone: "default" },
});

/** Points with a space every three digits, as the mockups write them ("1 240"); no-break, one cell wide in the mono font. */
export function formatPoints(points: number): string {
  return Math.round(points).toLocaleString("en-US").replaceAll(",", "\u00a0");
}

export interface ScoreProps extends VariantProps<typeof scoreVariants> {
  value: number;
  label?: string;
  /** Points the last move added: shown with the score, then gone when the next move clears it. */
  delta?: number | null;
  className?: string;
}

/**
 * A score: the font token `mono` with tabular figures, so a counting score never shifts its neighbours. The last move's
 * points ride on the label's line, so a narrow header keeps its width.
 */
export function Score({ value, label, delta, size, tone, className }: ScoreProps) {
  const gain = (
    <AnimatePresence>
      {delta ? (
        <m.span
          key={`${value}-${delta}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="font-mono text-xs font-semibold text-success tabular-nums"
        >
          +{formatPoints(delta)}
        </m.span>
      ) : null}
    </AnimatePresence>
  );
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <span className="flex items-baseline gap-2 text-xs text-muted-foreground">
          {label}
          {gain}
        </span>
      )}
      <span className="flex items-baseline gap-2">
        <span className={scoreVariants({ size, tone })} data-testid="score-value">{formatPoints(value)}</span>
        {!label && gain}
      </span>
    </div>
  );
}
