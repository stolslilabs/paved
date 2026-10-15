import type { LeaderboardEntry } from "@paved/chain";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Icon } from "../ui/icon";
import { PlayerName } from "../elements/player-name";
import { formatPoints } from "../elements/score";

const MEDAL = ["text-gold-300", "text-ink-200", "text-amber-400"] as const;

/**
 * The cells of one ranked player: the rank (a crown for the podium), the name or short address, the best score of the day.
 * `free`: that best game was a free one (P-61, `GameSpawned.price == 0`), marked "Free" and ranked like any other.
 */
export function RankCells({ entry, self, games, free }: { entry: LeaderboardEntry; self?: boolean; games?: boolean; free?: boolean }) {
  const podium = entry.rank <= 3;
  return (
    <>
      <span className={cn("numeric grid min-w-6 shrink-0 place-items-center text-sm font-semibold", podium ? MEDAL[entry.rank - 1] : "text-muted-foreground")}>
        {podium ? (
          <>
            <Icon name="crown" size="sm" />
            <span className="sr-only">Rank {entry.rank}</span>
          </>
        ) : (
          entry.rank
        )}
      </span>
      {/* The name is cut (its title holds it whole); "(you)" always shows. `w-0` keeps a long name out of the row's
          intrinsic width, so it cannot widen a card that sizes to its content. */}
      <span className="flex w-0 min-w-0 flex-1 items-baseline gap-1.5 text-left text-sm">
        <PlayerName name={entry.name} address={entry.playerId} className="min-w-0" />
        {self && <span className="shrink-0 text-xs text-muted-foreground">(you)</span>}
        {free && (
          <Badge variant="outline" className="shrink-0 self-center" title="Best game played with a free game">
            Free
          </Badge>
        )}
      </span>
      {games && (
        <span className="numeric hidden min-w-16 shrink-0 text-right text-xs whitespace-nowrap text-muted-foreground mobile:inline">
          {entry.gamesPlayed} {entry.gamesPlayed === 1 ? "game" : "games"}
        </span>
      )}
      <span className="numeric min-w-14 shrink-0 text-right text-sm font-semibold">{formatPoints(entry.bestScore)}</span>
    </>
  );
}

/** A ranked row's look: the viewer's own outlined in gold. */
export const rankRowClass = (self?: boolean) => cn("flex items-center gap-3 rounded-lg px-3 py-2", self ? "bg-accent ring-1 ring-gold-700" : "bg-secondary/60");

export interface TopThreeRowProps {
  entry: LeaderboardEntry;
  /** The viewer's own row: outlined in gold. */
  self?: boolean;
  className?: string;
}

/** One ranked player of the podium list. */
export function TopThreeRow({ entry, self, className }: TopThreeRowProps) {
  return (
    <li className={cn(rankRowClass(self), className)}>
      <RankCells entry={entry} self={self} />
    </li>
  );
}

export interface TopThreeProps {
  entries: LeaderboardEntry[];
  /** The viewer's row when they are not on the podium. */
  viewer?: LeaderboardEntry | null;
  className?: string;
}

/** Today's Challenge top 3 (`/v1/tournaments/:day/leaderboard`), then the viewer's own rank if lower. */
export function TopThree({ entries, viewer, className }: TopThreeProps) {
  const podium = entries.slice(0, 3);
  if (podium.length === 0) {
    return <p className={cn("rounded-lg bg-secondary/60 px-3 py-3 text-sm text-muted-foreground", className)}>No finished game today yet. The first score takes the crown.</p>;
  }
  const showViewer = viewer && !podium.some((e) => e.playerId === viewer.playerId);
  return (
    <ol className={cn("flex flex-col gap-1.5", className)} aria-label="Today's top 3">
      {podium.map((e) => (
        <TopThreeRow key={e.playerId} entry={e} self={viewer?.playerId === e.playerId} />
      ))}
      {showViewer && <TopThreeRow entry={viewer} self className="mt-1" />}
    </ol>
  );
}
