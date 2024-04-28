import { Table, TableBody, TableCell, TableRow } from "@/ui/elements/table";
import { useQueryParams } from "@/hooks/useQueryParams";
import { getColor } from "@/dojo/game";
import { useLogs } from "@/hooks/useLogs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFire, faHammer } from "@fortawesome/free-solid-svg-icons";
import { usePlayer } from "@/hooks/usePlayer";
import { useAccount } from "@starknet-react/core";
import { useBuilder } from "@/hooks/useBuilder";
import { useGame } from "@/hooks/useGame";

export const Scoreboard = () => {
  const { gameId } = useQueryParams();
  const { logs } = useLogs();
  const { account } = useAccount();

  const { game } = useGame({ gameId });
  const { builder } = useBuilder({ gameId, playerId: account?.address });

  if (!game || !builder) return;

  return (
    <div className="md:flex flex-col hidden">
      <p className="text-left text-sm mt-4 mb-2 ml-2">Leaderboard</p>
      <Table>
        <TableBody className="text-xs">
          <PlayerRow
            builder={builder}
            rank={1}
            score={game?.score || 0}
            builts={logs.filter((log) => log.category === "Built")}
            discardeds={logs.filter((log) => log.category === "Discarded")}
          />
        </TableBody>
      </Table>
    </div>
  );
};
export const PlayerRow = ({
  builder,
  rank,
  score,
  builts,
  discardeds,
}: {
  builder: any;
  rank: number;
  score: number;
  builts: any;
  discardeds: any;
}) => {
  const { player } = usePlayer({
    playerId: `0x${builder.player_id.toString(16)}`,
  });

  const address = `0x${builder.player_id.toString(16)}`;
  const backgroundColor = getColor(address);

  // Color is used to filter on builder since we don't have the player id in the event
  const paved = builts.filter(
    (log: any) => log.color === backgroundColor
  ).length;
  const discarded = discardeds.filter(
    (log: any) => log.color === backgroundColor
  ).length;
  return (
    <TableRow>
      <TableCell className="font-medium">{`#${rank}`}</TableCell>
      <TableCell>{player?.name}</TableCell>
      <TableCell>
        <div className="rounded-full w-4 h-4" style={{ backgroundColor }} />
      </TableCell>
      <TableCell className="flex text-right">
        <p>{score}</p>
        <FontAwesomeIcon className="mx-2" icon={faHammer} />
        <p>{`${paved}/71`}</p>
        <FontAwesomeIcon className="text-orange-500 mx-2" icon={faFire} />
        <p>{discarded}</p>
      </TableCell>
    </TableRow>
  );
};
