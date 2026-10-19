import type { IndexedGame, LeaderboardEntry, PlayerProfile } from "@paved/chain";
import type { Tab } from "../../routes/pages";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Amount } from "../elements/amount";
import { formatDay, DAY_S } from "../elements/day-picker";
import { PlayerName } from "../elements/player-name";
import { ShortAddress } from "../elements/short-address";
import { formatPoints } from "../elements/score";
import { StatRow } from "../elements/stat-row";
import { PlayerGames } from "../containers/player-games";
import { TabPage } from "../containers/tab-page";
import { LagNotice, type IndexerLagInfo } from "./leaderboard-scene";

export interface PlayerSceneProps {
  /** The id of the route (`/player/:id`): shown even when the indexer does not know it. */
  playerId: string;
  /** `/v1/players/:id`; null while it loads. `player` null: an id the indexer has never seen. */
  profile: PlayerProfile | null;
  /** Their row of today's leaderboard, when they have one. */
  today?: LeaderboardEntry | null;
  /** `/v1/players/:id/games`, newest first; null while it loads. */
  games: IndexedGame[] | null;
  /** The page is the viewer's own. */
  self?: boolean;
  /** How current the indexer is; left out until it answers. */
  lag?: IndexerLagInfo | null;
  /** The read failed: what the indexer said. */
  error?: string | null;
  /** That failure's detail for support (`InlineError`). */
  errorDetail?: ErrorDetail;
  onRetry?: () => void;
  onBack?: () => void;
  onNavigate?: (tab: Tab) => void;
}

/** A player's page (`/player/:id`, under Ranks): who, since when, today's rank, their Challenge record, their last games. */
export function PlayerScene(props: PlayerSceneProps) {
  const { playerId, profile, today, games, self } = props;
  const player = profile?.player;
  const stats = profile?.stats;
  const initial = (player?.name ?? playerId.slice(2, 3)).slice(0, 1).toUpperCase();
  return (
    <TabPage tab="ranks" title="Player" onBack={props.onBack} onNavigate={props.onNavigate}>
      <div data-slot="card" className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
        <Avatar className="size-12">
          <AvatarFallback className="bg-secondary text-lg font-semibold text-primary">{initial}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            {profile === null ? (
              <Skeleton className="h-5 w-32" />
            ) : (
              <PlayerName name={player?.name ?? null} address={playerId} className="min-w-0 font-display text-lg font-semibold" />
            )}
            {self && <Badge variant="secondary" className="shrink-0">You</Badge>}
          </span>
          <ShortAddress address={playerId} className="text-xs text-muted-foreground" />
          {player?.created != null && <span className="text-xs text-muted-foreground">Playing since {formatDay(Math.floor(player.created / DAY_S))}</span>}
        </div>
        {today && (
          <div className="flex flex-col items-end">
            <span className="text-xs text-muted-foreground">Today</span>
            <span className="numeric text-xl font-semibold text-primary">#{today.rank}</span>
          </div>
        )}
      </div>

      {props.error ? (
        <InlineError
          title="Could not load the player"
          message={props.error}
          detail={props.errorDetail}
          action={
            <Button size="sm" variant="outline" onClick={props.onRetry}>
              Retry
            </Button>
          }
        />
      ) : profile !== null && player === null ? (
        <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          The indexer has seen no game from this address yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 desktop:grid-cols-2 desktop:items-start">
          <section aria-label="Record" data-slot="card" className="rounded-xl border border-border bg-card px-4 py-2">
            {stats ? (
              <>
                <StatRow icon="trophy" label="Best score" value={stats.challengeFinished > 0 ? formatPoints(stats.bestScore) : "–"} tone="gold" />
                <StatRow icon="play" label="Challenge games" value={stats.challengeGames} hint={`${stats.challengeFinished} finished`} />
                {stats.paidGames != null && <StatRow icon="ticket" label="Paid games" value={stats.paidGames} hint={`${stats.settledGames ?? 0} settled`} />}
                {stats.rewards != null && <StatRow icon="coins" label="Rewards" value={<Amount value={BigInt(stats.rewards)} token="paved" />} tone="success" />}
              </>
            ) : (
              <div className="flex flex-col gap-3 py-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-6" />
                ))}
              </div>
            )}
          </section>
          <section aria-label="Last games" data-slot="card" className="rounded-xl border border-border bg-card px-4 py-2">
            <h2 className="pt-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Last games</h2>
            {games ? (
              <PlayerGames games={games} />
            ) : (
              <div className="flex flex-col gap-3 py-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-9" />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
      {props.lag && <LagNotice lag={props.lag} />}
    </TabPage>
  );
}
