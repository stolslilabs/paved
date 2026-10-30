import { ArtSvg, type Relief } from "./league-art";
import { BANNER, bannerParts, type LeagueTier } from "./league-standards";

/** The banner's heights (its em): 96 to 208 px; `inherit` takes the parent's font size. */
const BANNER_REM = { sm: 6, md: 8, lg: 10, xl: 13, inherit: null } as const;
export type LeagueBannerSize = keyof typeof BANNER_REM;

const RELIEF: Relief = { outline: 12, drop: 8, rim: 7 };

export interface LeagueBannerProps {
  tier: LeagueTier;
  /** 128 px (`md`) high by default. */
  size?: LeagueBannerSize;
  label?: string;
  className?: string;
}

/**
 * A tier's banner (issue 917): the pennant hanging from its metal bar, its cloth in the tier's colour within a border of its metal, its
 * emblem (the crest's motif) and its gem at the point; Unranked's a torn cloth. Reusable alone (a later promotion overlay).
 */
export function LeagueBanner({ tier, size = "md", label, className }: LeagueBannerProps) {
  const rem = BANNER_REM[size];
  return (
    <ArtSvg
      parts={bannerParts(tier)}
      relief={RELIEF}
      viewBox={`0 0 ${BANNER.width} ${BANNER.height}`}
      width={BANNER.width / BANNER.height}
      height={1}
      label={label}
      slot="league-banner"
      data={{ "data-tier": tier }}
      className={className}
      style={rem === null ? undefined : { fontSize: `${rem}rem` }}
    />
  );
}
