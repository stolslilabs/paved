import { useState } from "react";
import { formatRelative } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { LEAGUES, leagueOf, type League } from "../../lib/pvp-rules";
import { Cobbles } from "../elements/cobbles";
import { Countdown } from "../elements/countdown";
import { Crowns } from "../elements/crowns";
import type { LeagueBonusState } from "../elements/league-bonus";
import { LeagueCard } from "../containers/league-card";
import { LeagueCarousel } from "../containers/league-carousel";
import { MatchList, type MatchListProps } from "../containers/match-list";
import { TabFrame } from "../containers/tab-frame";
import { TopBar } from "../containers/top-bar";
import type { Tab } from "../../routes/pages";

export interface PvpSeason {
  /** "Season 3". */
  name: string;
  /** Seconds since the epoch. */
  endsAt: number;
}

export interface PvpLeagueSceneProps {
  crowns: number;
  /** The best crowns of the season so far: every league up to its league has paid its first-time bonus this season. */
  best?: number;
  /**
   * The leagues (`LEAGUES`' indexes) whose first-time bonus was paid and is still to be celebrated (#833, open point 1: no claim
   * on chain): their bonus's icon is active until its moment plays.
   */
  bonusesToSee?: readonly number[];
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
  /** The attacks settled this season: its reward needs `MIN_SEASON_ATTACKS` (#644). */
  attacks?: number;
  /** The league the carousel opens on (`LEAGUES`' index), for the stories; the player's by default. */
  opensOn?: number;
  onBack?: () => void;
  /** A pick in the phone's bar (#763): the page is the League tab's. */
  onNavigate?: (tab: Tab) => void;
  /** A bonus's moment started (a tap on its icon): it is seen, and never plays again. */
  onBonusSeen?: (league: number) => void;
  /**
   * The latest attacks and defences as cards (#786, in place of the defence log), with the shield; none when omitted. A section
   * of the page (BACK-RULE #783: no page opens another page).
   */
  matches?: Omit<MatchListProps, "now" | "onOpen" | "onRetry">;
  /** A match opened (a full-screen flow, `/pvp/match/:id`): its Back comes up to this page. */
  onOpenMatch?: (id: string) => void;
  /** The matches' read again, after its failure. */
  onRetryMatches?: () => void;
}

/** The attacks a village settles in a season to earn its reward (`MIN_SEASON_ATTACKS`). */
const MIN_SEASON_ATTACKS = 5;

/** A season's last day: its timer turns to the warning colour (the countdown's own rule is the last hour). */
const LAST_DAY_S = 86_400;

/**
 * The league (#647): a carousel of the 23 leagues opening on the player's (#785), one card size for every league (#833: its range
 * of crowns, its season Cobbles, its first-time bonus's icon, the back icon; for the player's own, the way to the next), the dots,
 * the player's crowns, then the season's end and what it gives (#644's rewards), and the latest attacks and defences as cards
 * (#786), each opening its match. No Attack button (#833): it is in the phone's bar, and the panel closes on desktop.
 */
export function PvpLeagueScene(props: PvpLeagueSceneProps) {
  const { crowns, best, bonusesToSee, season, now, unranked, attacks, league: index, opensOn, onBack, onNavigate, onBonusSeen, matches, onOpenMatch, onRetryMatches } = props;
  const league = (index !== undefined ? LEAGUES[index] : undefined) ?? leagueOf(crowns);
  // Below Iron III (400 crowns) a village is in Wood on chain, as one that never attacked.
  const outside = unranked || league.id === "wood";
  const mine = outside ? LEAGUES[0]! : league;
  // The highest league reached this season: each league up to it has paid its first-time bonus, kept after a drop (to Wood too).
  const peak = Math.max(mine.index, best != null ? leagueOf(best).index : 0);
  const left = season ? season.endsAt - now : 0;
  const ended = season !== null && left <= 0;
  return (
    <TabFrame tab="league" onNavigate={onNavigate}>
      <TopBar title="League" onBack={onBack} />
      <main className="mx-auto grid w-full max-w-5xl content-start gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card px-2 pt-2 pb-4">
            <LeagueBrowser mine={mine} crowns={crowns} peak={peak} opensOn={opensOn} bonusesToSee={bonusesToSee} onBonusSeen={onBonusSeen} />
            <p data-testid="league-player" className="flex min-h-5 flex-wrap items-center justify-center gap-x-3 gap-y-1 px-2 text-center text-sm text-muted-foreground">
              {unranked ? (
                "Attack a village to enter the leagues. Every star wins crowns."
              ) : (
                <>
                  <span className="flex items-center gap-1">
                    Your crowns <Crowns value={crowns} size="sm" />
                  </span>
                  {best != null && best > crowns && (
                    <span className="flex items-center gap-1">
                      Season best <Crowns value={best} size="sm" />
                    </span>
                  )}
                </>
              )}
            </p>
          </div>

          {season === null ? (
            <section aria-label="Season" className="flex flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3">
              <h2 className="font-semibold">Before the first season</h2>
              <p className="text-sm text-muted-foreground">The seasons start soon: attack now, your crowns count from the first day.</p>
            </section>
          ) : (
            <section aria-label="Season" data-ended={ended} className={cn("flex flex-col gap-2 rounded-xl border px-4 py-3", !ended && left < LAST_DAY_S ? "border-warning/40 bg-warning/10" : "border-border bg-card")}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{season.name}</h2>
                {ended ? (
                  <span className="text-xs text-muted-foreground">Ended {formatRelative(left)}</span>
                ) : left < LAST_DAY_S ? (
                  <Countdown expiresAt={season.endsAt} now={now} label="Ends in" className="text-warning" />
                ) : (
                  <span className="text-xs text-muted-foreground">Ends {formatRelative(left)}</span>
                )}
              </div>
              <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                {ended ? "Its rewards are on their way." : "At its end, your league gives"}
                {!ended && <Cobbles value={outside ? 0 : league.seasonCobbles} sign="+" />}
                {!ended && attacks !== undefined && (
                  <span className="w-full text-xs">
                    {attacks >= MIN_SEASON_ATTACKS ? (
                      "Earned: you attacked enough this season."
                    ) : (
                      <>
                        once you attack <span className="numeric font-semibold text-foreground">{MIN_SEASON_ATTACKS - attacks}</span> more {MIN_SEASON_ATTACKS - attacks === 1 ? "time" : "times"} this season.
                      </>
                    )}
                  </span>
                )}
              </p>
            </section>
          )}

          {matches && <MatchList {...matches} now={now} onOpen={onOpenMatch} onRetry={onRetryMatches} />}
        </div>
      </main>
    </TabFrame>
  );
}

interface LeagueBrowserProps extends Pick<PvpLeagueSceneProps, "crowns" | "opensOn" | "bonusesToSee" | "onBonusSeen"> {
  /** The player's league. */
  mine: League;
  /** The highest league reached this season (`LEAGUES`' index). */
  peak: number;
}

/**
 * The carousel and its cards, with the league in view and the bonus's moment as their own state: moving through the leagues
 * redraws the carousel alone, never the season or the matches below.
 */
function LeagueBrowser({ mine, crowns, peak, opensOn, bonusesToSee, onBonusSeen }: LeagueBrowserProps) {
  const [selected, setSelected] = useState(opensOn ?? mine.index);
  const [seen, setSeen] = useState<readonly number[]>([]);
  // The league whose bonus's moment is playing. A tap marks the bonus seen at once: leaving the league ends the moment, and a
  // return never replays it (only a tap starts one).
  const [celebrating, setCelebrating] = useState<number | null>(null);
  const select = (index: number) => {
    if (index !== selected) setCelebrating(null);
    setSelected(index);
  };
  const bonusOf = (l: League): LeagueBonusState => (l.index > peak ? "locked" : bonusesToSee?.includes(l.index) && !seen.includes(l.index) ? "ready" : "had");
  return (
    <LeagueCarousel selected={selected} onSelect={select} mine={mine.index}>
      {(l, current) => (
        <LeagueCard
          league={l}
          mine={mine}
          crowns={crowns}
          bonus={bonusOf(l)}
          celebrating={current && celebrating === l.index}
          onCelebrate={() => {
            setCelebrating(l.index);
            setSeen((s) => [...s, l.index]);
            onBonusSeen?.(l.index);
          }}
          onCelebrated={() => setCelebrating(null)}
          onBack={() => select(mine.index)}
        />
      )}
    </LeagueCarousel>
  );
}
