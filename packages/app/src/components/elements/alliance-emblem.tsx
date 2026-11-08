import type { CSSProperties } from "react";
import { ALLIANCE_MAX_GUILDS, formatInteger, type AllianceEmblem as Emblem } from "@paved/game-core";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { allianceArtSources } from "./emblem-art";
import { rankingArtSources } from "./ranking-art";
import { EmblemShield } from "./guild-emblem";

const allianceEmblemVariants = cva("relative inline-block shrink-0", {
  variants: { size: { xs: "size-8", sm: "size-13", md: "size-18", lg: "size-26" } },
  defaultVariants: { size: "sm" },
});
type Size = NonNullable<VariantProps<typeof allianceEmblemVariants>["size"]>;

/** Each size's box in CSS px (the laurel's copy picked for it). */
const PX: Record<Size, number> = { xs: 32, sm: 52, md: 72, lg: 104 };
/** The charge's size on each shield: about 57 % of the shield's width, as on a guild's (sm 28 px, md 39, lg 56). */
const CHARGE: Record<Size, string> = { xs: "size-2.5", sm: "size-4", md: "size-5.5", lg: "size-8" };
/**
 * The shield on the laurel: 54 % of the box's width, its top 7 % down, so the branches rise along its sides and the bow shows under
 * its point (checked at 200, 96, 64 and 52 px against 47, 60 and 64 %); its height a guild shield's (40 by 48).
 */
const SHIELD: CSSProperties = { left: "23%", top: "7%", width: "54%", height: "64.8%" };

export interface AllianceEmblemProps extends VariantProps<typeof allianceEmblemVariants> {
  emblem: Emblem;
  /** The accessible name; left out, the emblem is decorative (the alliance's name beside it says it). */
  label?: string;
  className?: string;
}

/**
 * An alliance's emblem (ALLIANCES): a guild emblem's shield (its charge and three colours, the leader's picks from the guilds' sets,
 * `EmblemShield`) standing on the gold laurel of the Leaderboard's Alliances icon (`emblem-art.ts`, painted by Codex). The laurel is
 * what tells an alliance from a guild at a glance; it is never tinted.
 */
export function AllianceEmblem({ emblem, size, label, className }: AllianceEmblemProps) {
  const s = size ?? "sm";
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  return (
    <span data-slot="alliance-emblem" data-size={s} {...a11y} className={cn(allianceEmblemVariants({ size: s }), className)}>
      <img {...allianceArtSources("alliance-laurel", PX[s])} alt="" draggable={false} decoding="async" className="absolute inset-0 size-full" />
      <span className="absolute grid place-items-center" style={SHIELD}>
        <EmblemShield emblem={emblem} charge={CHARGE[s]} lift="-mt-[5%]" />
      </span>
    </span>
  );
}

/** An alliance's guild count against the cap, the guilds' painted shield before it (the members' count's look). */
export function GuildCount({ guilds, className }: { guilds: number; className?: string }) {
  return (
    <span role="img" aria-label={`${formatInteger(guilds)} of ${ALLIANCE_MAX_GUILDS} guilds`} className={cn("flex items-center gap-1 whitespace-nowrap", className)}>
      <img {...rankingArtSources("guilds", 16)} alt="" draggable={false} decoding="async" className="size-4" />
      <span aria-hidden className="tabular-nums">
        {formatInteger(guilds)}/{ALLIANCE_MAX_GUILDS}
      </span>
    </span>
  );
}
