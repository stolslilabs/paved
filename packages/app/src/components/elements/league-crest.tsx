import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { Icon, type IconSize } from "../ui/icon";
import type { LeagueId } from "../../lib/pvp-rules";

const CREST: Record<LeagueId, string> = {
  iron: "text-league-iron",
  bronze: "text-league-bronze",
  silver: "text-league-silver",
  gold: "text-league-gold",
  platinum: "text-league-platinum",
  diamond: "text-league-diamond",
  master: "text-league-master",
  grandmaster: "text-league-grandmaster",
  wood: "text-league-wood",
};

/** A league group's crest colour, for a crest drawn larger than `LeagueCrest`'s sizes (the league carousel's). */
export function crestClass(id: LeagueId): string {
  return CREST[id];
}

const crestVariants = cva("inline-flex items-center gap-1.5 font-semibold whitespace-nowrap", {
  variants: { size: { sm: "text-xs", md: "text-sm", lg: "text-xl" } },
  defaultVariants: { size: "md" },
});

const ICON_SIZE: Record<NonNullable<VariantProps<typeof crestVariants>["size"]>, IconSize> = { sm: "sm", md: "md", lg: "xl" };

export interface LeagueCrestProps extends VariantProps<typeof crestVariants> {
  league: { id: LeagueId; name: string };
  /** The crest alone (the name is then its accessible name). */
  iconOnly?: boolean;
  className?: string;
}

/** A league (issue 644's, `pvp-rules.ts`): its crest, a shield in its group's colour, and its name beside it ("Silver II"). */
export function LeagueCrest({ league, size, iconOnly, className }: LeagueCrestProps) {
  return (
    <span data-league={league.id} className={cn(crestVariants({ size }), className)}>
      <Icon name="shield-halved" size={ICON_SIZE[size ?? "md"]} className={CREST[league.id]} label={iconOnly ? `${league.name} league` : undefined} />
      {!iconOnly && <span>{league.name}</span>}
    </span>
  );
}
