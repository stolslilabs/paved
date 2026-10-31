import { useState } from "react";
import type { BoardTile } from "@paved/chain";
import { formatAgo, formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import type { League, PvpPlayer } from "../../lib/pvp-rules";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { CHEST_NAME, type ChestRank } from "../elements/chest-badge";
import { ChestIcon } from "../elements/chest-icon";
import { Crowns } from "../elements/crowns";
import { LeagueCrest } from "../elements/league-crest";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { PlayerAvatar } from "../elements/player-avatar";
import { PlayerName } from "../elements/player-name";
import { StarRow } from "../elements/star-row";
import { BattleBackground, type TileRenders } from "../elements/tile-render";

/** One match on the League page (#786): an attack the player made, or one on their village. */
export interface MatchCardData {
  /** The match page's id (`/pvp/match/:id`), or the replay's on v1. */
  id: string;
  side: "attack" | "defence";
  /** The other player: the defender of an attack, the attacker of a defence. */
  rival: PvpPlayer;
  /** The other player's league where the sources know it (#917): its crest beside their name. Left out (v1's rows): none. */
  league?: League;
  /** The attacked village at the attack's start (the snapshot), in the board's coordinates; null where none is kept (v1). The match page draws it; the card shows its side's background (#834, #857). */
  village: readonly BoardTile[] | null;
  stars: number;
  /** The player's crowns from it: won (positive) or lost (negative). */
  crowns: number;
  score: number;
  /** The attacked village's score then: the target (the match page's; the card shows the score alone, #834). */
  target: number;
  /** An attack's XP and chest (null: none); not known (v1) or a defence's: left out. */
  xp?: number;
  chest?: ChestRank | null;
  surrendered?: boolean;
  /** Seconds since the epoch. */
  at: number;
}

export interface MatchListProps {
  /** The latest matches, attacks and defences mixed, newest first; null while they load. */
  matches: readonly MatchCardData[] | null;
  now: number;
  error?: string | null;
  errorDetail?: ErrorDetail;
  onOpen?: (id: string) => void;
  /** Opens the rival's public profile (#952) from their avatar or name; left out, the whole card opens the match. */
  onOpenPlayer?: (address: string) => void;
  onRetry?: () => void;
  /** The build's renders (`useTileRenders`): the cards' backgrounds (#857); unset or without them, the cards' own colour. */
  renders?: TileRenders;
}

/** The matches shown at first, and the more each "Show more" adds (#786, open point 3). */
export const MATCHES_PAGE = 20;

/** A card's accessible name: what it is, against whom, how it went. */
function cardName(m: MatchCardData): string {
  const who = m.rival.name ?? "a player";
  const what = m.side === "attack" ? `Your attack on ${who}` : `${who}'s attack on your village`;
  return `${what}: ${m.stars} of 3 stars`;
}

/** Lost crowns turn the card's background grey (#834); a win or a draw (0) keeps its colour (open point 2). */
const matchLost = (m: Pick<MatchCardData, "crowns">): boolean => m.crowns < 0;

/**
 * One match as a card (#786, reshaped by #834): the side's background behind (#857: a render of the game's own board, as the
 * Story campaigns' are, one for every attack and one for every defence), in colour when crowns were won and in grayscale when
 * they were lost, under a veil for the text; a stripe and a badge for Attack or Defence. The figures sit in the corners: the
 * other player's avatar and name top left (their league's crest by the badge, #917), the crowns top right, an attack's XP bottom left and its chest bottom right; the
 * stars, the score and how long ago in the middle. One height for every card (open point 3), 112 px (#857). The whole card
 * opens the match.
 */
export function MatchCard({ match: m, now, onOpen, onOpenPlayer, renders }: { match: MatchCardData; now: number; onOpen?: (id: string) => void; onOpenPlayer?: (address: string) => void; renders?: TileRenders }) {
  const attack = m.side === "attack";
  const lost = matchLost(m);
  const rewards = attack && m.xp !== undefined;
  // With the rival's profile (#952) the card holds two controls, which may not nest: the card's own is a layer under the figures,
  // which let the taps through but on the rival's avatar and name.
  const split = onOpenPlayer !== undefined;
  const Root = split ? "div" : "button";
  const card = "state-layer outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <Root
      {...(split ? { "data-slot": "match-card" } : { type: "button" as const, "aria-label": cardName(m), onClick: () => onOpen?.(m.id) })}
      data-side={m.side}
      data-lost={lost}
      className={cn("relative flex h-28 w-full min-w-0 overflow-hidden rounded-xl border border-border bg-card text-left", !split && card)}
    >
      <span aria-hidden data-slot="match-art" className={cn("pointer-events-none absolute inset-0", lost && "grayscale")}>
        <BattleBackground side={m.side} renders={renders} />
      </span>
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-background/60" />
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", attack ? "bg-info" : "bg-warning")} />
      {split && <button type="button" data-slot="match-open" aria-label={cardName(m)} onClick={() => onOpen?.(m.id)} className={cn("absolute inset-0 rounded-[inherit] focus-visible:ring-inset", card)} />}
      <div className={cn("relative flex min-w-0 flex-1 flex-col py-2 pr-3 pl-4 [text-shadow:0_1px_2px_var(--background)]", split && "pointer-events-none")}>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {split ? (
              <button
                type="button"
                data-slot="match-rival"
                aria-label={`${m.rival.name ?? "The player"}'s profile`}
                onClick={() => onOpenPlayer(m.rival.address)}
                className="pointer-events-auto -m-1 flex min-w-0 shrink-0 cursor-pointer items-center rounded-full p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PlayerAvatar player={m.rival} look={m.rival.look} />
              </button>
            ) : (
              <PlayerAvatar player={m.rival} look={m.rival.look} />
            )}
            <div className="flex min-w-0 flex-col items-start gap-0.5">
              {split ? (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden
                  onClick={() => onOpenPlayer(m.rival.address)}
                  className="pointer-events-auto max-w-full min-w-0 cursor-pointer text-left outline-none"
                >
                  <PlayerName name={m.rival.name} address={m.rival.address} className="block max-w-full min-w-0 truncate font-semibold" />
                </button>
              ) : (
                <PlayerName name={m.rival.name} address={m.rival.address} className="max-w-full min-w-0 truncate font-semibold" />
              )}
              <span className="flex items-center gap-1.5">
                <Badge variant={attack ? "info" : "warning"} className="[text-shadow:none]">
                  <Icon name={attack ? "swords" : "shield-halved"} size="xs" />
                  {attack ? "Attack" : "Defence"}
                </Badge>
                {m.league && <LeagueCrest league={m.league} size="sm" iconOnly />}
              </span>
            </div>
          </div>
          <Crowns value={m.crowns} signed className="shrink-0 pt-1" />
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap content-center items-center gap-x-2 gap-y-0.5 text-xs">
          <StarRow stars={m.stars} size="xs" className="shrink-0" />
          <span className="numeric font-semibold" data-testid="match-score">
            {formatInteger(m.score)}
          </span>
          <span className="text-muted-foreground">
            {m.surrendered ? "Surrendered · " : ""}
            <time dateTime={new Date(m.at * 1000).toISOString()}>{formatAgo(m.at - now)}</time>
          </span>
        </div>
        {rewards ? (
          <div className="flex min-w-0 items-end justify-between gap-3">
            <span className="numeric text-sm font-semibold text-primary" data-testid="match-xp">
              +{formatInteger(m.xp!)} XP
            </span>
            <span className="flex items-center gap-1.5 text-xs" data-testid="match-rewards">
              {m.chest ? (
                <>
                  <span className="text-muted-foreground">{CHEST_NAME[m.chest]}</span>
                  <ChestIcon rank={m.chest} size="md" label={null} />
                </>
              ) : (
                <span className="text-muted-foreground">No chest</span>
              )}
            </span>
          </div>
        ) : null}
      </div>
    </Root>
  );
}

/**
 * The League page's battle logs (#786, in place of #647's defence log, revised by #783, titled by #834): the latest attacks and
 * defences mixed, newest first, as cards one under the other, 20 at first and 20 more with each "Show more". No shield's card
 * (#859): the home's overlay shows the shield (#829).
 */
export function MatchList({ matches, now, error, errorDetail, onOpen, onOpenPlayer, onRetry, renders }: MatchListProps) {
  const [shown, setShown] = useState(MATCHES_PAGE);
  return (
    <section aria-labelledby="matches" className="flex flex-col gap-3">
      <h2 id="matches" className="font-semibold">
        Battle logs
      </h2>
      <InlineError
        title="Matches"
        message={error}
        detail={errorDetail}
        action={
          onRetry && (
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          )
        }
      />
      {matches === null && !error && (
        <div aria-busy className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      )}
      {matches?.length === 0 && (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">No match yet. Attack a village: your attacks and those on your village show here.</p>
      )}
      {matches && matches.length > 0 && (
        <ul aria-label="Matches" className="flex flex-col gap-2">
          {matches.slice(0, shown).map((m) => (
            <li key={m.id}>
              <MatchCard match={m} now={now} onOpen={onOpen} onOpenPlayer={onOpenPlayer} renders={renders} />
            </li>
          ))}
        </ul>
      )}
      {matches && matches.length > shown && (
        <Button variant="secondary" onClick={() => setShown((n) => n + MATCHES_PAGE)}>
          Show more
        </Button>
      )}
    </section>
  );
}
