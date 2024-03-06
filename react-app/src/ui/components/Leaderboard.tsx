import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

import { useState, useEffect, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrophy } from "@fortawesome/free-solid-svg-icons";
import { useDojo } from "@/dojo/useDojo";
import { useQueryParams } from "@/hooks/useQueryParams";
import { shortString } from "starknet";
import { useComponentValue } from "@dojoengine/react";
import { Entity } from "@dojoengine/recs";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { getOrder, getColor } from "@/utils";
import {
  defineEnterSystem,
  defineSystem,
  Has,
  HasValue,
} from "@dojoengine/recs";
import { useLogs } from "@/hooks/useLogs";
import { Claim } from "./Claim";

export const LeaderboardDialog = () => {
  const { gameId } = useQueryParams();
  const {
    account: { account },
    setup: {
      clientComponents: { Game, Builder },
    },
  } = useDojo();

  const gameEntity = useMemo(
    () => getEntityIdFromKeys([BigInt(gameId)]) as Entity,
    [gameId]
  );
  const game = useComponentValue(Game, gameEntity);

  const builderId = getEntityIdFromKeys([
    BigInt(gameId),
    BigInt(account.address),
  ]) as Entity;
  const builder = useComponentValue(Builder, builderId);

  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (game) {
      const interval = setInterval(() => {
        const now = Math.floor(Date.now()) / 1000;
        if (
          !over &&
          game.duration !== 0 &&
          now >= game.start_time + game.duration
        ) {
          setOpen(true);
          setOver(true);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [game, over]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={"command"} size={"command"}>
                <FontAwesomeIcon className="h-12" icon={faTrophy} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="select-none">Leaderboard</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader className="flex items-center">Leaderboard</DialogHeader>
        {over && <Description claimable={!!builder} />}
        <Leaderboard />
      </DialogContent>
    </Dialog>
  );
};

export const Description = ({ claimable }: { claimable: boolean }) => {
  return claimable ? (
    <DialogDescription className="flex justify-center items-center gap-4 text-xs">
      Game is over, claim your rewards!
      <Claim />
    </DialogDescription>
  ) : (
    <DialogDescription className="flex justify-center items-center gap-3 text-xs">
      Game is over
    </DialogDescription>
  );
};

export const Leaderboard = () => {
  const { gameId } = useQueryParams();
  const [builders, setBuilders] = useState<{ [key: number]: typeof Builder }>(
    {}
  );
  const [teams, setTeams] = useState<{ [key: number]: typeof Team }>({});
  const [topBuilders, setTopBuilders] = useState<any>([]);
  const [topTeams, setTopTeams] = useState<any>([]);
  const { logs } = useLogs();
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
    <Tabs defaultValue="player" className="w-full m-auto">
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
              <TableHead className="text-right">Paved</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topBuilders.map((builder: typeof Builder, index: number) => {
              return (
                <PlayerRow
                  key={index}
                  builder={builder}
                  rank={index + 1}
                  logs={logs.filter((log) => log.category === "Built")}
                />
              );
            })}
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
              return <OrderRow key={index} team={team} rank={index + 1} />;
            })}
          </TableBody>
        </Table>
      </TabsContent>
    </Tabs>
  );
};

export const PlayerRow = ({
  builder,
  rank,
  logs,
}: {
  builder: any;
  rank: number;
  logs: any;
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
  const backgroundColor = getColor(address);
  const paved = logs.filter((log: any) => log.color === backgroundColor).length;
  return (
    <TableRow>
      <TableCell className="font-medium">{rank}</TableCell>
      <TableCell className="flex gap-2 text-ellipsis">
        <div className="rounded-full w-4 h-4" style={{ backgroundColor }} />
        {name}
      </TableCell>
      <TableCell>{order}</TableCell>
      <TableCell className="text-right">{builder?.score}</TableCell>
      <TableCell className="text-right">{paved}</TableCell>
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
