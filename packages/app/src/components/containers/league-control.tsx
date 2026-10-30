import { formatInteger } from "@paved/game-core";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { useEffect, useRef, useState } from "react";
import { leagueOf, type League, type LeagueId } from "../../lib/pvp-rules";
import { cn } from "../../lib/utils";
import { GameIcon } from "../elements/game-icon";
import { LeagueCrestIcon } from "../elements/league-crest-art";
import { pipsOf, tierOf } from "../elements/league-standards";
import { Plate, PLATE_FIGURE, PlateDisc, plateIconClass, type PlateSize } from "../elements/plate";
import { Icon } from "../ui/icon";

/** The promotion's ring in its league's colour (#787's, on the crest since #829); Wood a neutral grey. */
const RING: Record<LeagueId, string> = {
  iron: "border-league-iron",
  bronze: "border-league-bronze",
  silver: "border-league-silver",
  gold: "border-league-gold",
  emerald: "border-league-emerald",
  diamond: "border-league-diamond",
  master: "border-league-master",
  grandmaster: "border-league-grandmaster",
  wood: "border-league-wood",
};

export interface LeagueControlProps {
  /** The player's crowns (`Matchmaker.league`); 0 before PvP (Wood). */
  crowns: number;
  /** The league on chain, when it is not that of `crowns` (the League page's, #859); left out, the league of `crowns`. */
  league?: League;
  /** The player has not entered the leagues (no crowns, no attack): Unranked's crest (issue 917), its name in the label. */
  unranked?: boolean;
  /** Opens the League page: a tap anywhere on the control. */
  onLeague?: () => void;
  /** The balances' sizes (issue 828); `auto` (the home's), `sm` on a phone and `md` from `desktop`. */
  size?: PlateSize;
  /**
   * `home` (the default): the round League button (`trophy`) over the plate's left end, a tap opening the League page. `page`: the
   * League page's header (#859), the crowns and the crest alone (the page needs no way to itself), so it fits a 320 px header.
   */
  variant?: "home" | "page";
  /** The button's accessible name, where its tap does something else (the League page's "Show it", #859); the league and the crowns by default. */
  label?: string;
  className?: string;
}

/**
 * The home's League control (#829, the owner's decisions of 2026-10-27), under the profile at the top left: a round League button
 * (`trophy`) over the left end of the balances' plate (#828), the crowns at the plate's centre and the league's crest closing its
 * right end. No league name: the crest is enough, and the League page says more. One button, its name the league and the crowns
 * ("League: Gold II, 1,240 crowns"). A promotion pulses a ring round the crest in its new colour; nothing moves under reduced
 * motion.
 */
export function LeagueControl({ crowns, league: shownLeague, unranked, onLeague, size = "auto", variant = "home", label, className }: LeagueControlProps) {
  const league = shownLeague ?? leagueOf(crowns);
  const tier = unranked ? "unranked" : tierOf(league);
  const reduced = useReducedMotionConfig();
  const [promoted, setPromoted] = useState<number | null>(null);
  const shown = useRef(league.index);
  useEffect(() => {
    const from = shown.current;
    shown.current = league.index;
    if (league.index > from && !reduced) setPromoted(league.index);
  }, [league.index, reduced]);

  return (
    <m.button
      type="button"
      data-slot="league-control"
      data-league={league.id}
      data-tier={tier}
      onClick={onLeague}
      whileTap={{ scale: 0.95 }}
      aria-label={label ?? `League: ${unranked ? "Unranked" : league.name}, ${formatInteger(crowns)} ${crowns === 1 ? "crown" : "crowns"}`}
      className={cn("group flex min-h-11 items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      <Plate
        size={size}
        lead={variant === "home" ? "disc" : undefined}
        leadContent={
          variant === "home" && (
            <PlateDisc size={size} face="button" className="state-layer rounded-full">
              <GameIcon name="trophy" size="inherit" className={cn("relative", plateIconClass(size))} />
            </PlateDisc>
          )
        }
        end={
          <PlateDisc size={size}>
            {/* The tier's crest in its icon form (issue 917), a size up from the plate's icons so its pips read: 28 px, 34 px from `desktop`. */}
            <span className={cn("relative leading-none", plateIconClass(size))}>
              <LeagueCrestIcon tier={tier} pips={unranked ? 0 : pipsOf(league)} size="inherit" style={{ fontSize: "1.4em" }} />
            </span>
            {promoted !== null && (
              <m.span
                key={promoted}
                aria-hidden
                data-slot="league-promotion"
                className={cn("pointer-events-none absolute inset-0 rounded-full border-4", RING[league.id])}
                initial={{ scale: 1, opacity: 0.9 }}
                animate={{ scale: 1.45, opacity: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                onAnimationComplete={() => setPromoted((p) => (p === promoted ? null : p))}
              />
            )}
          </PlateDisc>
        }
      >
        <span aria-hidden className="flex items-center gap-1">
          <Icon name="crown" size="xs" className="text-crown" />
          <span className={PLATE_FIGURE}>{formatInteger(crowns)}</span>
        </span>
      </Plate>
    </m.button>
  );
}
