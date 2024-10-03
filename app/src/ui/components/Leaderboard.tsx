import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTrigger,
} from "@/ui/elements/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/elements/table";

import { useMemo, ReactNode } from "react";
import { useQueryParams } from "@/hooks/useQueryParams";
import { getColor } from "@/dojo/game";
import { useGame } from "@/hooks/useGame";
import { usePlayer } from "@/hooks/usePlayer";
import { useBuilders } from "@/hooks/useBuilders";
import leaderboard from "/assets/icons/leaderboard.svg";
import { DialogTitle } from "@radix-ui/react-dialog";
import { IngameButton } from "./dom/IngameButton";

export const LeaderboardDialog = ({ children }: { children?: ReactNode }) => {
  const { gameId } = useQueryParams();
  const { game } = useGame({ gameId });
  const { builders } = useBuilders({ gameId });

  if (!game || !builders || !builders.length) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        {children ?? <IngameButton icon={leaderboard} />}
      </DialogTrigger>
      <DialogContent className="bg-primary">
        <DialogHeader>
          <DialogTitle className="text-center text-xl">Leaderboard</DialogTitle>
        </DialogHeader>
        <Leaderboard game={game} builders={builders} />
      </DialogContent>
    </Dialog>
  );
};

export const Leaderboard = ({
  game,
  builders,
}: {
  game: any;
  builders: any[];
}) => {
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
        <PlayerRow rank={1} score={game?.score || 0} builder={builders[0]} />
      </TableBody>
    </Table>
  );
};

export const PlayerRow = ({
  rank,
  score,
  builder,
}: {
  rank: number;
  score: number;
  builder: any;
}) => {
  const { player } = usePlayer({ playerId: builder.player_id });
  const name = player?.name || "";
  const backgroundColor = useMemo(
    () => getColor(`0x${builder.player_id.toString(16)}`),
    [builder],
  );

  return (
    <TableRow>
      <TableCell className="">{rank}</TableCell>
      <TableCell>{score}</TableCell>
      <TableCell className="flex gap-2 text-ellipsis">
        <div className="rounded-full w-4 h-4" style={{ backgroundColor }} />
        {name}
      </TableCell>
    </TableRow>
  );
};
