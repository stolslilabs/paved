import type { Leaderboard, LeaderboardEntry } from "@paved/chain";
import type { Tab } from "../../routes/pages";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Countdown } from "../elements/countdown";
import { DayPicker } from "../elements/day-picker";
import { Notice } from "../elements/notice";
import { formatPoints } from "../elements/score";
import { RankingList, RankingSkeleton } from "../containers/ranking-list";
import { TabPage } from "../containers/tab-page";

export interface LeaderboardSceneProps {
  /** The day shown (`/leaderboard/:day?`; today when omitted). */
  day: number;
  today: number;
  /** The indexer's first tournament: the picker goes no earlier. */
  firstDay: number;
  /** The day's first page (`/v1/tournaments/:day/leaderboard`); null while it loads or after an error. */
  leaderboard: Leaderboard | null;
  /** The viewer's address; null for a guest. */
  viewerId: string | null;
  /** The viewer's row of that day when it is not on the page (`/v1/tournaments/:day/entry/:player`). */
  viewer?: LeaderboardEntry | null;
  /** The read failed: what the indexer said. */
  error?: string | null;
  /** The players whose best game of the day was free (P-61: ranked like any other, marked "Free", PM ruling). */
  free?: readonly string[];
  now: number;
  onDayChange?: (day: number) => void;
  onSelectPlayer?: (playerId: string) => void;
  onRetry?: () => void;
  onNavigate?: (tab: Tab) => void;
}

function Summary({ board, open, now }: { board: Leaderboard; open: boolean; now: number }) {
  const best = board.entries[0]?.bestScore;
  return (
    // Three figures from 360 px; under it (320) the countdown takes its own row, a third being narrower than its figure (WRAP360).
    <div data-slot="card" className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 mobile:grid-cols-3 desktop:grid-cols-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] text-muted-foreground">Players</span>
        <span className="numeric text-lg font-semibold">{board.total}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] text-muted-foreground">Best</span>
        <span className="numeric text-lg font-semibold text-primary">{best == null ? "–" : formatPoints(best)}</span>
      </div>
      {/* The caption names the countdown: its own label is hidden (its timer keeps the sentence); in the 16 rem side card (from `desktop`) it takes the whole row. */}
      <div className="col-span-2 flex flex-col items-start gap-1 mobile:col-span-1 desktop:col-span-2">
        <span className="text-[11px] text-muted-foreground">{open ? "Closes in" : "Day"}</span>
        {open ? (
          <Countdown expiresAt={board.endTime} now={now} label="Closes in" hideLabel className="text-sm text-foreground" />
        ) : (
          <Badge variant="secondary">
            <Icon name="lock" size="xs" />
            Closed
          </Badge>
        )}
      </div>
    </div>
  );
}

/**
 * The leaderboard (`/leaderboard/:day?`, Ranks): a UTC day's Challenge ranking with the day picker, the viewer's row
 * outlined (or read apart and shown after the page when they are lower); today counts down to its close, a past day is
 * final. A row opens the player's page.
 */
export function LeaderboardScene(props: LeaderboardSceneProps) {
  const { day, today, leaderboard, viewerId, error, now } = props;
  const open = day === today;
  return (
    <TabPage
      tab="ranks"
      title="Leaderboard"
      subtitle="Challenge · best game of each player, per UTC day"
      onNavigate={props.onNavigate}
      end={<DayPicker day={day} today={today} first={props.firstDay} onChange={props.onDayChange} className="w-full tablet:w-auto" />}
    >
      {error ? (
        <Notice
          tone="danger"
          title="Could not load the ranking"
          action={
            <Button size="sm" variant="outline" onClick={props.onRetry}>
              Retry
            </Button>
          }
        >
          {error}
        </Notice>
      ) : leaderboard === null ? (
        <RankingSkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-4 desktop:grid-cols-[minmax(0,1fr)_16rem] desktop:items-start">
          <div className="flex flex-col gap-3 desktop:order-2">
            <Summary board={leaderboard} open={open} now={now} />
            {!open && leaderboard.total > 0 && (
              <p className="text-xs text-muted-foreground">This day is closed: its ranking is final and its games are settled against its mean.</p>
            )}
          </div>
          {leaderboard.entries.length === 0 ? (
            <div data-slot="card" className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-10 text-center">
              <Icon name="ranking-star" size="xl" className="text-muted-foreground" />
              <p className="text-sm font-semibold">{open ? "No finished game today yet" : "Nobody finished a game this day"}</p>
              <p className="text-xs text-muted-foreground">{open ? "The first score takes the crown." : "Pick another day."}</p>
            </div>
          ) : (
            <RankingList
              key={day}
              entries={leaderboard.entries}
              total={leaderboard.total}
              viewerId={viewerId}
              viewer={props.viewer}
              free={props.free}
              onSelectPlayer={props.onSelectPlayer}
            />
          )}
        </div>
      )}
    </TabPage>
  );
}
