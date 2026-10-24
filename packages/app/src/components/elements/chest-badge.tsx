import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";

/** A chest's rank (issue 732): bronze one tile with no choice, silver one of 2, gold one of 3. */
export type ChestRank = "bronze" | "silver" | "gold";

/** The tiles a chest of each rank shows: the player keeps one. */
export const CHEST_CHOICES: Readonly<Record<ChestRank, number>> = { bronze: 1, silver: 2, gold: 3 };
export const CHEST_NAME: Readonly<Record<ChestRank, string>> = { bronze: "Bronze chest", silver: "Silver chest", gold: "Gold chest" };

export const chestVariants = cva("inline-grid shrink-0 place-items-center rounded-xl border-2 bg-secondary", {
  variants: {
    /** The podium's medals carry the ranks: gold, silver, bronze. */
    rank: { gold: "border-medal-1 text-medal-1", silver: "border-medal-2 text-medal-2", bronze: "border-medal-3 text-medal-3" },
    size: { sm: "size-10", md: "size-14", lg: "size-24" },
  },
  defaultVariants: { rank: "bronze", size: "md" },
});

export interface ChestBadgeProps extends VariantProps<typeof chestVariants> {
  rank: ChestRank;
  /** Opened: dimmed. */
  open?: boolean;
  className?: string;
}

/** A chest of its rank (issue 739): the chest in the rank's medal colour, its name as its accessible name (the colour is never alone). */
const ICON_SIZE = { sm: "md", md: "lg", lg: "xl" } as const;

export function ChestBadge({ rank, size = "md", open = false, className }: ChestBadgeProps) {
  return (
    <span role="img" aria-label={CHEST_NAME[rank]} data-rank={rank} className={cn(chestVariants({ rank, size }), className)}>
      <Icon name="gift" variant="solid" size={ICON_SIZE[size ?? "md"]} className={open ? "opacity-60" : undefined} />
    </span>
  );
}
