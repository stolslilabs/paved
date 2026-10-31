import type { CSSProperties } from "react";
import { cn } from "../../lib/utils";
import { artSources, type Division, type LeagueTier } from "./league-standards";

/** The full crest's heights (its em), from 64 px (issue 917: the League page); `inherit` takes the parent's font size. */
const CREST_REM = { sm: 4, md: 6, lg: 8, xl: 10, inherit: null } as const;
export type LeagueCrestArtSize = keyof typeof CREST_REM;
/** The icon form's sizes, 16 to 40 px (the League control's plate, the battle logs, the attack's end, the profile). */
const ICON_REM = { xs: 1, sm: 1.25, md: 1.5, lg: 2, xl: 2.5, inherit: null } as const;
export type LeagueCrestIconSize = keyof typeof ICON_REM;

const fontSize = (rem: number | null) => (rem === null ? undefined : { fontSize: `${rem}rem` });
/** The CSS pixels a size shows at (`inherit`: unknown, so the largest copy). */
const px = (rem: number | null) => (rem === null ? undefined : rem * 16);

export interface LeagueCrestArtProps {
  tier: LeagueTier;
  /** The division (`divisionOf`): the crest's version with its numeral on a ribbon; none, the plain crest. */
  division?: Division | null;
  /** 96 px (`md`) high by default. */
  size?: LeagueCrestArtSize;
  /** The accessible name ("Gold league"). Without it the crest is decorative. */
  label?: string;
  className?: string;
}

/**
 * A tier's crest (issue 917, after the owner's design): a broad shield in the tier's material, its motif (a sword, crossed swords,
 * a helmet growing horns and spikes up the ladder) and its ornaments (laurels, stones, crystals, wings, a crown); a division's
 * version carries its numeral on a ribbon under the motif. An image on a 1em square.
 */
export function LeagueCrestArt({ tier, division = null, size = "md", label, className }: LeagueCrestArtProps) {
  const rem = CREST_REM[size];
  return (
    <img
      {...artSources("crest", tier, px(rem), division)}
      alt={label ?? ""}
      draggable={false}
      decoding="async"
      data-slot="league-crest-art"
      data-tier={tier}
      data-division={division ?? undefined}
      className={cn("inline-block shrink-0", className)}
      style={{ ...fontSize(rem), width: "1em", height: "1em" }}
    />
  );
}

export interface LeagueCrestIconProps {
  tier: LeagueTier;
  /** The division (`divisionOf`): the icon's version with its numeral on a ribbon; none, the plain icon. */
  division?: Division | null;
  /** 24 px (`md`) by default. */
  size?: LeagueCrestIconSize;
  label?: string;
  className?: string;
  /** Inline styles over the size's (a font size of the caller's own, where a class would be new). */
  style?: CSSProperties;
}

/**
 * A crest's icon form (issue 917), for 16 to 40 px: the same shield, colours and motif simplified (no small parts, a thick
 * outline), on a 1em square; a division's version carries its numeral, drawn into the art.
 */
export function LeagueCrestIcon({ tier, division = null, size = "md", label, className, style }: LeagueCrestIconProps) {
  const rem = ICON_REM[size];
  // `scripts/fa-subset.ts` reads this function's one-word string literals as Font Awesome names: the image's classes stay two words.
  const sources = artSources("icon", tier, px(rem), division);
  return (
    <span
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      data-slot="league-crest-icon"
      data-tier={tier}
      data-division={division ?? undefined}
      className={cn("relative inline-block shrink-0", className)}
      style={{ ...fontSize(rem), width: "1em", height: "1em", ...style }}
    >
      <img {...sources} alt="" draggable={false} decoding="async" className="block size-full" />
    </span>
  );
}
