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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

import { useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrophy, faSun, faMoon } from "@fortawesome/free-solid-svg-icons";
import { useDojo } from "@/dojo/useDojo";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useEntityQuery, useComponentValue } from "@dojoengine/react";
import { shortString } from "starknet";
import { getOrder, getAlliance, getColorFromAddress } from "@/utils";
import { Has, HasValue } from "@dojoengine/recs";

export const Leaderboard = () => {
  const { gameId } = useQueryParams();
  const {
    setup: {
      clientComponents: { Builder, Team },
    },
  } = useDojo();

  const builderEntities = useEntityQuery([
    Has(Builder),
    HasValue(Builder, { game_id: gameId }),
  ]);

  const teamEntities = useEntityQuery([
    Has(Team),
    HasValue(Team, { game_id: gameId }),
  ]);

  const builders = builderEntities.map((entity) => {
    return useComponentValue(Builder, entity);
  });

  const teams = teamEntities.map((entity) => {
    return useComponentValue(Team, entity);
  });

  const sortedBuilders = builders.sort((a, b) => {
    return b?.score - a?.score;
  });

  const topPlayers = sortedBuilders.slice(0, 16);

  const topTeams = teams.sort((a, b) => {
    return b?.score - a?.score;
  });

  return (
    <Dialog>
      <DialogTrigger>
        <Button variant={"default"}>
          <FontAwesomeIcon icon={faTrophy} />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogDescription>
            <Tabs defaultValue="player" className="w-[400px] m-auto">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="player">Players</TabsTrigger>
                <TabsTrigger value="order">Orders</TabsTrigger>
              </TabsList>
              <TabsContent value="player">
                <Table>
                  <TableCaption>Top 16 players</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Rank</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Color</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topPlayers.map((builder, index) => {
                      return (
                        <PlayerRow
                          key={index}
                          builder={builder}
                          rank={index + 1}
                        />
                      );
                    })}
                  </TableBody>
                </Table>
              </TabsContent>
              <TabsContent value="order">
                <Table>
                  <TableCaption>Top orders</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Rank</TableHead>
                      <TableHead>Alliance</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topTeams.map((team, index) => {
                      return (
                        <OrderRow key={index} team={team} rank={index + 1} />
                      );
                    })}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
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
  const order = getOrder(builder?.order);
  const address = `0x${builder.id.toString(16)}`;
  const backgroundColor = getColorFromAddress(address);

  return (
    <TableRow>
      <TableCell className="font-medium">{rank}</TableCell>
      <TableCell>{name}</TableCell>
      <TableCell>
        <div className="rounded-full w-4 h-4" style={{ backgroundColor }} />
      </TableCell>
      <TableCell>{order}</TableCell>
      <TableCell className="text-right">{builder?.score}</TableCell>
    </TableRow>
  );
};

export const OrderRow = ({ team, rank }: { team: any; rank: number }) => {
  const order = getOrder(team.order);
  const alliance = getAlliance(team.order);

  return (
    <TableRow>
      <TableCell className="font-medium">{rank}</TableCell>
      <TableCell>
        <FontAwesomeIcon icon={alliance === "LIGHT" ? faSun : faMoon} />
      </TableCell>
      <TableCell>{order}</TableCell>
      <TableCell className="text-right">{team?.score}</TableCell>
    </TableRow>
  );
};
