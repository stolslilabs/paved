import type { CSSProperties } from "react";
import { cn } from "../../lib/utils";
import { LeagueBanner } from "./league-banner";
import { LeagueCrestArt } from "./league-crest-art";
import { LeaguePlate } from "./league-plate";
import type { LeagueTier } from "./league-standards";

/** The standard's sizes, as its plate's font size (12 to 20 px; at 20 its crest is 240 px wide, within a 320 px phone): the crest, the plate and the banner scale with it. */
const STANDARD_REM = { sm: 0.75, md: 0.875, lg: 1.125, xl: 1.25 } as const;
export type LeagueStandardSize = keyof typeof STANDARD_REM;

/**
 * The parts' heights and overlaps, in em of the plate's name: the crest's square (its shield about as wide as the plate, 10), the
 * plate's tuck over the shield's point, the square banner, as wide as the plate's face, and its tuck under the plate.
 */
const CREST_EM = 12;
const PLATE_TUCK = 1.2;
const BANNER_EM = 8;
const BANNER_TUCK = 1;

export interface LeagueStandardProps {
  tier: LeagueTier;
  /** The name on the plate, with its division ("Iron II"). */
  name: string;
  /** 14 px names (`md`) by default. */
  size?: LeagueStandardSize;
  /** The plate as a heading of this level, named by the plate (the League page's card); none, a plain figure. */
  heading?: "h2" | "h3";
  className?: string;
  style?: CSSProperties;
}

/**
 * A league's standard (issue 917, as the owner's design stacks them): the crest over the plate over the banner, for the League page's
 * card and a later promotion overlay. In em of the plate's name: the crest 12 high (its shield about as wide as the plate, 10), the
 * plate over the shield's point, the square banner 8 high hanging behind the plate. The plate names it; the crest and the banner are
 * decorative.
 */
export function LeagueStandard({ tier, name, size = "md", heading, className, style }: LeagueStandardProps) {
  const Plate = heading ?? "span";
  // Inline sizes and offsets, in the plate's em: the stylesheet's budget has no room for classes of their own.
  return (
    <figure
      data-slot="league-standard"
      data-tier={tier}
      className={cn("m-0 inline-flex flex-col items-center", className)}
      style={{ fontSize: `${STANDARD_REM[size]}rem`, lineHeight: 0, ...style }}
    >
      <span style={{ fontSize: `${CREST_EM}em` }}>
        <LeagueCrestArt tier={tier} size="inherit" />
      </span>
      <Plate className="relative z-10 m-0" style={{ marginTop: `-${PLATE_TUCK}em` }}>
        <LeaguePlate tier={tier} name={name} size="inherit" />
      </Plate>
      <span style={{ fontSize: `${BANNER_EM}em`, marginTop: `-${BANNER_TUCK / BANNER_EM}em` }}>
        <LeagueBanner tier={tier} size="inherit" />
      </span>
    </figure>
  );
}
