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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/elements/tooltip";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from "@/ui/elements/pagination";
import { ScrollArea } from "@/ui/elements/scroll-area";
import { Button } from "@/ui/elements/button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faEye,
  faLock,
  faSackDollar,
  faTrophy,
} from "@fortawesome/free-solid-svg-icons";
import { GameOverEvent, useGames } from "@/hooks/useGames";
import { useTournament } from "@/hooks/useTournament";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lords } from "./Lords";
import { Tournament as TournamentClass } from "@/dojo/game/models/tournament";
import { useDojo } from "@/dojo/useDojo";
import { Account } from "starknet";
import { useAccount } from "@starknet-react/core";
import { Mode, ModeType } from "@/dojo/game/types/mode";
import { useLobbyStore } from "@/store";
import { Sponsor } from "@/ui/components/Sponsor";

export const TournamentHeader = ({ mode }: { mode: Mode }) => {
  const [tournamentId, setTournamentId] = useState<number>();
  const [timeLeft, setTimeLeft] = useState<string>();

  useEffect(() => {
    if (!mode) return;
    const now = Math.floor(Date.now() / 1000);
    const id = Math.floor(now / mode.duration());
    const startTime = id * mode.duration();
    const endTime = startTime + mode.duration();
    setTournamentId(id - mode.offset());

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
  }, [mode]);

  return (
    <div className="flex justify-between items-center">
      <div className="text-xs">{`Season ${tournamentId} - ${timeLeft}`}</div>
    </div>
  );
};

export const TournamentDialog = ({ mode }: { mode: Mode }) => {
  return (
    <Dialog>
      <DialogTrigger>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size={"default"}>
                <FontAwesomeIcon
                  color="white"
                  className="h-6"
                  icon={faTrophy}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="select-none">Leaderboard</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </DialogTrigger>
      <DialogContent className="max-h-screen overflow-scroll">
        <DialogHeader className="flex items-center">
          Tournament Leaderboard
        </DialogHeader>
        <Tournament mode={mode} />
      </DialogContent>
    </Dialog>
  );
};

export const Tournament = ({ mode }: { mode: Mode }) => {
  const { games, ids } = useGames({ mode });
  const [page, setPage] = useState<number>(1);
  const [pages, setPages] = useState<number[]>([]);
  const [startDate, setStartDate] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");

  useEffect(() => {
    setPage(ids.length);
  }, [ids]);

  useEffect(() => {
    if (!games || !ids) return;
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
    if (!page || !mode) return;
    const startTime = (page + mode.offset()) * mode.duration();
    const endTime = startTime + mode.duration();
    const start = new Date(startTime * 1000);
    const end = new Date(endTime * 1000);
    setStartDate(start.toLocaleDateString());
    setStartTime(start.toLocaleTimeString());
    setEndDate(end.toLocaleDateString());
    setEndTime(end.toLocaleTimeString());
  }, [page, mode]);

  const balckilist = useMemo(() => {
    return [""];
  }, []);

  const allGames = useMemo(() => {
    return games
      .filter(
        (game) =>
          game.seasonId - mode.offset() === page &&
          !balckilist.includes(game.playerMaster),
      )
      .sort((a, b) => b.gameScore - a.gameScore)
      .slice(0, 10);
  }, [games, page, balckilist]);

  return (
    <div className="relative flex flex-col gap-4">
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

      {(page && <Sponsor tournamentId={page + mode.offset()} mode={mode} />) ||
        null}

      <Table className="text-xs">
        <ScrollArea className="h-[570px] w-full pr-2">
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead className="max-w-[100px]">Name</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead className="flex justify-center items-center">
                <Lords fill={"black"} width={4} height={4} />
              </TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allGames.map((game: GameOverEvent, index: number) => {
              return (
                <GameRow
                  key={index}
                  game={game}
                  tournamentId={(page ? page : 0) + mode.offset()}
                  rank={index + 1}
                  mode={mode}
                />
              );
            })}
          </TableBody>
        </ScrollArea>
      </Table>
    </div>
  );
};

export const GameRow = ({
  game,
  tournamentId,
  rank,
  mode,
}: {
  game: GameOverEvent;
  tournamentId: number;
  rank: number;
  mode: Mode;
}) => {
  // const { account } = useAccount();
  const {
    account: { account },
  } = useDojo();

  const { tournament } = useTournament({
    tournamentId: tournamentId,
  });

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

  const winnings = useMemo(() => {
    if (!tournament) return Number(0).toFixed(2);
    const value = (tournament.reward(rank) / 1e18).toFixed(2);
    if (value.length > 6) {
      return value.slice(0, 6);
    }
    return value;
  }, [tournament, rank]);

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

  const isSelf = useMemo(() => {
    return game.playerId === account?.address;
  }, [game, account]);

  return (
    <TableRow>
      <TableCell className="">{playerRank}</TableCell>
      <TableCell className="text-left">{playerName}</TableCell>
      <TableCell className="text-right">{game.gameScore}</TableCell>
      <TableCell className="text-right">{duration}</TableCell>
      <TableCell className="text-right">{rank > 3 ? "" : winnings}</TableCell>
      <TableCell className="text-right">
        {isSelf && tournament && tournament.isClaimable(rank, mode) ? (
          <Claim tournament={tournament} rank={rank} mode={mode} />
        ) : (
          <Spectate gameId={game.gameId} />
        )}
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

export const Claim = ({
  tournament,
  rank,
  mode,
}: {
  tournament: TournamentClass;
  rank: number;
  mode: Mode;
}) => {
  // const { account } = useAccount();
  const {
    account: { account },
    setup: {
      systemCalls: { claim },
    },
  } = useDojo();

  const disabled = useMemo(() => {
    if (!tournament) return true;
    return !tournament.isOver(mode) || tournament.isClaimed(rank);
  }, [tournament]);

  const handleClick = useCallback(() => {
    if (account) {
      claim({
        account: account as Account,
        mode,
        tournament_id: tournament.id,
        rank,
      });
    }
  }, [account, tournament]);

  return (
    <Button
      disabled={disabled}
      variant={"secondary"}
      size={"icon"}
      onClick={handleClick}
    >
      <FontAwesomeIcon icon={faSackDollar} />
    </Button>
  );
};
