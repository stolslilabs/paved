import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

/**
 * A tier's base (#646): the plinth under a tile, whatever its skin. Dirt, silver, gold, diamond, ruby, from the tokens
 * `--tier-0` to `--tier-4` (`theme.css`). The names live in `containers/village-rules.ts` (`TIERS`).
 */
export const tierBaseVariants = cva("relative block rounded-[3px]", {
  variants: {
    tier: { 0: "bg-tier-0", 1: "bg-tier-1", 2: "bg-tier-2", 3: "bg-tier-3", 4: "bg-tier-4" },
    /** The rim's width: thin on a board cell, wider on a card. */
    rim: { thin: "p-[8%]", wide: "p-[10%]" },
  },
  defaultVariants: { tier: 0, rim: "thin" },
});

export interface TierBaseProps extends VariantProps<typeof tierBaseVariants> {
  children?: ReactNode;
  className?: string;
}

/**
 * A tile on its tier's base: the base shows as a rim around it. The rim is a share of the parent's width (CSS padding), so the
 * base sits in a box of its own size (a board cell, a card's square). Decorative: the tile and the
 * tier's name say what it is.
 */
export function TierBase({ tier, rim, children, className }: TierBaseProps) {
  return (
    <span data-tier={tier ?? 0} className={cn(tierBaseVariants({ tier, rim }), className)}>
      {children}
    </span>
  );
}

/** A tier's swatch beside its name: a small square of its base. */
export function TierSwatch({ tier, className }: { tier: TierBaseProps["tier"]; className?: string }) {
  return <span aria-hidden className={cn(tierBaseVariants({ tier }), "inline-block size-3 shrink-0 rounded-[2px] p-0", className)} />;
}
