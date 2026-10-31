import { GUILD_EMBLEM_COLOURS, GUILD_EMBLEM_ICONS, type GuildEmblem as Emblem } from "@paved/game-core";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { Icon, type IconSize } from "../ui/icon";

/**
 * The emblems' icons (issue 953, open point 7's default), by index (game-core's `GUILD_EMBLEM_ICONS`): Font Awesome icons the
 * subset already carries, so no new art and no growth of its files.
 */
export const GUILD_EMBLEM_ICON_NAMES = ["hammer", "swords", "crown", "tree", "star", "castle", "chess-rook", "gear", "trophy", "eye", "flag", "fire"] as const;

/** The emblems' colours' names, by index (the `--emblem-<n>` tokens of `theme.css`, game-core's `GUILD_EMBLEM_COLOURS`). */
export const GUILD_EMBLEM_COLOUR_NAMES = ["Gold", "Ember", "Meadow", "River", "Stone", "Night", "Amber", "Bronze"] as const;

if (GUILD_EMBLEM_ICON_NAMES.length !== GUILD_EMBLEM_ICONS || GUILD_EMBLEM_COLOUR_NAMES.length !== GUILD_EMBLEM_COLOURS) throw new Error("guild emblem sets out of step with game-core");

const emblemVariants = cva("relative inline-grid shrink-0 place-items-center", {
  variants: { size: { sm: "h-8 w-7", md: "h-12 w-10", lg: "h-20 w-16" } },
  defaultVariants: { size: "md" },
});
const ICON: Record<NonNullable<VariantProps<typeof emblemVariants>["size"]>, IconSize> = { sm: "xs", md: "sm", lg: "lg" };

/** An index's colour token (out of range: the first). */
const colour = (i: number) => `var(--emblem-${Number.isInteger(i) && i >= 0 && i < GUILD_EMBLEM_COLOURS ? i : 0})`;

export interface GuildEmblemProps extends VariantProps<typeof emblemVariants> {
  emblem: Emblem;
  /** The accessible name; left out, the emblem is decorative (the guild's name beside it says it). */
  label?: string;
  className?: string;
}

/**
 * A guild's emblem (issue 953): a shield in its first colour, banded in its second, bearing its icon, with a dark rim so any pair
 * reads on the cards.
 */
export function GuildEmblem({ emblem, size, label, className }: GuildEmblemProps) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  return (
    <span data-slot="guild-emblem" {...a11y} className={cn(emblemVariants({ size }), className)}>
      <svg viewBox="0 0 40 48" className="absolute inset-0 size-full" aria-hidden>
        <path d="M20 2 37 8v14c0 11-7 19-17 24C10 41 3 33 3 22V8Z" fill={colour(emblem.primary)} stroke="var(--emblem-rim)" strokeWidth="3" strokeLinejoin="round" />
        <path d="M8 11 20 7l12 4" fill="none" stroke={colour(emblem.secondary)} strokeWidth="4" strokeLinecap="round" />
        <path d="M8 26c1 7 5 12 12 15 7-3 11-8 12-15" fill="none" stroke={colour(emblem.secondary)} strokeWidth="4" strokeLinecap="round" />
      </svg>
      <Icon name={GUILD_EMBLEM_ICON_NAMES[emblem.icon] ?? GUILD_EMBLEM_ICON_NAMES[0]} size={ICON[size ?? "md"]} className="relative -mt-0.5 text-(--emblem-charge)" />
    </span>
  );
}
