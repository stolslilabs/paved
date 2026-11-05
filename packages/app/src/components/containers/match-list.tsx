import { useState, type CSSProperties, type ReactNode } from "react";
import type { BoardTile } from "@paved/chain";
import { formatAgo, formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import type { League, PvpPlayer } from "../../lib/pvp-rules";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { CHEST_NAME, type ChestRank } from "../elements/chest-badge";
import { ChestIcon } from "../elements/chest-icon";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { PlayerName } from "../elements/player-name";
import { SectionTitle } from "../elements/section-title";
import { StarRow } from "../elements/star-row";
import { UiIcon } from "../elements/ui-icon";
import { LeaguePortrait } from "./league-control";

/** One match on the League page (#786): an attack the player made, or one on their village. */
export interface MatchCardData {
  /** The match page's id (`/pvp/match/:id`), or the replay's on v1. */
  id: string;
  side: "attack" | "defence";
  /** The other player: the defender of an attack, the attacker of a defence. */
  rival: PvpPlayer;
  /** The other player's league where the sources know it (#917): its rim round their portrait, its crest on it. Left out (v1's rows): a plain ring. */
  league?: League;
  /** The attacked village at the attack's start (the snapshot), in the board's coordinates; null where none is kept (v1). The match page draws it. */
  village: readonly BoardTile[] | null;
  stars: number;
  /** The player's crowns from it: won (positive) or lost (negative). */
  crowns: number;
  score: number;
  /** The attacked village's score then: the target (the match page's; the row shows the score alone, #834). */
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
  /** Opens the rival's public profile (#952) from their portrait or name; left out, the whole row opens the match. */
  onOpenPlayer?: (address: string) => void;
  onRetry?: () => void;
}

/** The matches shown at first, and the more each "Show more" adds (#786, open point 3). */
export const MATCHES_PAGE = 20;

/** A row's accessible name: what it is, against whom, how it went. */
function cardName(m: MatchCardData): string {
  const who = m.rival.name ?? "a player";
  const what = m.side === "attack" ? `Your attack on ${who}` : `${who}'s attack on your village`;
  return `${what}: ${m.stars} of 3 stars`;
}

/** Lost crowns (#834): the row's figure in the loss colour; a win or a draw (0) is not a loss (open point 2). */
const matchLost = (m: Pick<MatchCardData, "crowns">): boolean => m.crowns < 0;

/** The rival's portrait with its rim: 60 px, the height of the three lines beside it (the owner's ask of 2026-11-05). */
const RIM_BOX: CSSProperties = { fontSize: "3.75rem" };

/** The rival's portrait in the rim of their league with its crest at its lower left (the player card's, the profile's); no league known, a plain ring. */
function RivalPortrait({ rival, league }: { rival: PvpPlayer; league?: League }) {
  return <LeaguePortrait player={rival} look={rival.look} league={league} slot="rival-rim" style={RIM_BOX} />;
}

/** The crowns won or lost: the painted crown and the signed figure, in the gain colour, the loss colour (`Crowns`'), or plain for a draw. */
function CrownsDelta({ value }: { value: number }) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "+";
  const name = `${value < 0 ? "-" : "+"}${formatInteger(Math.abs(value))} ${Math.abs(value) === 1 ? "crown" : "crowns"}`;
  return (
    <span role="img" aria-label={name} data-slot="match-crowns" className="flex items-center gap-1">
      <UiIcon name="crown" px={16} className="drawer-icon size-4" />
      <span aria-hidden className={cn("text-outline text-base leading-tight font-bold tabular-nums", value > 0 ? "text-success" : value < 0 ? "text-warning" : "text-foreground")}>
        {sign}
        {formatInteger(Math.abs(value))}
      </span>
    </span>
  );
}

/**
 * The row's results at its end, behind a vertical rule (the owner's ask of 2026-11-05): the score made at the top, an attack's XP
 * under it, then its chest's icon when it won one, no label (the chest's name is the icon's for screen readers).
 */
function Results({ match: m }: { match: MatchCardData }) {
  const attack = m.side === "attack";
  return (
    <span data-testid="match-rewards" className="flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 text-center">
      <span data-testid="match-score" className="text-outline text-sm leading-tight font-bold tabular-nums">
        {formatInteger(m.score)}
      </span>
      {attack && m.xp !== undefined && (
        <span data-testid="match-xp" className="text-outline text-xs leading-tight font-bold whitespace-nowrap text-primary">
          +{formatInteger(m.xp)} XP
        </span>
      )}
      {attack && m.chest && <ChestIcon rank={m.chest} size="md" label={CHEST_NAME[m.chest]} />}
    </span>
  );
}

/**
 * One match as a row of the battle logs (#786; LEAGUE-PAGE, the Paved UX Book's League): its side's badge and name at the start
 * (Attack, the book's badge, the crossed swords on a gold shield; Defence, the blue shield), the rival's portrait in their league's
 * rim, their name over the crowns won or lost and the stars with how long ago; then, behind a vertical rule, the score, an attack's
 * XP and its chest's icon.
 * The whole row opens the match; with the rivals' profiles (#952) their portrait and name open it instead.
 */
export function MatchCard({ match: m, now, onOpen, onOpenPlayer }: { match: MatchCardData; now: number; onOpen?: (id: string) => void; onOpenPlayer?: (address: string) => void }) {
  const attack = m.side === "attack";
  const lost = matchLost(m);
  // With the rival's profile (#952) the row holds two controls, which may not nest: the row's own is a layer under the figures,
  // which let the taps through but on the rival's portrait and name.
  const split = onOpenPlayer !== undefined;
  const Root = split ? "div" : "button";
  const press = "state-layer outline-none";
  const rival = (content: ReactNode, focusable: boolean, slot?: string) =>
    split ? (
      <button
        type="button"
        data-slot={slot}
        {...(focusable ? { "aria-label": `${m.rival.name ?? "The player"}'s profile` } : { tabIndex: -1, "aria-hidden": true })}
        onClick={() => onOpenPlayer(m.rival.address)}
        className="pointer-events-auto flex max-w-full min-w-0 shrink-0 cursor-pointer items-center rounded-full text-left outline-none"
      >
        {content}
      </button>
    ) : (
      content
    );
  return (
    <Root
      {...(split ? { "data-slot": "match-card" } : { type: "button" as const, "aria-label": cardName(m), onClick: () => onOpen?.(m.id), "data-slot": "match-card" })}
      data-side={m.side}
      data-lost={lost}
      className={cn("relative flex min-h-18 w-full min-w-0 items-center gap-1.5 rounded-xl px-2 py-2 text-left", !split && press)}
    >
      {split && <button type="button" data-slot="match-open" aria-label={cardName(m)} onClick={() => onOpen?.(m.id)} className={cn("absolute inset-0 rounded-[inherit]", press)} />}
      {/* The side's badge (the book's Attack badge, the HUD's blue shield) and its name, tight, a clear gap before the portrait (the
          owner's ask of 2026-11-05; the type stays at its 12 px floor). */}
      <span className={cn("relative mr-1 flex w-12 shrink-0 flex-col items-center gap-0.5", split && "pointer-events-none")}>
        {/* One literal name each: the Font Awesome subset's scan reads a bare "shield" as its icon. */}
        {attack ? <UiIcon name="attack" px={28} className="drawer-icon size-7" /> : <UiIcon name="shield" px={28} className="drawer-icon size-7" />}
        <span className="text-outline text-xs leading-none font-bold tracking-tight">{attack ? "Attack" : "Defence"}</span>
      </span>
      <span className={cn("relative flex shrink-0", split && "pointer-events-none")}>{rival(<RivalPortrait rival={m.rival} league={m.league} />, true, "match-rival")}</span>
      <span className={cn("relative flex min-w-0 flex-1 flex-col items-start gap-0.5", split && "pointer-events-none")}>
        {rival(<PlayerName name={m.rival.name} address={m.rival.address} className="text-outline block max-w-full min-w-0 truncate text-sm font-bold" />, false)}
        <CrownsDelta value={m.crowns} />
        {/* The stars, then how long ago (the book's time column, brought under the name: a phone's row keeps the name its room). */}
        {/* Where the row is too narrow (a 320 px phone beside a tile), the time goes under the stars, never cut. */}
        <span className="flex max-w-full min-w-0 flex-wrap items-center gap-x-1.5">
          <StarRow stars={m.stars} size="xs" className="drawer-icon shrink-0" />
          {m.surrendered && <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">Surrendered</span>}
          <time dateTime={new Date(m.at * 1000).toISOString()} className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
            {formatAgo(m.at - now)}
          </time>
        </span>
      </span>
      <span aria-hidden className="relative w-px shrink-0 self-stretch bg-border" />
      <span className={cn("relative flex self-stretch", split && "pointer-events-none")}>
        <Results match={m} />
      </span>
    </Root>
  );
}

/**
 * The League page's battle logs (#786, in place of #647's defence log, revised by #783, titled by #834; LEAGUE-PAGE: the book's
 * carved list): the latest attacks and defences mixed, newest first, one row each under the drawer's section title, 20 at first and
 * 20 more with each "Show more". No shield's row (#859): the home's overlay shows the shield (#829).
 */
export function MatchList({ matches, now, error, errorDetail, onOpen, onOpenPlayer, onRetry }: MatchListProps) {
  const [shown, setShown] = useState(MATCHES_PAGE);
  return (
    <section aria-labelledby="matches" className="flex flex-col gap-2.5">
      <SectionTitle id="matches">Battle logs</SectionTitle>
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
            <Skeleton key={i} className="h-18 rounded-xl" />
          ))}
        </div>
      )}
      {matches?.length === 0 && (
        <p className="drawer-carved rounded-xl px-4 py-6 text-center text-xs font-semibold text-muted-foreground">No match yet. Attack a village: your attacks and those on your village show here.</p>
      )}
      {matches && matches.length > 0 && (
        // A row's press layer is rounded as the list (no clip on the list: nothing boxes a row in the drawer's body).
        <ul aria-label="Matches" className="drawer-carved flex flex-col rounded-xl">
          {matches.slice(0, shown).map((m, i) => (
            <li key={m.id} className={cn("flex", i > 0 && "border-t border-border")}>
              <MatchCard match={m} now={now} onOpen={onOpen} onOpenPlayer={onOpenPlayer} />
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
