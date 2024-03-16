import {
  Dialog,
  DialogContent,
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
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendar,
  faCalendarDays,
  faEye,
  faTrophy,
} from "@fortawesome/free-solid-svg-icons";
import { GameOverEvent, useGames } from "@/hooks/useGames";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TOURNAMENT_DURATION, TOURNAMENT_ID_OFFSET } from "@/utils/constants";

export const TournamentHeader = () => {
  const [tournamentId, setTournamentId] = useState<number>();
  const [timeLeft, setTimeLeft] = useState<string>();

  useEffect(() => {
    const now = Math.floor(Date.now() / 1000);
    const id = Math.floor(now / TOURNAMENT_DURATION);
    const startTime = id * TOURNAMENT_DURATION;
    const endTime = startTime + TOURNAMENT_DURATION;
    setTournamentId(id - TOURNAMENT_ID_OFFSET);

    const interval = setInterval(() => {
      // Remaining time in seconds
      const dt = endTime - Math.floor(Date.now() / 1000);

      // Calculating hours, minutes, and seconds
      const days = Math.floor(dt / 86400);
      const hours = Math.floor((dt % 86400) / 3600);
      const minutes = Math.floor((dt % 3600) / 60);
      const seconds = dt % 60;

      // Formatting DD - HH:MM:SS
      const formattedTime = `
        ${days.toString().padStart(2, "0")}d ${hours
        .toString()
        .padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`;
      setTimeLeft(formattedTime);

      if (dt < 0) {
        clearInterval(interval);
        setTimeLeft("00:00:00");
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex justify-between items-center">
      <div className="text-xs">{`Season ${tournamentId} - ${timeLeft}`}</div>
    </div>
  );
};

export const TournamentDialog = () => {
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
          Tournament Leaderboard
        </DialogHeader>
        <Tournament />
      </DialogContent>
    </Dialog>
  );
};

export const Tournament = () => {
  const { games, ids } = useGames();
  const [page, setPage] = useState<number | undefined>();
  const [pages, setPages] = useState<number[]>([]);
  const [startDate, setStartDate] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");

  useEffect(() => {
    if (!page) return setPage(ids.length);
    const pages = [page];
    if (page > 1) {
      pages.unshift(page - 1);
    }
    if (page < ids.length) {
      pages.push(page + 1);
    }
    if (page === 1 && ids.length > 2) {
      pages.push(page + 2);
    }
    if (page === ids.length && ids.length > 2) {
      pages.unshift(page - 2);
    }
    setPages(pages);
  }, [page, ids]);

  useEffect(() => {
    if (!page) return;
    const startTime = (page + TOURNAMENT_ID_OFFSET) * TOURNAMENT_DURATION;
    const endTime = startTime + TOURNAMENT_DURATION;
    const start = new Date(startTime * 1000);
    const end = new Date(endTime * 1000);
    setStartDate(start.toLocaleDateString());
    setStartTime(start.toLocaleTimeString());
    setEndDate(end.toLocaleDateString());
    setEndTime(end.toLocaleTimeString());
  }, [page]);

  const filteredGames = useMemo(() => {
    const highests: { [key: string]: GameOverEvent } = {};
    games
      .filter((game) => game.tournamentId === page)
      .forEach((game: GameOverEvent) => {
        if (!highests[game.playerId]) {
          highests[game.playerId] = game;
        } else if (game.gameScore > highests[game.playerId].gameScore) {
          highests[game.playerId] = game;
        }
      });
    return Object.values(highests)
      .sort((a, b) => b.gameScore - a.gameScore)
      .slice(0, 16);
  }, [games, page]);

  return (
    <>
      <div className="flex justify-center text-xs">Seasons</div>
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
          {pages.map((id: number, index: number) => {
            return (
              <PaginationItem key={index}>
                <PaginationLink
                  href="#"
                  isActive={id === (page ? page : ids.length)}
                  onClick={() => setPage(id)}
                >
                  {id}
                </PaginationLink>
              </PaginationItem>
            );
          })}
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
        </PaginationContent>
      </Pagination>

      <div className="flex justify-center items-center text-xs gap-4">
        <div className="flex flex-col items-center">
          <p>{startDate}</p>
          <p>{startTime}</p>
        </div>
        <FontAwesomeIcon className="mx-2 h-6" icon={faCalendarDays} />
        <div className="flex flex-col items-center">
          <p>{endDate}</p>
          <p>{endTime}</p>
        </div>
      </div>

      <Table className="text-xs">
        <TableCaption>Top 16 players</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Rank</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="text-right">Score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredGames.map((game: GameOverEvent, index: number) => {
            return <GameRow key={index} game={game} rank={index + 1} />;
          })}
        </TableBody>
      </Table>
    </>
  );
};

export const GameRow = ({
  game,
  rank,
}: {
  game: GameOverEvent;
  rank: number;
}) => {
  const navigate = useNavigate();

  const setGameQueryParam = useMemo(() => {
    return (id: string) => {
      navigate("?id=" + id, { replace: true });
    };
  }, [navigate]);

  return (
    <TableRow>
      <TableCell className="font-medium">{`#${rank}`}</TableCell>
      <TableCell className="text-ellipsis">{game.playerName}</TableCell>
      <TableCell className="text-right">{game.gameScore}</TableCell>
      <TableCell className="text-right">
        <Button
          variant={"secondary"}
          size={"icon"}
          onClick={() => setGameQueryParam(`${game.gameId}`)}
        >
          <FontAwesomeIcon icon={faEye} />
        </Button>
      </TableCell>
    </TableRow>
  );
};
