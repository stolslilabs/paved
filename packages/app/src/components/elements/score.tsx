import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { formatInteger } from "@paved/game-core";
import { cva, type VariantProps } from "class-variance-authority";
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

/** Points with a space every three digits, as the mockups write them ("1 240"); no-break, one cell wide in the mono font. */
export function formatPoints(points: number): string {
  return formatInteger(points).replaceAll(",", "\u00a0");
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
  className?: string;
}

/**
 * A score: the font token `mono` with tabular figures, so a counting score never shifts its neighbours. The last move's
 * points ride on the label's line, so a narrow header keeps its width.
 */
export function Score({ value, label, icon, iconClassName, delta, size, tone, className }: ScoreProps) {
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
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <span className="flex items-baseline gap-2 text-xs text-muted-foreground">
          {label}
          {gain}
        </span>
      )}
      <ValueRow icon={icon} iconSize={ICON_SIZE[size ?? "md"]} iconClassName={cn("text-primary", iconClassName)}>
        <span className={scoreVariants({ size, tone })} data-testid="score-value">{formatPoints(value)}</span>
        {!label && gain}
      </ValueRow>
    </div>
  );
}
