import type { IndexedPlayer, LeaderboardEntry, PlayerStats } from "@paved/chain";
import { cn } from "../../lib/utils";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Button } from "../ui/button";
import { PlayerName } from "../elements/player-name";
import { formatPoints } from "../elements/score";

/** The connected player as the home page reads them: indexer profile (the day belongs to Ranks, #538). */
export interface PlayerStatusData {
  player: IndexedPlayer;
  stats: PlayerStats;
  /** The viewer's row on today's leaderboard; null before their first finished game of the day. */
  today: LeaderboardEntry | null;
}

export interface PlayerStatusProps {
  /** Null: no wallet connected. */
  data: PlayerStatusData | null;
  onConnect?: () => void;
  connecting?: boolean;
  className?: string;
}

/** The player's status on Home: who, today's rank and best, the balances; or the connect call for a guest. */
export function PlayerStatus({ data, onConnect, connecting, className }: PlayerStatusProps) {
  if (!data) {
    return (
      <div data-slot="card" className={cn("flex items-center gap-3 rounded-xl border border-border bg-card p-4", className)}>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold">Playing as a guest</span>
          <span className="text-xs text-muted-foreground">Training is free. Connect to enter the Challenge.</span>
        </div>
        <Button size="sm" onClick={onConnect} loading={connecting}>Connect</Button>
      </div>
    );
  }
  const { player, stats } = data;
  const initial = (player.name ?? player.playerId.slice(2, 3)).slice(0, 1).toUpperCase();
  return (
    <div data-slot="card" className={cn("flex flex-col gap-4 rounded-xl border border-border bg-card p-4", className)}>
      <div className="flex items-center gap-3">
        <Avatar className="size-10">
          <AvatarFallback className="bg-gold-900 font-semibold text-gold-200">{initial}</AvatarFallback>
        </Avatar>
        {/* `w-0`: a long username is cut, never widens the card (WRAP360). */}
        <div className="flex w-0 min-w-0 flex-1 flex-col">
          <PlayerName name={player.name} address={player.playerId} className="text-sm font-semibold" />
          <span className="text-xs text-muted-foreground">
            {stats.challengeFinished} games · best {formatPoints(stats.bestScore)}
          </span>
        </div>
      </div>
    </div>
  );
}
