import { useState } from "react";
import type { BoardTile } from "@paved/chain";
import { formatInteger, formatRelative } from "@paved/game-core";
import { cn } from "../../lib/utils";
import type { PvpPlayer } from "../../lib/pvp-rules";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { ChestBadge, CHEST_NAME, type ChestRank } from "../elements/chest-badge";
import { Crowns } from "../elements/crowns";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { PlayerAvatar } from "../elements/player-avatar";
import { PlayerName } from "../elements/player-name";
import { formatHoursMinutes, shieldDuration, shieldEnd, shieldLabel } from "../elements/shield-time";
import { StarRow } from "../elements/star-row";
import { BoardMap } from "./board-map";

/** One match on the League page (#786): an attack the player made, or one on their village. */
export interface MatchCardData {
  /** The match page's id (`/pvp/match/:id`), or the replay's on v1. */
  id: string;
  side: "attack" | "defence";
  /** The other player: the defender of an attack, the attacker of a defence. */
  rival: PvpPlayer;
  /** The attacked village at the attack's start (the snapshot), in the board's coordinates; null where none is kept (v1). */
  village: readonly BoardTile[] | null;
  stars: number;
  /** The player's crowns from it: won (positive) or lost (negative). */
  crowns: number;
  score: number;
  /** The attacked village's score then: the target. */
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
  /** The village's shield, while it lasts (seconds since the epoch): 8 hours after an attack, dropped by attacking. */
  shieldEndsAt?: number | null;
  /** The shield is not known: its read is on its way or failed (`error` says why). Never shown as "No shield". */
  shieldUnknown?: boolean;
  now: number;
  error?: string | null;
  errorDetail?: ErrorDetail;
  onOpen?: (id: string) => void;
  onRetry?: () => void;
}

/** The matches shown at first, and the more each "Show more" adds (#786, open point 3). */
export const MATCHES_PAGE = 20;

/** The shield's card: its end and its time left in `HH:MM` while it lasts (#806, the home chip's), else the village is open to attacks. */
function ShieldCard({ endsAt, now, unknown }: { endsAt: number | null | undefined; now: number; unknown?: boolean }) {
  const on = !unknown && endsAt != null && endsAt > now;
  if (unknown) {
    return (
      <section aria-label="Shield" data-shield="unknown" className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <Icon name="shield-halved" size="xl" className="text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-semibold">Shield not known</span>
          <span className="text-xs text-muted-foreground">Your shield could not be read yet.</span>
        </div>
      </section>
    );
  }
  return (
    <section aria-label="Shield" data-shield={on ? "on" : "off"} className={cn("flex items-center gap-3 rounded-xl border px-4 py-3", on ? "border-info/40 bg-info/10" : "border-border bg-card")}>
      <Icon name="shield-halved" size="xl" className={on ? "text-info" : "text-muted-foreground"} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold">{on ? "Your village is shielded" : "No shield"}</span>
        <span className="text-xs text-muted-foreground">
          {on ? (
            <>
              No one can attack it until <span className="numeric">{shieldEnd(endsAt!)}</span>. Attacking drops it.
            </>
          ) : (
            "Your village can be attacked. An attack shields it for 8 hours."
          )}
        </span>
      </div>
      {on && (
        <time role="timer" aria-label={shieldLabel(endsAt!, now)} dateTime={shieldDuration(endsAt!, now)} className="numeric text-sm font-semibold whitespace-nowrap">
          {formatHoursMinutes(endsAt! - now)}
        </time>
      )}
    </section>
  );
}

/** A card's accessible name: what it is, against whom, how it went. */
function cardName(m: MatchCardData): string {
  const who = m.rival.name ?? "a player";
  const what = m.side === "attack" ? `Your attack on ${who}` : `${who}'s attack on your village`;
  return `${what}: ${m.stars} of 3 stars`;
}

/**
 * One match as a card (#786): the attacked village's plan view behind (the snapshot's `BoardMap`, no WebGL per card), dimmed under
 * the text; the other player's avatar and name, Attack or Defence and when; the stars and the crowns won (green) or lost; an
 * attack's rewards, its XP and chest. The whole card opens the match.
 */
export function MatchCard({ match: m, now, onOpen }: { match: MatchCardData; now: number; onOpen?: (id: string) => void }) {
  const attack = m.side === "attack";
  return (
    <button
      type="button"
      data-side={m.side}
      aria-label={cardName(m)}
      onClick={() => onOpen?.(m.id)}
      className="state-layer relative flex w-full min-w-0 overflow-hidden rounded-xl border border-border bg-card text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {m.village && m.village.length > 0 && (
        // The village larger than the card, its middle in view (the card crops it), faded toward the text.
        <div aria-hidden inert className="pointer-events-none absolute top-1/2 right-0 h-[260%] w-3/4 -translate-y-1/2 opacity-40 [mask-image:linear-gradient(to_right,transparent,black_55%)]">
          <BoardMap tiles={[...m.village]} fit className="bg-transparent p-0" />
        </div>
      )}
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", attack ? "bg-info" : "bg-warning")} />
      <div className="relative flex min-w-0 flex-1 items-center gap-3 py-3 pr-3 pl-4">
        <PlayerAvatar player={m.rival} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <Badge variant={attack ? "info" : "warning"} className="shrink-0">
              <Icon name={attack ? "swords" : "shield-halved"} size="xs" />
              {attack ? "Attack" : "Defence"}
            </Badge>
            <PlayerName name={m.rival.name} address={m.rival.address} className="min-w-0 truncate font-semibold" />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <StarRow stars={m.stars} size="xs" className="shrink-0" />
            <span className="numeric">
              {formatInteger(m.score)} / {formatInteger(m.target)}
            </span>
            <span>{m.surrendered ? "Surrendered · " : ""}{formatRelative(m.at - now)}</span>
          </div>
          {attack && m.xp !== undefined && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs" data-testid="match-rewards">
              <span className="numeric font-semibold text-primary">+{formatInteger(m.xp)} XP</span>
              {m.chest ? (
                <span className="flex items-center gap-1">
                  <ChestBadge rank={m.chest} size="sm" className="size-6 rounded-md border" />
                  <span className="text-muted-foreground">{CHEST_NAME[m.chest]}</span>
                </span>
              ) : (
                <span className="text-muted-foreground">No chest</span>
              )}
            </div>
          )}
        </div>
        <Crowns value={m.crowns} signed className="shrink-0" />
      </div>
    </button>
  );
}

/**
 * The League page's matches (#786, in place of #647's defence log, revised by #783 then here): the shield's timer, then the latest
 * attacks and defences mixed, newest first, as cards one under the other, 20 at first and 20 more with each "Show more".
 */
export function MatchList({ matches, shieldEndsAt, shieldUnknown, now, error, errorDetail, onOpen, onRetry }: MatchListProps) {
  const [shown, setShown] = useState(MATCHES_PAGE);
  return (
    <section aria-labelledby="matches" className="flex flex-col gap-3">
      <h2 id="matches" className="font-semibold">
        Attacks and defences
      </h2>
      <ShieldCard endsAt={shieldEndsAt} now={now} unknown={shieldUnknown} />
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
            <Skeleton key={i} className="h-24 rounded-xl" />
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
              <MatchCard match={m} now={now} onOpen={onOpen} />
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
