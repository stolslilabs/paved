import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { useDojo } from "@/dojo/useDojo";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useEntityQuery, useComponentValue } from "@dojoengine/react";
import { shortString } from "starknet";
import { getColor } from "@/utils";
import { Has, HasValue, Entity } from "@dojoengine/recs";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useMemo, useState, useEffect } from "react";

export const GameInfo = () => {
  const { gameId } = useQueryParams();
  const [timeLeft, setTimeLeft] = useState<number>();
  const {
    setup: {
      clientComponents: { Game },
    },
  } = useDojo();

  const gameEntity = getEntityIdFromKeys([BigInt(gameId)]) as Entity;
  const game = useComponentValue(Game, gameEntity);

  const tileLeft = useMemo(() => {
    return game?.tiles_cap - game?.tile_count;
  }, [game]);

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
      <TableCaption className="text-right mb-2 mr-2">Info</TableCaption>
      <Table>
        <TableBody className="text-right text-xs">
          <TableRow>
            <TableCell className="lowercase">
              {game?.duration ? `${timeLeft} s` : "∞"}
            </TableCell>
            <TableCell>:</TableCell>
            <TableCell>Countdown</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>{game?.tile_count}</TableCell>
            <TableCell>:</TableCell>
            <TableCell>Tile count</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
};

export const PlayerRow = ({
  builder,
  rank,
}: {
  builder: any;
  rank: number;
}) => {
  const name = shortString.decodeShortString(builder?.name || "");
  const address = `0x${builder.id.toString(16)}`;
  const backgroundColor = getColor(address);

  return (
    <TableRow>
      <TableCell className="font-medium">{`#${rank}`}</TableCell>
      <TableCell>{name}</TableCell>
      <TableCell>
        <div className="rounded-full w-4 h-4" style={{ backgroundColor }} />
      </TableCell>
      <TableCell className="text-right">{builder?.score}</TableCell>
    </TableRow>
  );
};
