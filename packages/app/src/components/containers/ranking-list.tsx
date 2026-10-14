import type { LeaderboardEntry } from "@paved/chain";
import { cn } from "../../lib/utils";
import { AnimatedList, AnimatedListItem } from "../ui/animated-list";
import { Skeleton } from "../ui/skeleton";
import { RankCells, rankRowClass } from "./top-three";

export interface RankingListProps {
  /** The page of rows (`Leaderboard.entries`), by rank. */
  entries: LeaderboardEntry[];
  /** The viewer's address: their row is outlined wherever it is. */
  viewerId?: string | null;
  /** The viewer's own row when it is not on the page (`/v1/tournaments/:day/entry/:player`): shown after the page. */
  viewer?: LeaderboardEntry | null;
  /** Players ranked that day: "20 of 41". */
  total: number;
  onSelectPlayer?: (playerId: string) => void;
  className?: string;
}

function Row({ entry, self, onSelectPlayer }: { entry: LeaderboardEntry; self: boolean; onSelectPlayer?: (playerId: string) => void }) {
  return (
    <AnimatedListItem>
      <button
        type="button"
        aria-current={self ? "true" : undefined}
        onClick={() => onSelectPlayer?.(entry.playerId)}
        className={cn(rankRowClass(self), "w-full cursor-pointer transition-colors outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring")}
      >
        <RankCells entry={entry} self={self} games />
      </button>
    </AnimatedListItem>
  );
}

/**
 * A day's ranking (`/v1/tournaments/:day/leaderboard`): one row per player, their best game, the viewer's outlined. Rows
 * enter with F3b's Animated List, so a day change or a refresh slides them to their new rank. A row opens the player's page.
 */
export function RankingList({ entries, viewerId, viewer, total, onSelectPlayer, className }: RankingListProps) {
  const offPage = viewer && !entries.some((e) => e.playerId === viewer.playerId);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <AnimatedList aria-label="Ranking" className="gap-1.5">
        {entries.map((e) => (
          <Row key={e.playerId} entry={e} self={e.playerId === viewerId} onSelectPlayer={onSelectPlayer} />
        ))}
      </AnimatedList>
      {offPage && (
        <>
          <span aria-hidden className="text-center text-xs leading-none text-muted-foreground">⋮</span>
          <AnimatedList aria-label="Your rank">
            <Row key={viewer.playerId} entry={viewer} self onSelectPlayer={onSelectPlayer} />
          </AnimatedList>
        </>
      )}
      <p className="text-center text-xs text-muted-foreground">
        <span className="numeric">{entries.length}</span> of <span className="numeric">{total}</span> players ranked
      </p>
    </div>
  );
}

/** The ranking while its first page loads: the rows' shape, no figure. */
export function RankingSkeleton({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading the ranking" className={cn("flex flex-col gap-1.5", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 rounded-lg" />
      ))}
    </div>
  );
}
