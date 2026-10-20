import { formatInteger } from "@paved/game-core";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { TokenIcon } from "./token-icon";

const cobblesVariants = cva("inline-flex items-center gap-1 whitespace-nowrap", {
  variants: {
    size: { sm: "text-xs", md: "text-sm", lg: "text-2xl" },
    tone: { default: "text-foreground", muted: "text-muted-foreground" },
  },
  defaultVariants: { size: "md", tone: "default" },
});

/** A Cobble count with a comma every three digits ("1,000"), as the packs are written. */
export function formatCobbles(cobbles: number): string {
  return formatInteger(cobbles);
}

export interface CobblesProps extends VariantProps<typeof cobblesVariants> {
  value: number;
  /** A sign before the count: `+` for a reward. */
  sign?: "+";
  className?: string;
}

/**
 * A Cobble count (P-61): the Cobbles' stones (`TokenIcon`, issue 620) and the figure in the mono font, one cell wide per digit, never
 * broken. Its accessible name says "N Cobbles"; the icon is decorative.
 */
export function Cobbles({ value, sign, size, tone, className }: CobblesProps) {
  const text = `${sign ?? ""}${formatCobbles(value)}`;
  return (
    <span role="img" aria-label={`${text} ${value === 1 ? "Cobble" : "Cobbles"}`} className={cn(cobblesVariants({ size, tone }), className)}>
      <TokenIcon kind="cobbles" size="em" />
      <span aria-hidden className="numeric font-semibold">
        {text}
      </span>
    </span>
  );
}
