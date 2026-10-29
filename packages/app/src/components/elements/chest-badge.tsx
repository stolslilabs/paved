import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";

/** A chest's rank (issue 732): basic one tile with no choice, rare one of 2, epic one of 3. */
export type ChestRank = "basic" | "rare" | "epic";

/** The tiles a chest of each rank shows: the player keeps one. */
export const CHEST_CHOICES: Readonly<Record<ChestRank, number>> = { basic: 1, rare: 2, epic: 3 };
export const CHEST_NAME: Readonly<Record<ChestRank, string>> = { basic: "Basic chest", rare: "Rare chest", epic: "Epic chest" };

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

/** A chest of its rank (issue 739): the chest in the rank's medal colour, its name as its accessible name (the colour is never alone). */
const ICON_SIZE = { sm: "md", md: "lg", lg: "xl", xl: "2xl" } as const;

export function ChestBadge({ rank, size = "md", glow = false, open = false, className }: ChestBadgeProps) {
  return (
    <span role="img" aria-label={CHEST_NAME[rank]} data-rank={rank} className={cn(chestVariants({ rank, size, glow }), className)}>
      <Icon name="treasure-chest" variant="solid" size={ICON_SIZE[size ?? "md"]} className={open ? "opacity-60" : undefined} />
    </span>
  );
}
