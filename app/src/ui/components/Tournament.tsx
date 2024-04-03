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
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faEye,
  faLock,
  faTrophy,
} from "@fortawesome/free-solid-svg-icons";
import { GameOverEvent, useGames } from "@/hooks/useGames";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  TOURNAMENT_DURATION,
  TOURNAMENT_ID_OFFSET,
} from "@/dojo/game/constants";
import { set } from "mobx";

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
  const [top1Index, setTop1Index] = useState<number>();
  const [top2Index, setTop2Index] = useState<number>();
  const [top3Index, setTop3Index] = useState<number>();
  const [quickestIndex, setQuickestIndex] = useState<number | undefined>();
  const [filtered, setFiltered] = useState<boolean>(true);

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

  const balckilist = useMemo(() => {
    return [
      "0x41aad5a7493b75f240f418cb5f052d1a68981af21e813ed0a35e96d3e83123b",
    ];
  }, []);

  const topestGames = useMemo(() => {
    const highests: { [key: string]: GameOverEvent } = {};
    games
      .filter(
        (game) =>
          game.tournamentId === page && !balckilist.includes(game.playerMaster),
      )
      .forEach((game: GameOverEvent) => {
        const playerMaster =
          game.playerMaster ===
          "0x18d4756921d34b0026731f427c6b365687ce61ce060141bf26867f0920d2191"
            ? "0x30c3f654ead1da0c9166d483d3dd436dcbb57ce8e1adaa129995103a8dcca4d"
            : game.playerMaster;
        if (!highests[playerMaster]) {
          highests[playerMaster] = game;
        } else if (game.gameScore > highests[playerMaster].gameScore) {
          highests[playerMaster] = game;
        }
      });
    return Object.values(highests)
      .sort((a, b) => b.gameScore - a.gameScore)
      .slice(0, 50);
  }, [games, page, balckilist]);

  const allGames = useMemo(() => {
    return games
      .filter(
        (game) =>
          game.tournamentId === page && !balckilist.includes(game.playerMaster),
      )
      .sort((a, b) => b.gameScore - a.gameScore)
      .slice(0, 50);
  }, [games, page, balckilist]);

  const quickestGame = useMemo(() => {
    return allGames.slice(0, 10).sort((a, b) => {
      const dta = a.gameEndTime.getTime() - a.gameStartTime.getTime();
      const dtb = b.gameEndTime.getTime() - b.gameStartTime.getTime();
      return dta - dtb;
    })[0];
  }, [allGames]);

  useEffect(() => {
    if (filtered) {
      setTop1Index(topestGames.indexOf(topestGames[0]));
      setTop2Index(topestGames.indexOf(topestGames[1]));
      setTop3Index(topestGames.indexOf(topestGames[2]));
      const quickest = topestGames.indexOf(quickestGame);
      setQuickestIndex(quickest === -1 ? undefined : quickest);
    } else {
      setTop1Index(allGames.indexOf(topestGames[0]));
      setTop2Index(allGames.indexOf(topestGames[1]));
      setTop3Index(allGames.indexOf(topestGames[2]));
      setQuickestIndex(allGames.indexOf(quickestGame));
    }
  }, [topestGames, allGames, filtered]);

  return (
    <div className="relative flex flex-col gap-4">
      <div className="flex justify-center text-xs">Seasons</div>
      <div className="absolute top-0 right-0">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Switch
                id="show-finished"
                checked={filtered}
                onCheckedChange={() => setFiltered(!filtered)}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p className="select-none">
                {filtered ? "Show unique games" : "Show unique players"}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
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
        <ScrollArea className="h-[570px] w-full pr-2">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Rank</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(filtered ? topestGames : allGames).map(
              (game: GameOverEvent, index: number) => {
                return (
                  <GameRow
                    key={index}
                    game={game}
                    rank={index + 1}
                    quickest={quickestIndex === index}
                    top1={top1Index === index}
                    top2={top2Index === index}
                    top3={top3Index === index}
                  />
                );
              },
            )}
          </TableBody>
        </ScrollArea>
      </Table>
    </div>
  );
};

export const GameRow = ({
  game,
  rank,
  top1,
  top2,
  top3,
  quickest,
}: {
  game: GameOverEvent;
  rank: number;
  top1: boolean;
  top2: boolean;
  top3: boolean;
  quickest: boolean;
}) => {
  const navigate = useNavigate();

  const setGameQueryParam = useMemo(() => {
    return (id: string) => {
      if (!id) return;
      navigate("?id=" + id, { replace: true });
    };
  }, [navigate]);

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

  const formattedRank = useMemo(() => {
    let value = `#${rank}`;
    if (top1) value = `${value} 🥇`;
    if (top2) value = `${value} 🥈`;
    if (top3) value = `${value} 🥉`;
    if (quickest) value = `${value} ⏰`;
    return value;
  }, [top1, top2, top3, quickest, rank]);

  return (
    <TableRow>
      <TableCell className="font-medium">{formattedRank}</TableCell>
      <TableCell className="text-ellipsis">{game.playerName}</TableCell>
      <TableCell className="text-right">{game.gameScore}</TableCell>
      <TableCell className="text-right">{duration}</TableCell>
      <TableCell className="text-right">
        <Button
          disabled={!game.gameId}
          variant={"secondary"}
          size={"icon"}
          onClick={() => {
            if (!game.gameId) return;
            return setGameQueryParam(`${game.gameId}`);
          }}
        >
          <FontAwesomeIcon icon={game.gameId ? faEye : faLock} />
        </Button>
      </TableCell>
    </TableRow>
  );
};
