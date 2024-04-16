import {
  Dialog,
  DialogContent,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faLock, faTrophy } from "@fortawesome/free-solid-svg-icons";
import { GameOverEvent, useGames } from "@/hooks/useGames";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ModeType } from "@/dojo/game/types/mode";

export const SingleLeaderboardDialog = () => {
  return (
    <Dialog>
      <DialogTrigger>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={"secondary"} size={"default"}>
                <FontAwesomeIcon className="h-6" icon={faTrophy} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="select-none">Leaderboard</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader className="flex items-center">
          All time leaderboard
        </DialogHeader>
        <SingleLeaderboard />
      </DialogContent>
    </Dialog>
  );
};

export const SingleLeaderboard = () => {
  const { games } = useGames(ModeType.Single);

  const balckilist = useMemo(() => {
    return [""];
  }, []);

  const allGames = useMemo(() => {
    return games
      .filter((game) => !balckilist.includes(game.playerMaster))
      .sort((a, b) => b.gameScore - a.gameScore)
      .slice(0, 10);
  }, [games, balckilist]);

  return (
    <div className="relative flex flex-col gap-4">
      <Table className="text-xs">
        <ScrollArea className="h-[570px] w-full pr-2">
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead className="max-w-[100px]">Name</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allGames.map((game: GameOverEvent, index: number) => {
              return <GameRow key={index} game={game} rank={index + 1} />;
            })}
          </TableBody>
        </ScrollArea>
      </Table>
    </div>
  );
};

export const GameRow = ({
  game,
  rank,
}: {
  game: GameOverEvent;
  rank: number;
}) => {
  const duration = useMemo(() => {
    const startTime = game.gameStartTime;
    const endTime = game.gameEndTime;
    const dt = endTime.getTime() - startTime.getTime();
    const hours = Math.floor(dt / 1000 / 60 / 60);
    const minutes = Math.floor((dt / 1000 / 60) % 60);
    const seconds = Math.floor((dt / 1000) % 60);
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }, [game]);

  const playerName = useMemo(() => {
    // Name on 10 characters max
    return game.playerName.length > 8
      ? game.playerName.slice(0, 8) + "…"
      : game.playerName;
  }, [game]);

  const playerRank = useMemo(() => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
  }, [rank]);

  return (
    <TableRow>
      <TableCell className="font-medium">{playerRank}</TableCell>
      <TableCell className="text-left">{playerName}</TableCell>
      <TableCell className="text-right">{game.gameScore}</TableCell>
      <TableCell className="text-right">{duration}</TableCell>
      <TableCell className="text-right">
        <Spectate gameId={game.gameId} />
      </TableCell>
    </TableRow>
  );
};

export const Spectate = ({ gameId }: { gameId: number }) => {
  const navigate = useNavigate();

  const setGameQueryParam = useMemo(() => {
    return (id: string) => {
      if (!id) return;
      navigate("?id=" + id, { replace: true });
    };
  }, [navigate]);

  return (
    <Button
      disabled={!gameId}
      variant={"secondary"}
      size={"icon"}
      onClick={() => {
        if (!gameId) return;
        return setGameQueryParam(`${gameId}`);
      }}
    >
      <FontAwesomeIcon icon={gameId ? faEye : faLock} />
    </Button>
  );
};
