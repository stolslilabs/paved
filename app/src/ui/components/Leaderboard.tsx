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
import { Button } from "@/components/ui/button";

import { useState, useEffect, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrophy } from "@fortawesome/free-solid-svg-icons";
import { useQueryParams } from "@/hooks/useQueryParams";
import { getColor } from "@/dojo/game";
import { TwitterShareButton } from "react-share";
import { faXTwitter } from "@fortawesome/free-brands-svg-icons";
import { useGame } from "@/hooks/useGame";
import { useBuilder } from "@/hooks/useBuilder";
import { usePlayer } from "@/hooks/usePlayer";
import { Game as GameClass } from "@/dojo/game/models/game";
import { useAccount } from "@starknet-react/core";

export const LeaderboardDialog = () => {
  const { gameId } = useQueryParams();
  const { account } = useAccount();

  const { game } = useGame({ gameId });
  const { builder } = useBuilder({
    gameId: gameId,
    playerId: account?.address,
  });

  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (game) {
      const interval = setInterval(() => {
        if (!over && game.isOver()) {
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
                <FontAwesomeIcon className="sm:h-4 md:h-12" icon={faTrophy} />
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
        {over && builder && <Description game={game} />}
        <Leaderboard />
      </DialogContent>
    </Dialog>
  );
};

export const Description = ({ game }: { game: GameClass }) => {
  return (
    <DialogDescription className="flex justify-center items-center gap-3 text-xs">
      Game is over!
      <Share score={game.score} />
    </DialogDescription>
  );
};

export const Share = ({ score }: { score: number }) => {
  return (
    <TwitterShareButton
      url="https://paved.gg/"
      title={`I just test played @pavedgame’s solo mode 👑

Score: ${score}

Join the fun at https://paved.gg/ and #paveyourwaytovictory in an onchain strategy game like no other ⚒️ 

#gaming #onetileatatime

Play now 👇
`}
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
  const { game } = useGame({ gameId });

  return (
    <Table className="text-xs">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px]">Rank</TableHead>
          <TableHead className="w-[100px]">Score</TableHead>
          <TableHead>Name</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <PlayerRow rank={1} score={game?.score || 0} />
      </TableBody>
    </Table>
  );
};

export const PlayerRow = ({ rank, score }: { rank: number; score: number }) => {
  const { account } = useAccount();
  const { player } = usePlayer({ playerId: account?.address });
  const name = player?.name || "";
  const backgroundColor = useMemo(
    () => getColor(`${account?.address}`),
    [account],
  );

  return (
    <TableRow>
      <TableCell className="font-medium">{rank}</TableCell>
      <TableCell>{score}</TableCell>
      <TableCell className="flex gap-2 text-ellipsis">
        <div className="rounded-full w-4 h-4" style={{ backgroundColor }} />
        {name}
      </TableCell>
    </TableRow>
  );
};
