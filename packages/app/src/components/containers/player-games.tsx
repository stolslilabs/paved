import type { IndexedGame } from "@paved/chain";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Amount } from "../elements/amount";
import { formatDay } from "../elements/day-picker";
import { formatPoints } from "../elements/score";

export interface PlayerGamesProps {
  /** The player's games, newest first (`/v1/players/:id/games`). */
  games: IndexedGame[];
  className?: string;
}

/** What a game's terms came to: the reward minted, settled at 0, or not settled yet. */
function Outcome({ game }: { game: IndexedGame }) {
  const e = game.economy;
  if (!game.over) return <Badge variant="info">In progress</Badge>;
  if (!e) return null;
  if (e.expired) return <span className="text-xs text-muted-foreground">Expired</span>;
  if (!e.settled) return <span className="text-xs text-muted-foreground">Awaiting the day</span>;
  return e.reward && BigInt(e.reward) > 0n ? (
    <Amount value={BigInt(e.reward)} token="paved" className="text-xs text-success" />
  ) : (
    <span className="text-xs text-muted-foreground">Below the threshold</span>
  );
}

/** A player's last Challenge games: the day, the stake, the score, and what it paid. */
export function PlayerGames({ games, className }: PlayerGamesProps) {
  if (games.length === 0) {
    return <p className={cn("rounded-lg bg-secondary/60 px-3 py-3 text-sm text-muted-foreground", className)}>No Challenge game yet.</p>;
  }
  return (
    <ul aria-label="Games" className={cn("flex flex-col divide-y divide-border", className)}>
      {games.map((g) => (
        <li key={g.gameId} className="flex items-center gap-3 py-2.5">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm">
              Challenge <span className="numeric text-muted-foreground">#{g.gameId}</span>
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDay(g.dayId)}
              {g.economy && (
                <>
                  {" · stake "}
                  <span className="numeric">{g.economy.stake}</span>
                </>
              )}
            </span>
          </span>
          <span className="flex flex-col items-end gap-0.5">
            {g.over && <span className="numeric text-sm font-semibold">{formatPoints(g.score)}</span>}
            <Outcome game={g} />
          </span>
        </li>
      ))}
    </ul>
  );
}
