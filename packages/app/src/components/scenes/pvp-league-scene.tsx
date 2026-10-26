import { useState, type ReactNode } from "react";
import { formatInteger, formatRelative } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { LEAGUES, LEAGUE_LADDER, leagueOf, nextLeague, type League } from "../../lib/pvp-rules";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Progress } from "../ui/progress";
import { Cobbles } from "../elements/cobbles";
import { Countdown } from "../elements/countdown";
import { Crowns } from "../elements/crowns";
import { LeagueCrest } from "../elements/league-crest";
import { LeagueCarousel } from "../containers/league-carousel";
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
  /** The best crowns of the season so far. */
  best?: number;
  /** The season now; null before the first (the owner has not set the season clock, #644). */
  season: PvpSeason | null;
  now: number;
  /** The player has never attacked: no league until the first attack. */
  unranked?: boolean;
  /**
   * The league on chain (`Matchmaker.league(v).league`, 0 Unranked to 22 Legend), when known. It is the league of the whole
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
  /** To the search. */
  onAttack?: () => void;
  /** To the defence log. */
  onDefence?: () => void;
}

/** The attacks a village settles in a season to earn its reward (`MIN_SEASON_ATTACKS`). */
const MIN_SEASON_ATTACKS = 5;

/** A season's last day: its timer turns to the warning colour (the countdown's own rule is the last hour). */
const LAST_DAY_S = 86_400;

/**
 * The league (#647): a carousel of the 23 leagues opening on the player's (#785), the details of the league in view (its floor,
 * the crowns still missing, its season Cobbles and first-time bonus; for the player's own, the way to the next), then the
 * season's end and what it gives (#644's rewards).
 */
export function PvpLeagueScene({ crowns, best, season, now, unranked, attacks, league: index, opensOn, onBack, onNavigate, onAttack, onDefence }: PvpLeagueSceneProps) {
  const league = (index !== undefined ? LEAGUES[index] : undefined) ?? leagueOf(crowns);
  // Below Bronze III (400 crowns) a village is Unranked on chain, as one that never attacked.
  const outside = unranked || league.id === "unranked";
  const mine = outside ? LEAGUES[0]! : league;
  const [selected, setSelected] = useState(opensOn ?? mine.index);
  const left = season ? season.endsAt - now : 0;
  const ended = season !== null && left <= 0;
  return (
    <TabFrame tab="league" onNavigate={onNavigate}>
      <TopBar title="League" onBack={onBack} />
      <main className="mx-auto grid w-full max-w-5xl content-start gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card px-2 pt-2 pb-4">
            <LeagueCarousel selected={selected} onSelect={setSelected} mine={mine.index} />
            <LeagueDetails league={LEAGUES[selected]!} mine={mine} crowns={crowns} best={best} unranked={unranked} />
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

          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" onClick={onAttack}>
              <Icon name="swords" size="sm" />
              Attack
            </Button>
            <Button size="lg" variant="secondary" onClick={onDefence}>
              <Icon name="shield-halved" size="sm" />
              Defence log
            </Button>
          </div>
        </div>

      </main>
    </TabFrame>
  );
}

interface LeagueDetailsProps {
  /** The league in view. */
  league: League;
  /** The player's. */
  mine: League;
  crowns: number;
  best?: number;
  unranked?: boolean;
}

/** The league in view's details (#785): the player's own with their crowns and the way to the next, another with what it takes. */
function LeagueDetails({ league, mine, crowns, best, unranked }: LeagueDetailsProps) {
  const own = league.index === mine.index;
  const next = nextLeague(league);
  // Held crowns can show the count under the league's floor (its league is the whole count's): the bar starts empty then.
  const progress = next ? Math.max(0, Math.min(100, ((crowns - league.from) / (next.from - league.from)) * 100)) : 100;
  const bronze = LEAGUE_LADDER[0]!;
  return (
    <div aria-label={`${league.name} details`} role="group" className="flex flex-col items-center gap-3 px-2 text-center">
      {own && league.index === 0 ? (
        <p className="text-sm text-muted-foreground">
          {unranked ? "Attack a village to enter the leagues." : `${formatInteger(bronze.from - crowns)} crowns to Bronze.`} Every star wins crowns.
        </p>
      ) : own ? (
        <>
          <Crowns value={crowns} size="lg" />
          {next ? (
            <div className="flex w-full flex-col gap-1">
              <Progress value={progress} aria-label={`${formatInteger(next.from - crowns)} crowns to ${next.name}`} />
              <span className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <span className="numeric font-semibold text-foreground">{formatInteger(next.from - crowns)}</span> crowns to <LeagueCrest league={next} size="sm" />
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">The top league.</span>
          )}
          {best != null && best > crowns && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              Season best <Crowns value={best} size="sm" />
            </span>
          )}
        </>
      ) : league.index === 0 ? (
        <p className="text-sm text-muted-foreground">Every village under {formatInteger(bronze.from)} crowns, and every one that never attacked.</p>
      ) : null}
      {league.index > 0 && (
        <dl className="grid w-full grid-cols-2 gap-2 text-left">
          <Detail term="Floor">
            <Crowns value={league.from} size="sm" />
            {!own && (
              <span data-testid="league-reach" className="text-xs text-muted-foreground">
                {league.index < mine.index ? (
                  "Reached"
                ) : (
                  <>
                    <span className="numeric font-semibold text-foreground">{formatInteger(Math.max(0, league.from - crowns))}</span> to go
                  </>
                )}
              </span>
            )}
          </Detail>
          <Detail term="Season reward">
            <Cobbles value={league.seasonCobbles} sign="+" size="sm" />
          </Detail>
          <Detail term="First time bonus" className="col-span-2">
            <Cobbles value={league.bonus} sign="+" size="sm" />
            <span className="text-xs text-muted-foreground">once a season</span>
          </Detail>
        </dl>
      )}
    </div>
  );
}

function Detail({ term, className, children }: { term: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-0.5 rounded-lg bg-muted/40 px-3 py-2", className)}>
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="flex flex-wrap items-center gap-x-2">{children}</dd>
    </div>
  );
}
