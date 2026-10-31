import { formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { nextLeague, type League } from "../../lib/pvp-rules";
import { Icon } from "../ui/icon";
import { Cobbles } from "../elements/cobbles";
import { LeagueCrestArt } from "../elements/league-crest-art";
import { LeaguePlate } from "../elements/league-plate";
import { divisionOf, tierOf } from "../elements/league-standards";

export interface LeagueCardProps {
  /** The league; `null`, Unranked (a player who has not entered the leagues, #917): no range of crowns, before Wood. */
  league: League | null;
  className?: string;
}

/** A league's crowns, "1,400 – 1,599", the last open-ended ("5,000+"). */
export function crownRange(league: League): { text: string; name: string } {
  const next = nextLeague(league);
  if (!next) return { text: `${formatInteger(league.from)}+`, name: `${formatInteger(league.from)} crowns and more` };
  return { text: `${formatInteger(league.from)} – ${formatInteger(next.from - 1)}`, name: `${formatInteger(league.from)} to ${formatInteger(next.from - 1)} crowns` };
}

/**
 * A league's card (#833), standing alone since #859 (the carousel's arrows beside it and its dots under it, outside), on the page
 * itself (no card ground, the owner's decision of 2026-10-30): one height for every league, Wood included, so moving through them
 * never moves the page (every crest has one box). The league's crest (#917) in its division's version, the range of crowns and the
 * season's Cobbles, then its plate, its name and the card's heading. Unranked's card (`null`, first in the carousel) has no range: its
 * players have not attacked yet, and Wood's range starts at 0 crowns. No first-time bonus since #917: reaching each group once in a
 * lifetime is a mission (the Missions page). No crowns' count and no back icon (#859): the
 * League page's header holds the player's crowns, and its League control brings the carousel back to the player's league.
 */
export function LeagueCard({ league, className }: LeagueCardProps) {
  const range = league && crownRange(league);
  const tier = tierOf(league);
  return (
    <div data-slot="league-card" className={cn("relative flex flex-col items-center justify-center gap-1 px-3 pb-3 text-center", className)}>
      <LeagueCrestArt tier={tier} division={league && divisionOf(league)} size="xl" />
      {range ? (
        <span role="img" aria-label={range.name} className="inline-flex items-center gap-1 text-sm whitespace-nowrap">
          <Icon name="crown" size="xs" className="text-crown" />
          <span aria-hidden className="numeric font-semibold">
            {range.text}
          </span>
        </span>
      ) : (
        <span className="text-sm font-semibold whitespace-nowrap">Before the first attack</span>
      )}
      <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
        {league && league.seasonCobbles > 0 ? (
          <>
            <Cobbles value={league.seasonCobbles} sign="+" size="sm" /> a season
          </>
        ) : (
          "No season reward"
        )}
      </span>
      <h2 className="m-0 mt-1 leading-none">
        <LeaguePlate tier={tier} name={league?.name ?? "Unranked"} size="lg" />
      </h2>
    </div>
  );
}
