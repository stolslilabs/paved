import { cn } from "../../lib/utils";
import { artSources, LEAGUE_ART, type LeagueTier } from "./league-standards";

/** The banner's heights (its em): 96 to 208 px; `inherit` takes the parent's font size. */
const BANNER_REM = { sm: 6, md: 8, lg: 10, xl: 13, inherit: null } as const;
export type LeagueBannerSize = keyof typeof BANNER_REM;

/** The banner's width in its height's em. */
const WIDTH_EM = LEAGUE_ART.banner.width / LEAGUE_ART.banner.height;

export interface LeagueBannerProps {
  tier: LeagueTier;
  /** 128 px (`md`) high by default. */
  size?: LeagueBannerSize;
  label?: string;
  className?: string;
}

/**
 * A tier's banner (issue 917): the pennant hanging from its bar, its cloth in the tier's colour within a border of its metal, its
 * emblem the crest's motif; Unranked's a torn, blank cloth. An image 1em high. Reusable alone (a later promotion overlay).
 */
export function LeagueBanner({ tier, size = "md", label, className }: LeagueBannerProps) {
  const rem = BANNER_REM[size];
  return (
    <img
      {...artSources("banner", tier, rem === null ? undefined : rem * 16 * WIDTH_EM)}
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
