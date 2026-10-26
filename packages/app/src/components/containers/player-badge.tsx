import { formatInteger } from "@paved/game-core";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { leagueOf, type LeagueId } from "../../lib/pvp-rules";
import { cn } from "../../lib/utils";
import { Crowns } from "../elements/crowns";
import { LeagueCrest } from "../elements/league-crest";
import { PlayerAvatar } from "../elements/player-avatar";
import { levelLabel, XpBarStill } from "../elements/xp-level";
import { avatarPlayer, profileLabel, profileName, useProfileOpener } from "./profile-context";

/** The bar's motion in its own chunk, as the ring's was (#625): its still holds the same box meanwhile (FIRST-LOAD). */
const XpBar = lazy(() => import("../elements/xp-bar").then((m) => ({ default: m.XpBar })));

/** The avatar's border in its league's colour (#787): the crest's (`league-crest.tsx`); Unranked a neutral grey. */
const BORDER: Record<LeagueId, string> = {
  bronze: "border-league-bronze",
  silver: "border-league-silver",
  gold: "border-league-gold",
  crystal: "border-league-crystal",
  master: "border-league-master",
  champion: "border-league-champion",
  titan: "border-league-titan",
  legend: "border-league-legend",
  unranked: "border-league-unranked",
};

export interface PlayerBadgeProps {
  /** The player's crowns (`Matchmaker.league`); 0 before PvP (Unranked). */
  crowns: number;
  /** Opens the League page: the badge and the crowns. */
  onLeague?: () => void;
  className?: string;
}

/**
 * The profile and the league as one (#787), at the home's top left: the avatar framed in its league's colour, beside it the name
 * and the XP bar (the level, the XP left), under the bar the league's badge and the crowns. The avatar, the name and the bar
 * open the profile sheet (#624); the badge and the crowns the League page. A promotion turns the border to its new colour with
 * a pulse; the bar's gains and level ups are `XpBar`'s. Nothing moves under reduced motion. Without the shell's profile (some
 * stories and tests), the badge and the crowns alone.
 */
export function PlayerBadge({ crowns, onLeague, className }: PlayerBadgeProps) {
  const { value, trigger, sheet } = useProfileOpener();
  const league = leagueOf(crowns);
  const reduced = useReducedMotionConfig();
  const [promoted, setPromoted] = useState<number | null>(null);
  const shown = useRef(league.index);
  useEffect(() => {
    const from = shown.current;
    shown.current = league.index;
    if (league.index > from && !reduced) setPromoted(league.index);
  }, [league.index, reduced]);

  const connected = value?.state.status === "connected";
  const progress = connected ? value?.progress : undefined;
  return (
    <div data-slot="player-badge" className={cn("flex flex-col items-start gap-1", className)}>
      {value && (
        <button
          {...trigger}
          aria-label={`${profileLabel(value.state, undefined)}${progress ? `, ${levelLabel(progress)}` : ""}`}
          className="state-layer flex cursor-pointer items-center gap-2 rounded-full bg-background/70 py-0.5 pr-3 pl-0.5 text-left backdrop-blur outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PlayerAvatar player={avatarPlayer(value.state)} loading={value.state.status === "loading"} look={value.look}>
            <span
              data-slot="league-border"
              data-league={league.id}
              className={cn("pointer-events-none absolute inset-0 rounded-full border-[3px]", BORDER[league.id], !reduced && "transition-colors duration-700")}
            />
            {promoted !== null && (
              <m.span
                key={promoted}
                data-slot="league-promotion"
                className={cn("pointer-events-none absolute inset-0 rounded-full border-4", BORDER[league.id])}
                initial={{ scale: 1, opacity: 0.9 }}
                animate={{ scale: 1.45, opacity: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                onAnimationComplete={() => setPromoted((p) => (p === promoted ? null : p))}
              />
            )}
          </PlayerAvatar>
          <span className="flex w-28 min-w-0 flex-col gap-0.5 mobile:w-32 tablet:w-40">
            <span aria-hidden title={profileName(value.state)} className="truncate text-sm leading-5 font-semibold">
              {profileName(value.state)}
            </span>
            {connected && (
              <Suspense fallback={<XpBarStill progress={progress} />}>
                <XpBar progress={progress} />
              </Suspense>
            )}
          </span>
        </button>
      )}
      <button
        type="button"
        onClick={onLeague}
        aria-label={`League: ${league.name}, ${formatInteger(crowns)} ${crowns === 1 ? "crown" : "crowns"}`}
        className={cn(
          "state-layer flex items-center gap-2 rounded-full border border-border bg-card/90 px-2.5 py-1 backdrop-blur outline-none focus-visible:ring-2 focus-visible:ring-ring",
          // Under the bar: past the avatar's box (44 px), the plate's padding and the gap.
          value && "ml-[3.25rem]",
        )}
      >
        <LeagueCrest league={league} size="sm" />
        <Crowns value={crowns} size="sm" />
      </button>
      {sheet}
    </div>
  );
}
