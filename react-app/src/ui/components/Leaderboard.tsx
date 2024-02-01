import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrophy } from "@fortawesome/free-solid-svg-icons";
import { useDojo } from "@/dojo/useDojo";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useEntityQuery, useComponentValue } from "@dojoengine/react";
import { shortString } from "starknet";
import { getOrder } from "@/utils";
import { Has, HasValue } from "@dojoengine/recs";

export const Leaderboard = () => {
  const { gameId } = useQueryParams();
  const {
    setup: {
      clientComponents: { Builder },
    },
  } = useDojo();

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

  const topPlayers = sortedBuilders.slice(0, 10);

  return (
    <Dialog>
      <DialogTrigger>
        <Button variant={"default"}>
          <FontAwesomeIcon icon={faTrophy} />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leaderboard</DialogTitle>
          <DialogDescription>
            <Table>
              <TableCaption>Top 10 players</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Rank</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topPlayers.map((builder, index) => {
                  return <Row key={index} builder={builder} rank={index + 1} />;
                })}
              </TableBody>
            </Table>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
};

export const Row = ({ builder, rank }: { builder: any; rank: number }) => {
  const name = shortString.decodeShortString(builder?.name || "");
  const order = getOrder(builder?.order);

  return (
    <TableRow>
      <TableCell className="font-medium">{rank}</TableCell>
      <TableCell>{name}</TableCell>
      <TableCell>{order}</TableCell>
      <TableCell className="text-right">{builder?.score}</TableCell>
    </TableRow>
  );
};
