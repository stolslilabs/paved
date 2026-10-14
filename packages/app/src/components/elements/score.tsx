import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const scoreVariants = cva("font-mono font-semibold tabular-nums leading-none", {
  variants: {
    size: { sm: "text-base", md: "text-2xl", lg: "text-4xl", xl: "text-5xl tablet:text-6xl" },
    tone: { default: "text-foreground", gold: "text-primary", muted: "text-muted-foreground" },
  },
  defaultVariants: { size: "md", tone: "default" },
});

/** Points with a thin space every three digits, as the mockups write them ("1 240"). */
export function formatPoints(points: number): string {
  return Math.round(points).toLocaleString("en-US").replaceAll(",", " ");
}

export interface ScoreProps extends VariantProps<typeof scoreVariants> {
  value: number;
  label?: string;
  /** Points the last move added: shown beside the score, then gone when the next move clears it. */
  delta?: number | null;
  className?: string;
}

/** A score: the font token `mono` with tabular figures, so a counting score never shifts its neighbours. */
export function Score({ value, label, delta, size, tone, className }: ScoreProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
      <span className="flex items-baseline gap-2">
        <span className={scoreVariants({ size, tone })} data-testid="score-value">{formatPoints(value)}</span>
        <AnimatePresence>
          {delta ? (
            <m.span
              key={`${value}-${delta}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="font-mono text-sm font-semibold text-success tabular-nums"
            >
              +{formatPoints(delta)}
            </m.span>
          ) : null}
        </AnimatePresence>
      </span>
    </div>
  );
}
