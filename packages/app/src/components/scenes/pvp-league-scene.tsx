import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { useReducedMotionConfig } from "motion/react";
import { formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { LEAGUES, leagueOf, type League } from "../../lib/pvp-rules";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { Cobbles } from "../elements/cobbles";
import { Countdown } from "../elements/countdown";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { UiIcon } from "../elements/ui-icon";
import { HudDrawer } from "../containers/hud-drawer";
import { LeagueCard } from "../containers/league-card";
import { LeagueCarousel, slideOf } from "../containers/league-carousel";
import { LeagueControl } from "../containers/league-control";
import { MatchList, type MatchListProps } from "../containers/match-list";

export interface PvpSeason {
  /** "Season 3". */
  name: string;
  /** Seconds since the epoch. */
  endsAt: number;
}

/**
 * What stands in the page's place while it has no standing to show (the route's waits and refusals, in the drawer): PvP not on this
 * network, the standing on its way (the account's too: NO-GUEST, none is asked to connect), or its read failed.
 */
export type LeagueWait =
  | { kind: "unavailable" }
  | { kind: "loading" }
  | { kind: "error"; message: string; detail?: ErrorDetail; onRetry?: () => void };

export interface PvpLeagueSceneProps {
  crowns: number;
  /** The season now; null before the first (the owner has not set the season clock, #644). */
  season: PvpSeason | null;
  now: number;
  /** The player has never attacked: no league until the first attack. */
  unranked?: boolean;
  /**
   * The league on chain (`Matchmaker.league(v).league`, 0 Wood to 22 Grand Master), when known. It is the league of the whole
   * count, an open attack's hold included, while `crowns` is shown less the hold: so it is not recomputed from `crowns`.
   * Left out, the league of `crowns`.
   */
  league?: number;
  /** The league the carousel opens on (`LEAGUES`' index), for the stories; the player's by default. */
  opensOn?: number;
  /** The drawer's close: Back on a phone, the cross from `tablet`, Escape, a tap on the village. */
  onBack?: () => void;
  /**
   * The latest attacks and defences as rows (#786, in place of the defence log; no shield since #859); none when omitted. A section
   * of the page (BACK-RULE #783: no page opens another page).
   */
  matches?: Omit<MatchListProps, "now" | "onOpen" | "onRetry">;
  /** A match opened (a full-screen flow, `/pvp/match/:id`): its Back comes up to this page. */
  onOpenMatch?: (id: string) => void;
  /** The matches' read again, after its failure. */
  onRetryMatches?: () => void;
  /** In the standing's place: a wait or a refusal (`LeagueWait`); the header keeps its title. */
  wait?: LeagueWait;
  /** Whether the drawer is shown (LEAGUE-PAGE): its route is the current one; false while it slides out. Omitted, shown. */
  open?: boolean;
  /** Where the focus goes back as the drawer closes (the HUD's crowns, which opened it); omitted, Radix's own. */
  returnFocus?: () => HTMLElement | null;
}

/** A season's last day: its timer turns to the warning colour (the countdown's own rule is the last hour). */
const LAST_DAY_S = 86_400;

/** A press outside the drawer that is no tap on the village: on a dialog drawn over the drawer (a rival's profile, #952). */
function keepForDialogs(event: Event) {
  if (event.target instanceof Element && event.target.closest('[role="dialog"]')) event.preventDefault();
}

/**
 * The league (#647). LEAGUE-PAGE (the Paved UX Book's League, the owner's approved mockups of 2026-11-02): the HUD's drawer, as the
 * profile and the Missions (`HudDrawer`): a full page with Back on a phone, a side panel docked at the left from `tablet` (the
 * HUD's crowns, at the home's top left, open it), its close the red cross. The header's end holds the League control (#859: the
 * crowns and the crest; a tap brings the carousel back to the player's league). Under it, in the drawer's carved surfaces: the
 * leagues' carousel, Unranked and the 23 leagues opening on the player's (#785, #917), each card the crest beside its name and its
 * range of crowns between two thin arrows (no dots); the season in one row (its calendar, what the player's league gives at its
 * end, #644, #859, its time left); then the battle logs (#786), each row opening its match. No Attack button (#833).
 */
export function PvpLeagueScene(props: PvpLeagueSceneProps) {
  const { crowns, season, now, unranked, league: index, opensOn, onBack, matches, onOpenMatch, onRetryMatches, wait } = props;
  const league = (index !== undefined ? LEAGUES[index] : undefined) ?? leagueOf(crowns);
  // Below Iron III (400 crowns) a village is in Wood on chain, as one that never attacked.
  const outside = unranked || league.id === "wood";
  const mine = outside ? LEAGUES[0]! : league;
  const browser = useRef<LeagueBrowserHandle>(null);
  const control = wait ? null : (
    <LeagueControl
      crowns={crowns}
      league={mine}
      unranked={unranked}
      variant="page"
      onLeague={() => browser.current?.showMine()}
      label={`Your league: ${unranked ? "Unranked" : mine.name}, ${formatInteger(crowns)} ${crowns === 1 ? "crown" : "crowns"}. Show it`}
    />
  );
  return (
    <HudDrawer
      open={props.open ?? true}
      onOpenChange={(next) => {
        if (!next) onBack?.();
      }}
      title="League"
      side="left"
      slot="league"
      returnFocus={props.returnFocus}
      end={control}
      // A press on a dialog over it (a rival's profile) is no tap on the village.
      onInteractOutside={keepForDialogs}
    >
      {wait ? (
        <Waiting wait={wait} />
      ) : (
        <>
          <LeagueBrowser ref={browser} mine={unranked ? null : mine} opensOn={opensOn} />
          <SeasonBand season={season} now={now} league={mine} outside={outside} />
          {matches && <MatchList {...matches} now={now} onOpen={onOpenMatch} onRetry={onRetryMatches} />}
        </>
      )}
    </HudDrawer>
  );
}

/** The page's waits and refusals, in the drawer's body. */
function Waiting({ wait }: { wait: LeagueWait }) {
  if (wait.kind === "unavailable") return <Notice title="No league here yet">PvP is not on this network yet.</Notice>;
  if (wait.kind === "error")
    return (
      <InlineError
        title="Could not load your league"
        message={wait.message}
        detail={wait.detail}
        action={
          wait.onRetry && (
            <Button size="sm" variant="outline" onClick={wait.onRetry}>
              Retry
            </Button>
          )
        }
      />
    );
  return (
    <div role="status" aria-label="Loading your league" className="flex flex-col gap-3">
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-12 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

/**
 * The season in one carved row (the book's, the owner's asks of 2026-11-05): the book's calendar and the season's name; in the
 * middle what the player's league gives at its end (#644's Cobbles, paid at the season's roll with no claim, #859), Wood and Unranked
 * the way to the first league that does; at its end the time left in a carved chip, as the Missions' rows' resets (`Countdown`),
 * in the warning colour on its last day. Once it ended, "Ended" there and its rewards on their way; before the first season, one
 * line says so.
 */
function SeasonBand({ season, now, league, outside }: { season: PvpSeason | null; now: number; league: League; outside: boolean }) {
  const emblem = <UiIcon name="season" px={32} className="drawer-icon size-8" />;
  // Gaps of 6 px: the reward keeps its room between the name and the chip on a 320 px phone ("+250", "46d 22h").
  const row = "drawer-carved flex items-center gap-1.5 rounded-xl px-2.5 py-2";
  const chip = "drawer-carved h-7 shrink-0 rounded-full px-2.5";
  if (season === null)
    return (
      <section aria-label="Season" className={row}>
        {emblem}
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="text-outline text-lg leading-tight font-bold">Before the first season</h2>
          <p className="text-xs font-semibold text-muted-foreground">The seasons start soon: attack now, your crowns count from the first day.</p>
        </div>
      </section>
    );
  const left = season.endsAt - now;
  const ended = left <= 0;
  return (
    <section aria-label="Season" data-ended={ended} className={row}>
      {emblem}
      {/* A step smaller on a 320 px phone: the reward between the name and the chip keeps its room. */}
      <h2 className="text-outline shrink-0 text-base leading-tight font-bold whitespace-nowrap mobile:text-lg">{season.name}</h2>
      <span className="flex min-w-0 flex-1 items-center justify-center text-center">
        {ended ? (
          <span className="text-xs font-semibold text-muted-foreground">Its rewards are on their way</span>
        ) : outside ? (
          <span data-testid="season-reward" className="text-xs font-semibold text-muted-foreground">
            Reach <span className="font-bold text-foreground">{LEAGUES[1]!.name}</span> to earn Cobbles
          </span>
        ) : (
          // A flex box, not a line: the cube and its figure centred on the row's middle, as the calendar and the chip.
          <span data-testid="season-reward" className="text-outline flex items-center font-bold">
            <span className="sr-only">{league.name} at the season's end: </span>
            <Cobbles value={league.seasonCobbles} sign="+" size="md" className="text-sm leading-none font-bold mobile:text-base" />
          </span>
        )}
      </span>
      {ended ? (
        <span className={cn(chip, "inline-flex items-center text-xs font-semibold text-muted-foreground")}>Ended</span>
      ) : (
        <Countdown expiresAt={season.endsAt} now={now} label="Season ends in" short className={cn(chip, left < LAST_DAY_S ? "text-warning" : "text-foreground")} />
      )}
    </section>
  );
}

/** The carousel's own call from the page: back to the player's league (the header's League control, #859). */
interface LeagueBrowserHandle {
  showMine: () => void;
}

interface LeagueBrowserProps extends Pick<PvpLeagueSceneProps, "opensOn"> {
  ref?: Ref<LeagueBrowserHandle>;
  /** The player's league; `null`, Unranked. */
  mine: League | null;
}

/**
 * The carousel and its cards, on the drawer's face (no carved panel: the owner's ask of 2026-11-05), with the league in view as their own state: moving through the
 * leagues redraws the carousel alone, never the season or the matches below, nor the header (its League control calls `showMine`).
 */
function LeagueBrowser({ ref, mine, opensOn }: LeagueBrowserProps) {
  const [selected, setSelected] = useState(slideOf(opensOn !== undefined ? LEAGUES[opensOn]! : mine));
  const select = (index: number) => setSelected(index);
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotionConfig();
  // The header's League control: the carousel glides back to the player's league (a cut under reduced motion, the carousel's
  // rule), brought into view when the page was scrolled past it.
  useImperativeHandle(ref, () => ({
    showMine: () => {
      select(slideOf(mine));
      root.current?.scrollIntoView?.({ block: "nearest", behavior: reduced ? "instant" : "smooth" });
    },
  }));
  return (
    <LeagueCarousel ref={root} selected={selected} onSelect={select} mine={slideOf(mine)} className="py-1">
      {(l) => <LeagueCard league={l} />}
    </LeagueCarousel>
  );
}
