import { formatInteger, formatRelative } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { LEAGUES, leagueOf, nextLeague } from "../../lib/pvp-rules";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Progress } from "../ui/progress";
import { Cobbles } from "../elements/cobbles";
import { Countdown } from "../elements/countdown";
import { Crowns } from "../elements/crowns";
import { LeagueCrest } from "../elements/league-crest";
import { TopBar } from "../containers/top-bar";

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
  season: PvpSeason;
  now: number;
  /** The player has never attacked: no league until the first attack. */
  unranked?: boolean;
  onBack?: () => void;
  /** To the search. */
  onAttack?: () => void;
  /** To the defence log. */
  onDefence?: () => void;
}

/** A season's last day: its timer turns to the warning colour (the countdown's own rule is the last hour). */
const LAST_DAY_S = 86_400;

/**
 * The league (#647): the player's crowns, their league and the way to the next, the season's end and what it gives in each
 * league (#644 decides; `LEAGUES` proposes), the leagues in a ladder with the player's marked.
 */
export function PvpLeagueScene({ crowns, best, season, now, unranked, onBack, onAttack, onDefence }: PvpLeagueSceneProps) {
  const league = leagueOf(crowns);
  const next = nextLeague(league);
  const progress = next ? ((crowns - league.from) / (next.from - league.from)) * 100 : 100;
  const left = season.endsAt - now;
  const ended = left <= 0;
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <TopBar title="League" onBack={onBack} />
      <main className="mx-auto grid w-full max-w-5xl flex-1 content-start gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] desktop:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-4">
          <section aria-label="Your league" className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-4 py-5 text-center">
            {unranked ? (
              <>
                <Icon name="shield-halved" size="xl" className="text-muted-foreground" />
                <h2 className="font-display text-2xl">Unranked</h2>
                <p className="text-sm text-muted-foreground">Attack a village to enter the leagues. Every star wins crowns.</p>
              </>
            ) : (
              <>
                <LeagueCrest league={league} size="lg" />
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
            )}
          </section>

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
              {!ended && <Cobbles value={unranked ? 0 : league.seasonCobbles} sign="+" />}
            </p>
          </section>

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

        <section aria-label="Leagues" className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Leagues</h2>
          <ol className="flex flex-col gap-1.5">
            {[...LEAGUES].reverse().map((l) => {
              const mine = !unranked && l.id === league.id;
              return (
                <li key={l.id} aria-current={mine ? "true" : undefined} className={cn("flex items-center gap-3 rounded-lg border px-3 py-2", mine ? "border-primary bg-primary/10" : "border-border bg-card")}>
                  <LeagueCrest league={l} className="flex-1" />
                  {mine && <span className="text-xs font-semibold text-primary">You</span>}
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    from <Crowns value={l.from} size="sm" />
                  </span>
                  <Cobbles value={l.seasonCobbles} sign="+" size="sm" className="w-14 justify-end" />
                </li>
              );
            })}
          </ol>
        </section>
      </main>
    </div>
  );
}
