import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { artSources, RIM_PORTRAIT, type LeagueTier } from "./league-standards";

/** The rim's widths (its em): 40, 56 and 96 px; `inherit` takes the parent's font size. */
const RIM_REM = { sm: 2.5, md: 3.5, lg: 6, inherit: null } as const;
export type LeagueRimSize = keyof typeof RIM_REM;

/** The portrait's inset in the rim's square: a disc a little wider than the ring's hole, so its edge hides under the ring. */
const INSET = `${((1 - RIM_PORTRAIT) / 2) * 100}%`;

export interface LeagueRimProps {
  tier: LeagueTier;
  /** 56 px (`md`) wide by default. */
  size?: LeagueRimSize;
  /** The portrait, sized to fill the disc under the ring (`size-full`, an image `object-cover`). */
  children?: ReactNode;
  className?: string;
}

/**
 * The avatar's rim (the owner's design of 2026-11-01): a ring of the tier's material (cracked stone up to ruby set in gold) around the
 * player's portrait, so the league reads on the portrait itself. Every tier's ring has the same hole (`RIM_HOLE`), so a tier swaps for
 * another without a layout change. A 1em square; the ring is decorative, the portrait (or its caller) names the player.
 */
export function LeagueRim({ tier, size = "md", children, className }: LeagueRimProps) {
  const rem = RIM_REM[size];
  return (
    <span
      data-slot="league-rim"
      data-tier={tier}
      className={cn("relative inline-block shrink-0", className)}
      style={{ ...(rem === null ? undefined : { fontSize: `${rem}rem` }), width: "1em", height: "1em" }}
    >
      <span className="absolute overflow-hidden rounded-full" style={{ inset: INSET }}>
        {children}
      </span>
      <img
        {...artSources("rim", tier, rem === null ? undefined : rem * 16)}
        alt=""
        draggable={false}
        decoding="async"
        className="absolute inset-0 block size-full"
      />
    </span>
  );
}
