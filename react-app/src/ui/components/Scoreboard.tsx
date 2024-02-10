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
import { getColorFromAddress } from "@/utils";
import { Has, HasValue, Entity } from "@dojoengine/recs";
import { getEntityIdFromKeys } from "@dojoengine/utils";

export const Scoreboard = () => {
  const { gameId } = useQueryParams();
  const {
    account: { account },
    setup: {
      clientComponents: { Builder },
    },
  } = useDojo();

  const builderId = getEntityIdFromKeys([
    BigInt(gameId),
    BigInt(account.address),
  ]) as Entity;
  const builder = useComponentValue(Builder, builderId);

  const builderEntities = useEntityQuery([
    Has(Builder),
    HasValue(Builder, { game_id: gameId }),
  ]);

  const builders = builderEntities.map((entity) => {
    return useComponentValue(Builder, entity);
  });

  const sortedBuilders = builders.sort((a, b) => {
    return b?.score - a?.score;
  });

  const topPlayers = sortedBuilders.slice(0, 3);
  const builderRank = sortedBuilders.findIndex((b) => b?.id === builder?.id);

  return (
    <div className="flex flex-col">
      <TableCaption className="text-left mb-2 ml-2">Leaderboard</TableCaption>
      <Table>
        <TableBody className="text-xs">
          {topPlayers.map((player, index) => {
            return <PlayerRow key={index} builder={player} rank={index + 1} />;
          })}
          {builder && builderRank > 2 && (
            <>
              <TableRow>
                <TableCell />
              </TableRow>
              <PlayerRow builder={builder} rank={builderRank + 1} />
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
  const name = shortString.decodeShortString(builder?.name || "");
  const address = `0x${builder.id.toString(16)}`;
  const backgroundColor = getColorFromAddress(address);

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
