import { formatInteger } from "@paved/game-core";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { DataContext, type DataSources } from "../../data/sources";
import { isUnranked, usePvpLastAttack } from "../../data/pvp-standing";
import { leagueOf, type League, type LeagueId } from "../../lib/pvp-rules";
import { cn } from "../../lib/utils";
import { GameIcon } from "../elements/game-icon";
import { LeagueCrestIcon } from "../elements/league-crest-art";
import { LeagueRim } from "../elements/league-rim";
import { divisionOf, tierOf } from "../elements/league-standards";
import { Plate, plateBareIconClass, PLATE_FIGURE, PlateDisc, plateIconClass, type PlateSize } from "../elements/plate";
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
  /** The player's crowns (`Matchmaker.league`); 0 before PvP (Wood), and when left out (not read). */
  crowns?: number;
  /** The league on chain, when it is not that of `crowns` (the League page's, #859); left out, the league of `crowns`. */
  league?: League;
  /**
   * The player has not entered the leagues (`isUnranked`): Unranked's crest (issue 917), its name in the label. Left out, decided from
   * `attacks`: with no crowns and no attack settled, the control reads whether the player ever attacked (`Arena.attack`, where the
   * app's sources are; without them, as never).
   */
  unranked?: boolean;
  /** The attacks settled this season (`Matchmaker.league`, the home's read). */
  attacks?: number;
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
 * right end, alone (no disc). No league name: the crest is enough, and the League page says more. One button, its name the league
 * and the crowns ("League: Gold II, 1,240 crowns"). A promotion pulses a ring round the crest in its new colour; nothing moves under
 * reduced motion.
 */
export function LeagueControl(props: LeagueControlProps) {
  return (
    <Standing crowns={props.crowns} attacks={props.attacks} unranked={props.unranked}>
      {(unranked) => <ControlView {...props} unranked={unranked} />}
    </Standing>
  );
}

interface StandingProps {
  crowns?: number;
  attacks?: number;
  unranked?: boolean;
  /** What to draw once it is known whether the player is Unranked. */
  children: (unranked: boolean) => ReactNode;
}

/**
 * Whether the player is Unranked (issue 917): as given; else, with no crowns and no attack settled, unless the player ever attacked
 * (read where the app's sources are; without them, as never). The League control's and the player card's rim's.
 */
function Standing({ crowns = 0, attacks, unranked, children }: StandingProps) {
  const sources = useContext(DataContext);
  const maybe = unranked === undefined && crowns === 0 && attacks === 0;
  if (maybe && sources?.signer) return <ReadUnranked sources={sources} playerId={sources.signer.address}>{children}</ReadUnranked>;
  return children(unranked ?? maybe);
}

/** No crowns and no attack settled: Unranked unless the player ever attacked (an attack open, or one before the season). */
function ReadUnranked({ sources, playerId, children }: { sources: DataSources; playerId: string; children: StandingProps["children"] }) {
  const attack = usePvpLastAttack(sources, playerId);
  // While read, Unranked: a player with no crowns and no attack settled has most likely never attacked.
  return children(attack === undefined || (attack !== null && isUnranked({ crowns: 0, attacks: 0 }, attack)));
}

export interface PlayerRimProps {
  /** The player's crowns and attacks settled this season (`Matchmaker.league`, the home's read); left out: Wood, 0 crowns. */
  crowns?: number;
  attacks?: number;
  /** The portrait, sized to fill the disc under the ring. */
  children: ReactNode;
  className?: string;
}

/**
 * The player card's avatar (the owner's direction of 2026-11-01): the portrait in the rim of the player's league (`LeagueRim`), the
 * league's crest at its lower left, as the crowns' plate decides the league (Unranked included). A 1em square, the parent's font
 * size; decorative, the card names the player. In this chunk, with the League control, which the home loads at once: not the first
 * load's.
 */
export function PlayerRim({ crowns = 0, attacks, children, className }: PlayerRimProps) {
  return (
    <Standing crowns={crowns} attacks={attacks}>
      {(unranked) => {
        const league = leagueOf(crowns);
        const tier = unranked ? "unranked" : tierOf(league);
        return (
          <span data-slot="player-rim" data-tier={tier} className={cn("relative block size-[1em]", className)}>
            <LeagueRim tier={tier} size="inherit" className="block">
              {children}
            </LeagueRim>
            {/* The crest at 42 % of the rim, by its box (an image, not text). */}
            <LeagueCrestIcon tier={tier} division={unranked ? null : divisionOf(league)} size="inherit" className="absolute -bottom-[4%] -left-[10%]" style={{ width: "42%", height: "42%" }} />
          </span>
        );
      }}
    </Standing>
  );
}

function ControlView({ crowns = 0, league: shownLeague, unranked, onLeague, size = "auto", variant = "home", label, className }: LeagueControlProps) {
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
        endFit="bare"
        end={
          // The tier's crest in its icon form (issue 917) alone, no disc (the owner's decision of 2026-10-30): taller than the plate,
          // it closes its end as the balances' coins do.
          <span className={cn("relative leading-none", plateBareIconClass(size))}>
            <LeagueCrestIcon tier={tier} division={unranked ? null : divisionOf(league)} size="inherit" style={{ width: "100%", height: "100%" }} />
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
          </span>
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
