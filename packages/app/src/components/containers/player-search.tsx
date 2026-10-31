import type { ReactNode } from "react";
import type { PublicProfile } from "../../data/social-source";
import { LEAGUES, leagueOf } from "../../lib/pvp-rules";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { LeagueCrest } from "../elements/league-crest";
import { PlayerAvatar } from "../elements/player-avatar";
import { PlayerName } from "../elements/player-name";
import { formatPoints } from "../elements/score";

export interface PlayerSearchProps {
  /** What the player typed. */
  query: string;
  onQueryChange?: (query: string) => void;
  /** The players found for the query; null while they are read. Ignored on an empty query. */
  results: readonly PublicProfile[] | null;
  error?: string | null;
  errorDetail?: ErrorDetail;
  onRetry?: () => void;
  /** Opens a player's public profile. */
  onOpen?: (address: string) => void;
  /** No social source on this network: the field is shown disabled, with why. */
  unavailable?: boolean;
  /** A result's action beside it (the follows' Follow, #954); none: the row only opens the profile. */
  renderAction?: (player: PublicProfile) => ReactNode;
  className?: string;
}

/** One player found: the avatar, the name, the level and the league; a tap opens their profile. Its action (Follow) beside it. */
export function PlayerResult({ player, onOpen, action }: { player: PublicProfile; onOpen?: (address: string) => void; action?: ReactNode }) {
  const league = LEAGUES[player.league] ?? leagueOf(player.crowns);
  const row = (
    <button
      type="button"
      data-slot="player-result"
      aria-label={`${player.name ?? player.address}, level ${formatPoints(player.level)}, ${league.name} league`}
      onClick={() => onOpen?.(player.address)}
      className={cn(
        "state-layer flex min-h-14 w-full min-w-0 items-center gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
        action ? "flex-[1_1_12rem] rounded-lg px-1 py-1" : "rounded-xl border border-border bg-card px-3 py-2",
      )}
    >
      <PlayerAvatar player={{ name: player.name, address: player.address }} look={player.look} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <PlayerName name={player.name} address={player.address} className="max-w-full min-w-0 truncate font-semibold" />
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>
            Level <span className="numeric">{formatPoints(player.level)}</span>
          </span>
          <LeagueCrest league={league} size="sm" />
        </span>
      </span>
      {!action && <Icon name="chevron-right" size="xs" className="shrink-0 text-muted-foreground" />}
    </button>
  );
  if (!action) return row;
  return (
    // The action goes under the player when the row is too narrow for both.
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-border bg-card p-1 pr-3">
      {row}
      <div className="ml-auto flex shrink-0 items-center pb-1 pl-1">{action}</div>
    </div>
  );
}

/**
 * The player search (#952): a field, and the players it finds by name (from the start of a word, whatever the case) or by
 * player ID, each opening their public profile. The follows (#954) and the guilds (#953) use it.
 */
export function PlayerSearch({ query, onQueryChange, results, error, errorDetail, onRetry, onOpen, unavailable, renderAction, className }: PlayerSearchProps) {
  const typed = query.trim() !== "";
  return (
    <section aria-label="Find a player" className={cn("flex flex-col gap-3", className)}>
      <label className="flex min-h-11 items-center gap-2 rounded-lg border border-input bg-secondary/60 px-3 focus-within:ring-2 focus-within:ring-ring">
        <Icon name="magnifying-glass" size="xs" className="shrink-0 text-muted-foreground" />
        <input
          type="search"
          aria-label="Name or player ID"
          placeholder="Name or player ID"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          value={query}
          disabled={unavailable}
          onChange={(e) => onQueryChange?.(e.target.value)}
          className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed [&::-webkit-search-cancel-button]:appearance-none"
        />
        {typed && !unavailable && (
          <Button size="icon" variant="ghost" className="-mr-3 shrink-0" aria-label="Clear the search" onClick={() => onQueryChange?.("")}>
            <Icon name="xmark" size="xs" />
          </Button>
        )}
      </label>
      {unavailable ? (
        <p className="text-sm text-muted-foreground">The player search is not on this network yet.</p>
      ) : !typed ? (
        <p className="text-sm text-muted-foreground">Search a name, or paste a player ID.</p>
      ) : (
        <>
          <InlineError
            title="Search"
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
          {results === null && !error && (
            <div aria-busy className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          )}
          {results?.length === 0 && !error && <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">No player found.</p>}
          {results && results.length > 0 && (
            <ul aria-label="Players found" className="flex flex-col gap-2">
              {results.map((p) => (
                <li key={p.address}>
                  <PlayerResult player={p} onOpen={onOpen} action={renderAction?.(p)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
