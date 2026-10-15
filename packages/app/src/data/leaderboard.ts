import { useQuery, useQueries, queryOptions } from "@tanstack/react-query";
import type { IndexerClient, Leaderboard, LeaderboardEntry } from "@paved/chain";
import type { IndexerLagInfo } from "../components/scenes/leaderboard-scene";
import { queryKeys } from "./keys";
import { useDataSources } from "./sources";

// The leaderboard and player pages' reads (P8) that the scenes' hooks in `indexer.ts` do not cover: a day's pages, the
// first day, and how far behind the indexer is.

/** Rows per page of the leaderboard scene. */
export const BOARD_PAGE = 20;

/**
 * A leaderboard page as cached: the rows, and whether the indexer had ingested the day's end when it answered (its served
 * block at or after `endTime`). A day is final only then: a read made while the day was closing, or while the indexer was
 * behind, can lack the day's last blocks, so it must be read again (P2's review note).
 */
export interface LeaderboardRead {
  board: Leaderboard;
  closed: boolean;
}

/** The read of one page of a day, with the final-day rule for its freshness. */
export function leaderboardQuery(indexer: IndexerClient, day: number | null, limit: number, offset: number) {
  return queryOptions({
    queryKey: queryKeys.indexer.leaderboard(day ?? 0, limit, offset),
    queryFn: async (): Promise<LeaderboardRead> => {
      const answer = await indexer.leaderboard(day as number, { limit, offset });
      return { board: answer.data, closed: answer.head.timestamp >= answer.data.endTime };
    },
    enabled: day !== null,
    staleTime: (query) => (query.state.data?.closed ? Infinity : 0),
  });
}

export interface LeaderboardPages {
  /** The rows of the pages read so far, by rank; undefined until the first page. */
  entries: LeaderboardEntry[] | undefined;
  /** The day's first page (its window and total). */
  board: Leaderboard | undefined;
  hasMore: boolean;
  /** The next page is being read. */
  loadingMore: boolean;
  /** Pending only while nothing could be shown. */
  isPending: boolean;
  error: Error | null;
}

/** The first `pages` pages of a day, read page by page (each is cached under its own key). */
export function useLeaderboardPages(day: number | null, pages: number, limit = BOARD_PAGE): LeaderboardPages {
  const { indexer } = useDataSources();
  return useQueries({
    queries: Array.from({ length: pages }, (_, i) => leaderboardQuery(indexer, day, limit, i * limit)),
    combine: (results): LeaderboardPages => {
      const loaded = results.flatMap((r) => (r.data ? [r.data.board] : []));
      const first = loaded[0];
      const last = results[results.length - 1];
      const entries = first ? loaded.flatMap((b) => b.entries) : undefined;
      // A failed later page keeps the rows already read; the error is the page's only before any row.
      const error = results.find((r) => r.error)?.error ?? null;
      return {
        entries,
        board: first,
        hasMore: last?.data?.board.nextOffset != null,
        loadingMore: results.length > 1 && last?.data === undefined && !last?.error,
        isPending: day !== null && first === undefined && !error,
        error: first ? null : error,
      };
    },
  });
}

/** The first day the indexer has a tournament for (the day picker goes no earlier); null with none. */
export function useFirstDay() {
  const { indexer } = useDataSources();
  return useQuery({
    queryKey: ["indexer", "firstDay"] as const,
    queryFn: async (): Promise<number | null> => {
      let before: number | undefined;
      let first: number | null = null;
      // Newest first, 100 a page: the last page holds the oldest.
      for (;;) {
        const { data } = await indexer.tournaments({ limit: 100, before });
        for (const t of data.tournaments) first = first === null ? t.id : Math.min(first, t.id);
        if (data.next === null) return first;
        before = data.next;
      }
    },
  });
}

/** How current the indexer is, as the head answers it. */
export interface IndexerLagState {
  behind: number;
  /** More blocks behind than the client's `maxLag`: the rows are real but late. */
  late: boolean;
}

/** The indexer's lag (`/v1/head`): one read, refreshed on focus like the others. Undefined before the first answer. */
export function useIndexerLag() {
  const { indexer } = useDataSources();
  return useQuery({
    queryKey: ["indexer", "lag"] as const,
    queryFn: async (): Promise<IndexerLagState> => {
      const answer = await indexer.head();
      return { behind: answer.behind, late: answer.freshness.kind === "behind" };
    },
  });
}

/** The indexer's lag as the scene shows it; a failed refresh next to an earlier answer is marked stale. */
export function lagInfo(lag: { data?: IndexerLagState; error: Error | null }): IndexerLagInfo | null {
  return lag.data ? { ...lag.data, stale: lag.error?.message ?? null } : null;
}
