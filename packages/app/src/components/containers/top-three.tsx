import type { LeaderboardEntry } from "@paved/chain";
import { cn } from "../../lib/utils";
import { Glyph } from "../elements/glyph";
import { PlayerName } from "../elements/player-name";
import { formatPoints } from "../elements/score";

const MEDAL = ["text-gold-300", "text-ink-200", "text-amber-400"] as const;

export interface TopThreeRowProps {
  entry: LeaderboardEntry;
  /** The viewer's own row: outlined in gold. */
  self?: boolean;
  className?: string;
}

/** One ranked player: the rank (a crown for the podium), the name or short address, the best score of the day. */
export function TopThreeRow({ entry, self, className }: TopThreeRowProps) {
  const podium = entry.rank <= 3;
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2",
        self ? "bg-accent ring-1 ring-gold-700" : "bg-secondary/60",
        className,
      )}
    >
      <span className={cn("grid w-6 place-items-center font-mono text-sm font-semibold tabular-nums", podium ? MEDAL[entry.rank - 1] : "text-muted-foreground")}>
        {podium ? (
          <>
            <Glyph name="crown" className="size-4" />
            <span className="sr-only">Rank {entry.rank}</span>
          </>
        ) : (
          entry.rank
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">
        <PlayerName name={entry.name} address={entry.playerId} />
        {self && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
      </span>
      <span className="font-mono text-sm font-semibold tabular-nums">{formatPoints(entry.bestScore)}</span>
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
