import { cn } from "../../lib/utils";
import { artSources, LEAGUE_ART, type Division, type LeagueTier } from "./league-standards";

/** The banner's heights (its em): 96 to 208 px; `inherit` takes the parent's font size. */
const BANNER_REM = { sm: 6, md: 8, lg: 10, xl: 13, inherit: null } as const;
export type LeagueBannerSize = keyof typeof BANNER_REM;

/** The banner's width in its height's em. */
const WIDTH_EM = LEAGUE_ART.banner.width / LEAGUE_ART.banner.height;

export interface LeagueBannerProps {
  tier: LeagueTier;
  /** The division's numeral on the cloth; none, the plain cloth (Unranked, Wood and Grand Master have no division). */
  division?: Division | null;
  /** 128 px (`md`) high by default. */
  size?: LeagueBannerSize;
  label?: string;
  className?: string;
}

/**
 * A tier's banner (issue 917, redrawn 2026-11-01): the pennant hanging from its rod, cloth, rod and trim in the tier's material, the
 * division's numeral on the cloth (Grand Master's helmet; nothing on Wood's; Unranked's a torn, blank cloth). An image 1em high, as
 * wide as its frame. Reusable alone (a later promotion overlay).
 */
export function LeagueBanner({ tier, division = null, size = "md", label, className }: LeagueBannerProps) {
  const rem = BANNER_REM[size];
  return (
    <img
      {...artSources("banner", tier, rem === null ? undefined : rem * 16 * WIDTH_EM, division)}
      alt={label ?? ""}
      draggable={false}
      decoding="async"
      data-slot="league-banner"
      data-tier={tier}
      className={cn("inline-block shrink-0", className)}
      style={{ ...(rem === null ? undefined : { fontSize: `${rem}rem` }), width: `${WIDTH_EM}em`, height: "1em" }}
    />
  );
}
