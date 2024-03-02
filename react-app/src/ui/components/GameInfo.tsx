import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { useDojo } from "@/dojo/useDojo";
import { useQueryParams } from "@/hooks/useQueryParams";
import { Entity } from "@dojoengine/recs";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useComponentValue } from "@dojoengine/react";
import { useMemo, useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClock,
  faHammer,
  faPiggyBank,
} from "@fortawesome/free-solid-svg-icons";

export const GameInfo = () => {
  const { gameId } = useQueryParams();
  const [timeLeft, setTimeLeft] = useState<number>();
  const {
    account: { account },
    setup: {
      clientComponents: { Game, Player, Builder },
    },
  } = useDojo();

  const gameEntity = getEntityIdFromKeys([BigInt(gameId)]) as Entity;
  const game = useComponentValue(Game, gameEntity);

  const playerKey = useMemo(
    () => getEntityIdFromKeys([BigInt(account.address)]) as Entity,
    [account]
  );
  const player = useComponentValue(Player, playerKey);
  const builderKey = useMemo(
    () =>
      getEntityIdFromKeys([BigInt(gameId), BigInt(account.address)]) as Entity,
    [gameId, account]
  );
  const builder = useComponentValue(Builder, builderKey);

  useEffect(() => {
    if (game) {
      const interval = setInterval(() => {
        const dt =
          game.start_time + game.duration - Math.floor(Date.now() / 1000);
        setTimeLeft(Math.max(0, dt));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [game]);

  return (
    <div className="flex flex-col">
      <p className="text-right text-sm text-slate-500 mt-4 mb-2 mr-2">Info</p>
      <Table>
        <TableBody className="text-right text-xs">
          <TableRow>
            <TableCell className="lowercase">
              {game?.duration ? `${timeLeft} s` : "∞"}
            </TableCell>
            <TableCell>:</TableCell>
            <TableCell>
              Countdown
              <FontAwesomeIcon className="text-lime-700 ml-2" icon={faClock} />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>{game?.tile_count}</TableCell>
            <TableCell>:</TableCell>
            <TableCell>
              Tiles paved
              <FontAwesomeIcon className="text-teal-700 ml-2" icon={faHammer} />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>{builder ? player?.bank : "N/A"}</TableCell>
            <TableCell>:</TableCell>
            <TableCell>
              Tiles left
              <FontAwesomeIcon
                className="text-yellow-700 ml-2"
                icon={faPiggyBank}
              />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
};
