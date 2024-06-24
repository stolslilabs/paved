import { Table, TableBody, TableCell, TableRow } from "@/ui/elements/table";
import { useQueryParams } from "@/hooks/useQueryParams";
import { getColor } from "@/dojo/game";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFire, faHammer } from "@fortawesome/free-solid-svg-icons";
import { usePlayer } from "@/hooks/usePlayer";
import { useAccount } from "@starknet-react/core";
import { useBuilder } from "@/hooks/useBuilder";
import { useGame } from "@/hooks/useGame";
import { useDojo } from "@/dojo/useDojo";
import { Builder } from "@/dojo/game/models/builder";
import { Game } from "@/dojo/game/models/game";

export const Scoreboard = () => {
  const { gameId } = useQueryParams();
  const {
    account: { account },
  } = useDojo();

  const { game } = useGame({ gameId });
  const { builder } = useBuilder({ gameId, playerId: account?.address });

  if (!game || !builder) return;

  return (
    <div className="md:flex flex-col hidden text-primary-foreground">
      <p className="text-left text-sm mt-4 mb-2 ml-2">Leaderboard</p>
      <Table>
        <TableBody className="text-xs">
          <PlayerRow
            game={game}
            builder={builder}
            rank={1}
            score={game?.score || 0}
            built={game?.built || 0}
            discarded={game?.discarded || 0}
          />
        </TableBody>
      </Table>
    </div>
  );
};
export const PlayerRow = ({
  game,
  builder,
  rank,
  score,
  built,
  discarded,
}: {
  game: Game;
  builder: Builder;
  rank: number;
  score: number;
  built: number;
  discarded: number;
}) => {
  const { player } = usePlayer({
    playerId: builder.player_id,
  });

  const address = builder.player_id;
  const backgroundColor = getColor(address);

  return (
    <TableRow>
      <TableCell className="">{`#${rank}`}</TableCell>
      <TableCell>{player?.name}</TableCell>
      <TableCell>
        <div className="rounded-full w-4 h-4" style={{ backgroundColor }} />
      </TableCell>
      <TableCell className="flex text-right">
        <p>{score}</p>
        <FontAwesomeIcon className="mx-2" icon={faHammer} />
        <p>{`${built + 1}/${game.mode.count()}`}</p>
        <FontAwesomeIcon className="text-orange-500 mx-2" icon={faFire} />
        <p>{discarded}</p>
      </TableCell>
    </TableRow>
  );
};
