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
import { TwitterShareButton } from "react-share";
import { faXTwitter } from "@fortawesome/free-brands-svg-icons";
import { TOURNAMENT_TILE_CAP } from "@/utils/constants";

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
        const multiCondition =
          !over &&
          game.mode !== 1 &&
          game.duration !== 0 &&
          now >= game.start_time + game.duration;
        const soloCondition =
          !over && game.mode === 1 && game.tile_count > TOURNAMENT_TILE_CAP;
        if (multiCondition || soloCondition) {
          setOpen(true);
          setOver(true);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [game, over]);

  if (!game) return null;

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
        {over && <Description game={game} />}
        <Leaderboard />
        {over && game.mode !== 1 && builder && <Reward />}
      </DialogContent>
    </Dialog>
  );
};

export const Description = ({ game }: { game: any }) => {
  return (
    <DialogDescription className="flex justify-center items-center gap-3 text-xs">
      Game is over!
      {game.mode === 1 && <Share score={game.score} />}
    </DialogDescription>
  );
};

export const Reward = () => {
  return (
    <DialogDescription className="flex justify-center items-center gap-4 text-xs">
      Claim your rewards!
      <Claim />
    </DialogDescription>
  );
};

export const Share = ({ score }: { score: number }) => {
  return (
    <TwitterShareButton
      url="⚒️"
      title={`I just PAVED a way in @pavedgame’s first ever solo tournament

Score: ${score}

Play onchain and think you can do better? Join the tournament at https://www.paved.gg/ and #paveyourwaytovictory #onetileatatime`}
    >
      <Button
        className="flex gap-2 w-auto p-2 text-xs"
        variant={"default"}
        size={"icon"}
      >
        <FontAwesomeIcon icon={faXTwitter} />
        <p>Share</p>
      </Button>
    </TwitterShareButton>
  );
};

export const Leaderboard = () => {
  const { gameId } = useQueryParams();
  const [builders, setBuilders] = useState<{ [key: number]: typeof Builder }>(
    {}
  );
  const [topBuilders, setTopBuilders] = useState<any>([]);
  const { logs } = useLogs();
  const {
    setup: {
      world,
      clientComponents: { Builder },
    },
  } = useDojo();

  useMemo(() => {
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

    setTopBuilders(topSortedBuilders);
  }, [builders]);

  return (
    <Table className="text-xs">
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
