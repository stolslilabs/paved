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
import { Builder } from "@/dojo/game/models/builder";

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
        <Leaderboard builders={builders} />
      </DialogContent>
    </Dialog>
  );
};

export const Leaderboard = ({
  builders,
}: {
  builders: Array<Builder>;
}) => {
  const sortedBuilders = useMemo(() =>
    [...builders].sort((a, b) => (b.score || 0) - (a.score || 0)),
    [builders]
  )
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
        {sortedBuilders.map((builder, index) => (
          builder.score > 0 && <PlayerRow rank={index + 1} score={builder?.score || 0} builder={builder} />
        ))}
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
  builder: Builder;
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
