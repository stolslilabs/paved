import { useState, useEffect, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { useDojo } from "@/dojo/useDojo";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useComponentValue } from "@dojoengine/react";
import { shortString } from "starknet";
import { getColor } from "@/utils";
import {
  Entity,
  defineEnterSystem,
  defineSystem,
  Has,
  HasValue,
} from "@dojoengine/recs";
import { getEntityIdFromKeys } from "@dojoengine/utils";

export const Scoreboard = () => {
  const { gameId } = useQueryParams();
  const [builders, setBuilders] = useState<{ [key: number]: typeof Builder }>(
    {}
  );
  const [topBuilders, setTopBuilders] = useState<any>([]);
  const [rank, setRank] = useState<number>(0);
  const {
    account: { account },
    setup: {
      world,
      clientComponents: { Builder },
    },
  } = useDojo();
  const builderId = getEntityIdFromKeys([
    BigInt(gameId),
    BigInt(account.address),
  ]) as Entity;
  const builder = useComponentValue(Builder, builderId);

  useEffect(() => {
    defineEnterSystem(
      world,
      [Has(Builder), HasValue(Builder, { game_id: gameId })],
      function ({ value: [builder] }: any) {
        setBuilders((prevTiles: any) => {
          return { ...prevTiles, [builder.player_id]: builder };
        });
      }
    );
    defineSystem(
      world,
      [Has(Builder), HasValue(Builder, { game_id: gameId })],
      function ({ value: [builder] }: any) {
        setBuilders((prevTiles: any) => {
          return { ...prevTiles, [builder.player_id]: builder };
        });
      }
    );
  }, []);

  useEffect(() => {
    if (!builders) return;

    const topSortedBuilders: (typeof Builder)[] = Object.values(builders).sort(
      (a, b) => {
        return b?.score - a?.score;
      }
    );

    const builderRank = topSortedBuilders.findIndex(
      (b) => b?.player_id === builder?.player_id
    );

    setRank(builderRank + 1);
    setTopBuilders(topSortedBuilders.slice(0, 3));
  }, [builders, builder]);

  return (
    <div className="flex flex-col">
      <TableCaption className="text-left mb-2 ml-2">Leaderboard</TableCaption>
      <Table>
        <TableBody className="text-xs">
          {topBuilders.map((builder: typeof Builder, index: number) => {
            return <PlayerRow key={index} builder={builder} rank={index + 1} />;
          })}
          {builder && rank > 3 && (
            <>
              <TableRow>
                <TableCell />
              </TableRow>
              <PlayerRow builder={builder} rank={rank} />
            </>
          )}
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
  const {
    setup: {
      clientComponents: { Player },
    },
  } = useDojo();

  const playerKey = useMemo(
    () => getEntityIdFromKeys([builder.player_id]) as Entity,
    [builder]
  );
  const player = useComponentValue(Player, playerKey);

  const name = shortString.decodeShortString(player?.name || "");
  const address = `0x${builder.player_id.toString(16)}`;
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
