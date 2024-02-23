import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
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

import { useState, useEffect, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrophy, faSun, faMoon } from "@fortawesome/free-solid-svg-icons";
import { useDojo } from "@/dojo/useDojo";
import { useQueryParams } from "@/hooks/useQueryParams";
import { shortString } from "starknet";
import { useComponentValue } from "@dojoengine/react";
import { Entity } from "@dojoengine/recs";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { getOrder, getAlliance, getColorFromAddress } from "@/utils";
import {
  defineEnterSystem,
  defineSystem,
  Has,
  HasValue,
} from "@dojoengine/recs";

export const Leaderboard = ({ show }: { show: boolean }) => {
  const { gameId } = useQueryParams();
  const [builders, setBuilders] = useState<{ [key: number]: typeof Builder }>(
    {}
  );
  const [teams, setTeams] = useState<{ [key: number]: typeof Team }>({});
  const [topBuilders, setTopBuilders] = useState<any>([]);
  const [topTeams, setTopTeams] = useState<any>([]);
  const {
    setup: {
      world,
      clientComponents: { Builder, Team },
    },
  } = useDojo();

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
    defineEnterSystem(
      world,
      [Has(Team), HasValue(Team, { game_id: gameId })],
      function ({ value: [team] }: any) {
        setTeams((prevTiles: any) => {
          return { ...prevTiles, [team.order]: team };
        });
      }
    );
    defineSystem(
      world,
      [Has(Team), HasValue(Team, { game_id: gameId })],
      function ({ value: [team] }: any) {
        setTeams((prevTiles: any) => {
          return { ...prevTiles, [team.order]: team };
        });
      }
    );
  }, []);

  useEffect(() => {
    if (!builders) return;

    const topSortedBuilders: (typeof Builder)[] = Object.values(builders)
      .sort((a, b) => {
        return b?.score - a?.score;
      })
      .slice(0, 16);

    setTopBuilders(topSortedBuilders);
  }, [builders]);

  useEffect(() => {
    if (!teams) return;

    const topSortedTeams: (typeof Team)[] = Object.values(teams).sort(
      (a, b) => {
        return b?.score - a?.score;
      }
    );

    setTopTeams(topSortedTeams);
  }, [teams]);

  return (
    <Dialog>
      <DialogTrigger>
        <Button
          className={`${
            show ? "opacity-100" : "opacity-0 -mb-16"
          } transition-all duration-200`}
          variant={"default"}
          size={"icon"}
        >
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
                <Table className="text-xs">
                  <TableCaption>Top 16 players</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Rank</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topBuilders.map(
                      (builder: typeof Builder, index: number) => {
                        return (
                          <PlayerRow
                            key={index}
                            builder={builder}
                            rank={index + 1}
                          />
                        );
                      }
                    )}
                  </TableBody>
                </Table>
              </TabsContent>
              <TabsContent value="order">
                <Table className="text-xs">
                  <TableCaption>Top orders</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Rank</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topTeams.map((team: typeof Team, index: number) => {
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
  const {
    account: { account },
    setup: {
      clientComponents: { Player },
    },
  } = useDojo();
  const playerKey = useMemo(
    () => getEntityIdFromKeys([BigInt(builder.player_id)]) as Entity,
    [account]
  );
  const player = useComponentValue(Player, playerKey);

  const name = shortString.decodeShortString(player?.name || "");
  const order = getOrder(builder?.order);
  const address = `0x${builder.player_id.toString(16)}`;
  const backgroundColor = getColorFromAddress(address);
  return (
    <TableRow>
      <TableCell className="font-medium">{rank}</TableCell>
      <TableCell className="flex gap-2">
        <div className="rounded-full w-4 h-4" style={{ backgroundColor }} />
        {name}
      </TableCell>
      <TableCell>{order}</TableCell>
      <TableCell className="text-right">{builder?.score}</TableCell>
    </TableRow>
  );
};

export const OrderRow = ({ team, rank }: { team: any; rank: number }) => {
  const order = getOrder(team.order);
  return (
    <TableRow>
      <TableCell className="font-medium">{rank}</TableCell>
      <TableCell>{order}</TableCell>
      <TableCell className="text-right">{team?.score}</TableCell>
    </TableRow>
  );
};
