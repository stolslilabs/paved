import { formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { nextLeague, type League } from "../../lib/pvp-rules";
import { Icon } from "../ui/icon";
import { Progress } from "../ui/progress";
import { Cobbles } from "../elements/cobbles";
import { LeagueBonus, BonusBurst, type LeagueBonusState } from "../elements/league-bonus";
import { crestClass, LeagueCrest } from "../elements/league-crest";

export interface LeagueCardProps {
  league: League;
  /** The player's league: its card shows the way to the next. */
  mine: League;
  /** The player's crowns, for the way to the next league and the crowns to go. */
  crowns: number;
  /** Its first-time bonus this season; none for Wood. */
  bonus?: LeagueBonusState;
  /** The bonus's moment is playing over the card. */
  celebrating?: boolean;
  onCelebrate?: () => void;
  onCelebrated?: () => void;
  /** Back to the player's league: the icon at the top left, on every other league's card. */
  onBack?: () => void;
  className?: string;
}

/** A league's crowns, "1,400 – 1,599", the last open-ended ("5,000+"). */
export function crownRange(league: League): { text: string; name: string } {
  const next = nextLeague(league);
  if (!next) return { text: `${formatInteger(league.from)}+`, name: `${formatInteger(league.from)} crowns and more` };
  return { text: `${formatInteger(league.from)} – ${formatInteger(next.from - 1)}`, name: `${formatInteger(league.from)} to ${formatInteger(next.from - 1)} crowns` };
}

/**
 * A league's card (#833), one height for every league, Wood included, so moving through them never moves the page: the back
 * icon at the top left (away from the player's league), the first-time bonus's icon at the top right, the crest and the name, the
 * range of crowns and the season's Cobbles, then one line: for the player's own league a thin bar to the next, for another what
 * it takes ("428 crowns to go") or "Reached".
 */
export function LeagueCard({ league, mine, crowns, bonus, celebrating, onCelebrate, onCelebrated, onBack, className }: LeagueCardProps) {
  const own = league.index === mine.index;
  const range = crownRange(league);
  return (
    <div data-slot="league-card" className={cn("relative flex h-56 flex-col items-center gap-1 rounded-lg px-3 pt-3 pb-2 text-center", className)}>
      <div className="absolute inset-x-2 top-2 flex justify-between">
        {onBack && !own ? (
          <button
            type="button"
            aria-label="Back to my league"
            onClick={onBack}
            className="grid size-9 touch-manipulation place-items-center rounded-full bg-muted text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon name="arrow-left" size="sm" />
          </button>
        ) : (
          <span />
        )}
        {bonus && league.bonus > 0 && <LeagueBonus state={bonus} value={league.bonus} league={league.name} onCelebrate={onCelebrate} />}
      </div>
      <Icon name="shield-halved" size="2xl" className={cn("mt-1", crestClass(league.id))} />
      <h2 className="font-display text-2xl leading-tight">{league.name}</h2>
      <span role="img" aria-label={range.name} className="inline-flex items-center gap-1 text-sm whitespace-nowrap">
        <Icon name="crown" size="xs" className="text-crown" />
        <span aria-hidden className="numeric font-semibold">
          {range.text}
        </span>
      </span>
      <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
        {league.seasonCobbles > 0 ? (
          <>
            <Cobbles value={league.seasonCobbles} sign="+" size="sm" /> a season
          </>
        ) : (
          "No season reward"
        )}
      </span>
      <div className="mt-auto flex h-9 w-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
        <Standing league={league} mine={mine} crowns={crowns} />
      </div>
      {celebrating && <BonusBurst value={league.bonus} onDone={onCelebrated} />}
    </div>
  );
}

/** The card's last line: the way to the next league on the player's own, the crowns to go or "Reached" on another. */
function Standing({ league, mine, crowns }: { league: League; mine: League; crowns: number }) {
  if (league.index !== mine.index)
    return (
      <span data-testid="league-reach">
        {league.index < mine.index ? (
          "Reached"
        ) : (
          <>
            <span className="numeric font-semibold text-foreground">{formatInteger(Math.max(0, league.from - crowns))}</span> crowns to go
          </>
        )}
      </span>
    );
  const next = nextLeague(league);
  if (!next) return <span>The top league.</span>;
  // Held crowns can show the count under the league's floor (its league is the whole count's): the bar starts empty then.
  const progress = Math.max(0, Math.min(100, ((crowns - league.from) / (next.from - league.from)) * 100));
  const missing = formatInteger(Math.max(0, next.from - crowns));
  return (
    <>
      <Progress value={progress} aria-label={`${missing} crowns to ${next.name}`} className="h-1.5 w-full" style={{ maxWidth: "12rem" }} />
      <span className="flex items-center gap-1 whitespace-nowrap">
        <span className="numeric font-semibold text-foreground">{missing}</span> to <LeagueCrest league={next} size="sm" />
      </span>
    </>
  );
}
