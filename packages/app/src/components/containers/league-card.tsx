import { formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { nextLeague, type League } from "../../lib/pvp-rules";
import { LeagueCrestArt } from "../elements/league-crest-art";
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

/** The crest's height: 61 px on a 320 px phone, 71 px at 375, up to 96 px from about 505 px and in the side panel: the name beside it keeps its room. */
const CREST = { fontSize: "clamp(3.5rem, 19vw, 6rem)" };

/**
 * A league's card (#833), standing alone since #859 (the carousel's arrows beside it and its dots under it, outside). LEAGUE-PAGE
 * (the Paved UX Book's League, 2026-11-02): the league's crest (#917) in its division's version, and beside it the league's name in
 * the display font over its range of crowns (no season's reward: the season's row holds the player's, the owner's ask of
 * 2026-11-05). One height for every league (the carousel's panel takes the
 * tallest), so moving through them never moves the page. Unranked's card (`null`, first in the carousel) has no range: its
 * players have not attacked yet, and Wood's range starts at 0 crowns. No first-time bonus since #917: reaching each group once in a
 * lifetime is a mission (the Missions page). No crowns' count (#859): the header's League control holds the player's crowns and
 * brings the carousel back to the player's league.
 */
export function LeagueCard({ league, className }: LeagueCardProps) {
  const range = league && crownRange(league);
  const tier = tierOf(league);
  return (
    <div data-slot="league-card" className={cn("flex h-full min-w-0 items-center justify-center gap-2.5 py-1", className)}>
      <span className="flex shrink-0" style={CREST}>
        <LeagueCrestArt tier={tier} division={league && divisionOf(league)} size="inherit" className="drawer-icon" />
      </span>
      <div className="flex min-w-0 flex-col items-start gap-1">
        <h2 className="text-outline m-0 font-display text-2xl leading-none tracking-wide">{league?.name ?? "Unranked"}</h2>
        {range ? (
          <span role="img" aria-label={range.name} className="text-sm leading-tight font-bold whitespace-nowrap text-muted-foreground tabular-nums mobile:text-base">
            <span aria-hidden>{range.text}</span>
          </span>
        ) : (
          <span className="text-sm leading-tight font-bold text-muted-foreground">Before the first attack</span>
        )}
      </div>
    </div>
  );
}
