import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useDojo } from "@/dojo/useDojo";
import { useQueryParams } from "@/hooks/useQueryParams";
import { Entity } from "@dojoengine/recs";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useComponentValue } from "@dojoengine/react";
import { useMemo, useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClock,
  faFire,
  faHammer,
  faPiggyBank,
} from "@fortawesome/free-solid-svg-icons";
import { useLogs } from "@/hooks/useLogs";

export const GameInfo = () => {
  const { gameId } = useQueryParams();
  const { logs } = useLogs();
  const [timeLeft, setTimeLeft] = useState<number>();
  const {
    account: { account },
    setup: {
      clientComponents: { Game, Player, Builder },
    },
  } = useDojo();

  const gameKey = useMemo(
    () => getEntityIdFromKeys([BigInt(gameId)]) as Entity,
    [gameId]
  );
  const game = useComponentValue(Game, gameKey);

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

  if (!game || game.mode === 1) return null;

  return (
    <div className="flex flex-col">
      <p className="text-right text-sm text-slate-500 mt-4 mb-2 mr-2">Info</p>
      <Table>
        <TableBody className="text-right text-xs">
          {game?.mode !== 1 && (
            <Cooldown time={game?.duration ? `${timeLeft} s` : "∞"} />
          )}
          <TilesPaved
            count={logs.filter((log) => log.category === "Built").length}
          />
          <TilesDiscarded
            count={logs.filter((log) => log.category === "Discarded").length}
          />
          {game?.mode !== 1 && <Bank bank={builder ? player?.bank : "N/A"} />}
        </TableBody>
      </Table>
    </div>
  );
};

export const Cooldown = ({ time }: { time: string }) => {
  return (
    <TableRow>
      <TableCell className="lowercase">{time}</TableCell>
      <TableCell>:</TableCell>
      <TableCell>
        Countdown
        <FontAwesomeIcon className="text-lime-700 ml-2" icon={faClock} />
      </TableCell>
    </TableRow>
  );
};

export const TilesPaved = ({ count }: { count: number }) => {
  return (
    <TableRow>
      <TableCell>{count}</TableCell>
      <TableCell>:</TableCell>
      <TableCell>
        Tiles paved
        <FontAwesomeIcon className="text-slate-500 ml-2" icon={faHammer} />
      </TableCell>
    </TableRow>
  );
};

export const TilesDiscarded = ({ count }: { count: number }) => {
  return (
    <TableRow>
      <TableCell>{count}</TableCell>
      <TableCell>:</TableCell>
      <TableCell>
        Tiles discarded
        <FontAwesomeIcon className="text-orange-500 ml-2" icon={faFire} />
      </TableCell>
    </TableRow>
  );
};

export const Bank = ({ bank }: { bank: number }) => {
  return (
    <TableRow>
      <TableCell>{bank}</TableCell>
      <TableCell>:</TableCell>
      <TableCell>
        Bank
        <FontAwesomeIcon className="text-yellow-700 ml-2" icon={faPiggyBank} />
      </TableCell>
    </TableRow>
  );
};
