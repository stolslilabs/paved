import type { CSSProperties } from "react";
import { GUILD_EMBLEM_COLOURS, GUILD_EMBLEM_ICONS, GUILD_EMBLEM_SILVER, type GuildEmblem as Emblem } from "@paved/game-core";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { GUILD_EMBLEM_CHARGES, emblemChargeMask, type GuildEmblemCharge } from "./emblem-art";

export { GUILD_EMBLEM_CHARGES };

/**
 * The emblems' colours' names, by index (the `--emblem-<n>` tokens of `theme.css`, game-core's `GUILD_EMBLEM_COLOURS`); Silver, the
 * ninth, is the charge's by default (GUILD-PAGE).
 */
export const GUILD_EMBLEM_COLOUR_NAMES = ["Gold", "Ember", "Meadow", "River", "Stone", "Night", "Amber", "Bronze", "Silver", "Coal", "Crimson", "Coral", "Rose", "Plum", "Violet", "Lime", "Forest", "Teal"] as const;

/**
 * The colours as the settings lay them out, three rows of six (GUILD-PAGE): the metals and greys, the reds and purples, the greens and
 * blues. By index: an emblem keeps its numbers, the picker its order.
 */
export const GUILD_EMBLEM_PALETTE: readonly number[] = [0, 6, 7, 8, 4, 9, 1, 10, 11, 12, 13, 14, 15, 2, 16, 17, 3, 5];

if (GUILD_EMBLEM_CHARGES.length !== GUILD_EMBLEM_ICONS || GUILD_EMBLEM_COLOUR_NAMES.length !== GUILD_EMBLEM_COLOURS || new Set(GUILD_EMBLEM_PALETTE).size !== GUILD_EMBLEM_COLOURS)
  throw new Error("guild emblem sets out of step with game-core");

const emblemVariants = cva("relative inline-grid shrink-0 place-items-center", {
  variants: { size: { sm: "h-8 w-7", md: "h-12 w-10", lg: "h-20 w-16" } },
  defaultVariants: { size: "md" },
});
/** The charge's size on each shield: about half the shield's width, between its two bands. */
const CHARGE: Record<NonNullable<VariantProps<typeof emblemVariants>["size"]>, string> = { sm: "size-4", md: "size-6", lg: "size-9" };

/** An index's colour token (out of range: the first). */
const colour = (i: number) => `var(--emblem-${Number.isInteger(i) && i >= 0 && i < GUILD_EMBLEM_COLOURS ? i : 0})`;

/** The charge's edge on the shield, in the rim's colour: a one-pixel line all round, so a charge reads on a field of its own colour. */
const EDGED: CSSProperties = {
  filter: ["1px 0", "-1px 0", "0 1px", "0 -1px"].map((at) => `drop-shadow(${at} 0 var(--emblem-rim))`).join(" "),
};

/**
 * A charge alone (GUILD-PAGE: Codex's silhouettes, `emblem-art.ts`): its mask filled with `tint` (a CSS colour; left out, the text's),
 * on the shield and in the settings' picker. Decorative: what holds it names it.
 */
export function EmblemCharge({ name, tint, className }: { name: GuildEmblemCharge; tint?: string; className?: string }) {
  const mask = emblemChargeMask(name);
  const style: CSSProperties = {
    backgroundColor: tint ?? "currentColor",
    maskImage: mask,
    WebkitMaskImage: mask,
    maskSize: "contain",
    WebkitMaskSize: "contain",
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    WebkitMaskPosition: "center",
  };
  return <span aria-hidden data-charge={name} className={cn("inline-block shrink-0", className)} style={style} />;
}

export interface GuildEmblemProps extends VariantProps<typeof emblemVariants> {
  emblem: Emblem;
  /** The accessible name; left out, the emblem is decorative (the guild's name beside it says it). */
  label?: string;
  className?: string;
}

/**
 * A guild's emblem (issue 953): a shield in its first colour, banded in its second, bearing its charge in its third (GUILD-PAGE: a flat
 * silhouette, Silver when the emblem names no colour for it), with a dark rim round the shield and the charge so any three read.
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
      <span className="relative -mt-0.5 flex" style={EDGED}>
        <EmblemCharge name={GUILD_EMBLEM_CHARGES[emblem.icon] ?? GUILD_EMBLEM_CHARGES[0]} tint={colour(emblem.charge ?? GUILD_EMBLEM_SILVER)} className={CHARGE[size ?? "md"]} />
      </span>
    </span>
  );
}
