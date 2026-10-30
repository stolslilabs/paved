import { cn } from "../../lib/utils";
import { leagueOf, type PvpPlayer } from "../../lib/pvp-rules";
import { Crowns } from "../elements/crowns";
import { LeagueCrest } from "../elements/league-crest";
import { PlayerAvatar } from "../elements/player-avatar";
import { PlayerName } from "../elements/player-name";

export interface PvpPlayerRowProps {
  player: PvpPlayer;
  className?: string;
}

/** A PvP player on one line (#647): the league's crest, their avatar (the look they saved, else their initial: #926), the name and the level, the crowns on the right. */
export function PvpPlayerRow({ player, className }: PvpPlayerRowProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <LeagueCrest league={leagueOf(player.crowns)} size="lg" iconOnly />
      <PlayerAvatar player={player} look={player.look} />
      <div className="flex min-w-0 flex-1 flex-col">
        <PlayerName name={player.name} address={player.address} className="font-semibold" />
        <span className="text-xs text-muted-foreground">
          Level <span className="numeric">{player.level}</span>
        </span>
      </div>
      <Crowns value={player.crowns} />
    </div>
  );
}
