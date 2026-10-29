import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { CHEST_NAME, type ChestRank } from "./chest-designs";
import { ChestIcon } from "./chest-icon";

/** A chest's rank (issue 732), its tiles and its name: in `chest-designs.ts`, beside its drawings. */
export { CHEST_CHOICES, CHEST_NAME, type ChestRank } from "./chest-designs";

export const chestVariants = cva("inline-grid shrink-0 place-items-center rounded-xl border-2 bg-secondary", {
  variants: {
    /** The podium's medals carry the ranks: epic gold, rare silver, basic bronze. */
    rank: { epic: "border-medal-1 text-medal-1", rare: "border-medal-2 text-medal-2", basic: "border-medal-3 text-medal-3" },
    size: { sm: "size-10", md: "size-14", lg: "size-24 rounded-2xl", xl: "size-28 rounded-2xl" },
    /** A halo of the rank's colour (issue 759): the chest is there to be opened. */
    glow: { true: "", false: "" },
  },
  compoundVariants: [
    { glow: true, rank: "epic", className: "bg-medal-1/10 shadow-[0_0_2rem_-0.25rem_var(--medal-1)]" },
    { glow: true, rank: "rare", className: "bg-medal-2/10 shadow-[0_0_2rem_-0.25rem_var(--medal-2)]" },
    { glow: true, rank: "basic", className: "bg-medal-3/10 shadow-[0_0_2rem_-0.25rem_var(--medal-3)]" },
  ],
  defaultVariants: { rank: "basic", size: "md", glow: false },
});

export interface ChestBadgeProps extends VariantProps<typeof chestVariants> {
  rank: ChestRank;
  /** Opened: dimmed. */
  open?: boolean;
  className?: string;
}

/** The simple chest's height in each badge (rem): 24 to 48 px, inside the frame's 40 to 112. */
const ICON_REM = { sm: 1.5, md: 2, lg: 3, xl: 3.75 } as const;

/**
 * A chest of its rank (issue 739) in its frame: the simple chest of issue 874 (`ChestIcon`, wood and metal bands, its ornaments growing with
 * the rank) on the rank's medal border, its name as its accessible name (neither the colour nor the ornaments are alone). Dimmed once
 * opened.
 */
export function ChestBadge({ rank, size = "md", glow = false, open = false, className }: ChestBadgeProps) {
  return (
    <span role="img" aria-label={CHEST_NAME[rank]} data-rank={rank} className={cn(chestVariants({ rank, size, glow }), className)}>
      <span className={open ? "opacity-60" : undefined} style={{ fontSize: `${ICON_REM[size ?? "md"]}rem`, lineHeight: 1 }}>
        <ChestIcon rank={rank} size="inherit" label={null} />
      </span>
    </span>
  );
}
