import type { CSSProperties } from "react";
import { cn } from "../../lib/utils";
import { LeagueBanner } from "./league-banner";
import { LeagueCrestArt } from "./league-crest-art";
import { LeaguePlate } from "./league-plate";
import type { LeagueTier } from "./league-standards";

/** The standard's sizes, as its plate's font size (12 to 20 px; at 20 its crest is 272 px wide, within a 320 px phone): the crest, the plate and the banner scale with it. */
const STANDARD_REM = { sm: 0.75, md: 0.875, lg: 1.125, xl: 1.25 } as const;
export type LeagueStandardSize = keyof typeof STANDARD_REM;

export interface LeagueStandardProps {
  tier: LeagueTier;
  /** The name on the plate, with its division ("Iron II"). */
  name: string;
  /** 14 px names (`md`) by default. */
  size?: LeagueStandardSize;
  className?: string;
  style?: CSSProperties;
}

/**
 * A league's standard (issue 917, as the owner's design stacks them): the crest over the plate over the banner, for the League page's
 * card and a later promotion overlay. In em of the plate's name: the crest 15.7 high (its frame as wide as the plate), the plate 2.15,
 * the banner 11.7, each tucked under the one above. The plate names it; the crest and the banner are decorative.
 */
export function LeagueStandard({ tier, name, size = "md", className, style }: LeagueStandardProps) {
  // Inline sizes and offsets, in the plate's em: the stylesheet's budget has no room for classes of their own.
  return (
    <figure
      data-slot="league-standard"
      data-tier={tier}
      className={cn("m-0 inline-flex flex-col items-center", className)}
      style={{ fontSize: `${STANDARD_REM[size]}rem`, lineHeight: 0, ...style }}
    >
      <span style={{ fontSize: "15.7em" }}>
        <LeagueCrestArt tier={tier} size="inherit" />
      </span>
      <span className="relative z-10" style={{ marginTop: "-2em" }}>
        <LeaguePlate tier={tier} name={name} size="inherit" />
      </span>
      <span style={{ fontSize: "11.7em", marginTop: "-0.034em" }}>
        <LeagueBanner tier={tier} size="inherit" />
      </span>
    </figure>
  );
}
