import { ArtSvg, type Relief } from "./league-art";
import { circle, crestParts, type LeagueTier, type Part } from "./league-standards";

/** The full crest's heights (its em), from 64 px (issue 917: the League page); `inherit` takes the parent's font size. */
const CREST_REM = { sm: 4, md: 6, lg: 8, xl: 10, inherit: null } as const;
export type LeagueCrestArtSize = keyof typeof CREST_REM;
/** The icon form's sizes, 16 to 40 px (the League control's plate, the battle logs, the attack's end, the profile). */
const ICON_REM = { xs: 1, sm: 1.25, md: 1.5, lg: 2, xl: 2.5, inherit: null } as const;
export type LeagueCrestIconSize = keyof typeof ICON_REM;

const fontSize = (rem: number | null) => (rem === null ? undefined : { fontSize: `${rem}rem` });

/** The full crest's relief on its 512 grid: a fine outline, for 64 px and up. */
const FULL: Relief = { outline: 14, drop: 10, rim: 8 };
/** The icon's: an outline that stays about a pixel at 16 px. */
const ICON: Relief = { outline: 40, drop: 20, rim: 18 };

export interface LeagueCrestArtProps {
  tier: LeagueTier;
  /** 96 px (`md`) high by default. */
  size?: LeagueCrestArtSize;
  /** The accessible name ("Gold league"). Without it the crest is decorative. */
  label?: string;
  className?: string;
}

/**
 * A tier's crest (issue 917, after the owner's design): its hexagon frame in the tier's material, its motif (a sword, crossed swords, a
 * helm), and its ornaments growing up the ladder (leaves, laurels, crystals, horns, wings, a crown). Pure SVG in the game icons'
 * relief; its box is 13 wide by 15 high, the ornaments of the highest tiers filling it.
 */
export function LeagueCrestArt({ tier, size = "md", label, className }: LeagueCrestArtProps) {
  return (
    <ArtSvg
      parts={crestParts(tier, "full")}
      relief={FULL}
      viewBox="48 16 416 480"
      width={416 / 480}
      height={1}
      label={label}
      slot="league-crest-art"
      data={{ "data-tier": tier }}
      className={className}
      style={fontSize(CREST_REM[size])}
    />
  );
}

/** The division's pips at the icon's foot (issue 917's open point 3): III one, II two, I three. */
export function pipParts(pips: number): Part[] {
  if (pips < 1) return [];
  const gap = 96;
  return [{ d: Array.from({ length: pips }, (_, i) => circle(256 + (i - (pips - 1) / 2) * gap, 466, 36)).join(""), tone: "light" }];
}

export interface LeagueCrestIconProps {
  tier: LeagueTier;
  /** The division as pips, 1 to 3 (`pipsOf`); none draws the crest alone. */
  pips?: number;
  /** 24 px (`md`) by default. */
  size?: LeagueCrestIconSize;
  label?: string;
  className?: string;
}

/**
 * A crest's icon form (issue 917), for 16 to 40 px: the same silhouette, colours and motif with fewer ornaments and a thicker outline,
 * fitted to a 1em square, and the division as pips at its foot.
 */
export function LeagueCrestIcon({ tier, pips = 0, size = "md", label, className }: LeagueCrestIconProps) {
  return (
    <ArtSvg
      parts={[...crestParts(tier, "icon"), ...pipParts(pips)]}
      relief={ICON}
      viewBox="0 0 512 512"
      frame="translate(256 232) scale(1.1) translate(-256 -262)"
      width={1}
      height={1}
      label={label}
      slot="league-crest-icon"
      data={{ "data-tier": tier, "data-pips": pips || undefined }}
      className={className}
      style={fontSize(ICON_REM[size])}
    />
  );
}
