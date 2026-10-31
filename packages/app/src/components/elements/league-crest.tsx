import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import type { League } from "../../lib/pvp-rules";
import { LeagueCrestIcon, type LeagueCrestIconSize } from "./league-crest-art";
import { divisionOf, tierOf } from "./league-standards";

const crestVariants = cva("inline-flex items-center gap-1.5 font-semibold whitespace-nowrap", {
  variants: { size: { sm: "text-xs", md: "text-sm", lg: "text-xl" } },
  defaultVariants: { size: "md" },
});

/** The icon form's size beside the name: 20, 24 and 40 px. */
const ICON_SIZE: Record<NonNullable<VariantProps<typeof crestVariants>["size"]>, LeagueCrestIconSize> = { sm: "sm", md: "md", lg: "xl" };

export interface LeagueCrestProps extends VariantProps<typeof crestVariants> {
  league: Pick<League, "id" | "name" | "index">;
  /** The player has not entered the leagues (the League page's `unranked`): Unranked's crest and name, whatever `league`. */
  unranked?: boolean;
  /** The crest alone (the name is then its accessible name). */
  iconOnly?: boolean;
  className?: string;
}

/**
 * A league (issue 644's, `pvp-rules.ts`): its tier's crest in its icon form (issue 917, the division's numeral at its foot) and its name beside it
 * ("Silver II"). Unranked when the player has not entered the leagues.
 */
export function LeagueCrest({ league, unranked, size, iconOnly, className }: LeagueCrestProps) {
  const tier = unranked ? "unranked" : tierOf(league);
  const name = unranked ? "Unranked" : league.name;
  return (
    <span data-league={league.id} data-tier={tier} className={cn(crestVariants({ size }), className)}>
      <LeagueCrestIcon tier={tier} division={unranked ? null : divisionOf(league)} size={ICON_SIZE[size ?? "md"]} label={iconOnly ? (unranked ? name : `${name} league`) : undefined} />
      {!iconOnly && <span>{name}</span>}
    </span>
  );
}
