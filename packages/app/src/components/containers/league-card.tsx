import { formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { nextLeague, type League } from "../../lib/pvp-rules";
import { Icon } from "../ui/icon";
import { Cobbles } from "../elements/cobbles";
import { LeagueBonus, BonusBurst, type LeagueBonusState } from "../elements/league-bonus";
import { crestClass } from "../elements/league-crest";

export interface LeagueCardProps {
  league: League;
  /** Its first-time bonus this season; none for Wood. */
  bonus?: LeagueBonusState;
  /** The bonus's moment is playing over the card. */
  celebrating?: boolean;
  onCelebrate?: () => void;
  onCelebrated?: () => void;
  className?: string;
}

/** A league's crowns, "1,400 – 1,599", the last open-ended ("5,000+"). */
export function crownRange(league: League): { text: string; name: string } {
  const next = nextLeague(league);
  if (!next) return { text: `${formatInteger(league.from)}+`, name: `${formatInteger(league.from)} crowns and more` };
  return { text: `${formatInteger(league.from)} – ${formatInteger(next.from - 1)}`, name: `${formatInteger(league.from)} to ${formatInteger(next.from - 1)} crowns` };
}

/**
 * A league's card (#833), standing alone since #859 (the carousel's arrows beside it and its dots under it, outside): one height
 * for every league, Wood included, so moving through them never moves the page. The first-time bonus's icon at the top right, the
 * crest and the name, the range of crowns and the season's Cobbles. No crowns' count and no back icon (#859): the League page's
 * header holds the player's crowns, and its League control brings the carousel back to the player's league.
 */
export function LeagueCard({ league, bonus, celebrating, onCelebrate, onCelebrated, className }: LeagueCardProps) {
  const range = crownRange(league);
  return (
    <div data-slot="league-card" className={cn("relative flex h-40 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card px-3 py-3 text-center", className)}>
      {bonus && league.bonus > 0 && (
        <div className="absolute top-2 right-2">
          <LeagueBonus state={bonus} value={league.bonus} league={league.name} onCelebrate={onCelebrate} />
        </div>
      )}
      <Icon name="shield-halved" size="2xl" className={crestClass(league.id)} />
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
      {celebrating && <BonusBurst value={league.bonus} onDone={onCelebrated} />}
    </div>
  );
}
