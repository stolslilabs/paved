import { useState } from "react";
import { useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { errorDetail } from "../error-detail";
import { LeaderboardScene } from "../../components/scenes/leaderboard-scene";
import { useCurrentDay } from "../../data/chain";
import { freePlayers } from "../../data/free";
import { useLeaderboardEntry } from "../../data/indexer";
import { lagInfo, useFirstDay, useIndexerLag, useLeaderboardPages } from "../../data/leaderboard";
import { queryKeys } from "../../data/keys";
import { useAccount } from "../../wallet/wallet";
import { useNow } from "../now";
import { useAppNavigate, useTabNavigate } from "../ref";

const DAY_S = 86_400;

/** `/leaderboard/:day?` with a day number; anything else is today. */
const dayParam = (raw: string | undefined): number | null => (raw !== undefined && /^\d{1,12}$/.test(raw) ? Number(raw) : null);

/**
 * `/leaderboard/:day?` (P8): a UTC day's Challenge ranking from the indexer, 20 rows a page ("Show more" reads the next),
 * today by the chain's day (the browser's clock until it answers). The connected player's row is outlined, and read apart
 * when it is not on the pages read. A row opens `/player/:id`. A closed day is read once the indexer has ingested its end
 * (`leaderboardQuery`); the lag of the indexer is shown under the rows.
 */
export default function Page() {
  const params = useParams();
  const go = useAppNavigate();
  const onNavigate = useTabNavigate();
  const now = useNow();
  const client = useQueryClient();
  const viewerId = useAccount().address;
  const chainDay = useCurrentDay();
  const today = chainDay.data ?? Math.floor(now / DAY_S);
  const asked = dayParam(params.day);
  const day = asked !== null && asked <= today ? asked : today;
  // Pages are counted per day: another day starts again at the first.
  const [paging, setPaging] = useState({ day, pages: 1 });
  const pages = paging.day === day ? paging.pages : 1;
  // The day is known once the chain answered (or failed): reading the clock's day first could show the wrong one.
  const board = useLeaderboardPages(chainDay.isPending ? null : day, pages);
  const viewer = useLeaderboardEntry(chainDay.isPending ? null : day, viewerId);
  const firstDay = useFirstDay();
  const lag = useIndexerLag();
  const retry = () => void client.invalidateQueries({ queryKey: queryKeys.indexer.all });

  return (
    <LeaderboardScene
      day={day}
      today={today}
      firstDay={Math.min(firstDay.data ?? today, day)}
      leaderboard={board.board ? { ...board.board, entries: board.entries ?? [] } : null}
      viewerId={viewerId}
      viewer={viewer.data ?? null}
      free={[...freePlayers(board.entries ?? []), ...(viewer.data ? freePlayers([viewer.data]) : [])]}
      error={board.error?.message ?? null}
      moreError={board.moreError?.message ?? null}
      errorDetail={board.error ? errorDetail(board.error) : undefined}
      moreErrorDetail={board.moreError ? errorDetail(board.moreError) : undefined}
      now={now}
      lag={lagInfo(lag)}
      hasMore={board.hasMore}
      loadingMore={board.loadingMore}
      onMore={() => setPaging({ day, pages: pages + 1 })}
      onDayChange={(d) => go(d === today ? "/leaderboard" : `/leaderboard/${d}`)}
      onSelectPlayer={(id) => go(`/player/${id}`)}
      onRetry={retry}
      onNavigate={onNavigate}
    />
  );
}
