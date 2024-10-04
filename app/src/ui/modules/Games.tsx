import { useEffect, useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/elements/table";
import { Button } from "@/ui/elements/button";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/elements/tooltip";

import { useDojo } from "@/dojo/useDojo";
import { useNavigate } from "react-router-dom";

import { useBuilder } from "@/hooks/useBuilder";
import { Game } from "@/dojo/game/models/game";
import { useLobby } from "@/hooks/useLobby";
import viewMapIcon from "/assets/icons/viewmap.svg";
import { Mode, ModeType } from "@/dojo/game/types/mode";
import blobert from "/assets/blobert.svg";
import { CreateGame } from "../components/CreateGame";

export type GamesList = { [key: number]: any };

export const Games = ({ games }: { games: GamesList }) => {
  const { gameMode } = useLobby();

  const filteredGames: Game[] = useMemo(
    () =>
      Object.values(games)
        .filter((game) => {
          if (game.mode.value !== gameMode.value) return false;
          if (game.score > 0) return true;
          return !game.isOver();
        })
        .sort((a, b) => b.id - a.id),
    [games, gameMode],
  );

  return gameMode.value !== ModeType.Tutorial ? (
    <Table className="mb-4">
      <TableHeader>
        <TableRow className="text-xs sm:text-sm">
          <TableHead className="w-[100px] text-center uppercase">
            Game
          </TableHead>
          <TableHead className="uppercase text-center">Rank</TableHead>
          <TableHead className="uppercase text-center">Score</TableHead>
          <TableHead className="uppercase text-center">Time</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Object.values(filteredGames).map((game, index) => (
          <GameSingleRow key={index} game={game} />
        ))}
      </TableBody>
    </Table>
  ) : (
    <StartTutorialContent />
  );
};

const StartTutorialContent = () => {
  return (
    <div className="flex flex-col sm:flex-row md:flex-col items-center justify-center h-full gap-8 sm:gap-4 lg:gap-8 p-4">
      <img src={blobert} className="width-full sm:w-1/2" />
      <CreateGame mode={new Mode(ModeType.Tutorial)} />
    </div>
  );
};

export const GameSingleRow = ({ game }: { game: any }) => {
  const [score, setScore] = useState<number>();
  const [over, setOver] = useState<boolean>(false);
  // const { account } = useAccount();
  const {
    account: { account },
  } = useDojo();

  const { builder } = useBuilder({
    gameId: game?.id,
    playerId: account?.address,
  });

  useEffect(() => {
    if (game && builder) {
      setScore(game.score);
      setOver(game.isOver());
    }
  }, [game, builder]);

  const navigate = useNavigate();

  const setGameQueryParam = useMemo(() => {
    return (id: string) => {
      navigate("?id=" + id, { replace: true });
    };
  }, [navigate]);

  const date = new Date(game.start_time);

  if (!game || !builder) return null;

  return (
    <TableRow className="text-2xs sm:text-xs text-center text-background">
      <TableCell>#{game.id}</TableCell>
      <TableCell>1</TableCell>
      <TableCell>{score}</TableCell>
      <TableCell>{formatTime(date) ?? "N/A"}</TableCell>

      <TableCell className="flex justify-end">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size={"sm"}
                className={`px-1 sm:px-4 flex gap-3 self-end h-8 w-19 text-2xs sm:text-xs hover:bg-transparent ${over ? "border-none" : "border-2"}`}
                variant={over ? "ghost" : "default"}
                onClick={() => setGameQueryParam(game.id || 0)}
              >
                {over ? (
                  <img className="h-6 w-10 " src={viewMapIcon} />
                ) : (
                  "Play"
                )}
              </Button>
            </TooltipTrigger>
          </Tooltip>
        </TooltipProvider>
      </TableCell>
    </TableRow>
  );
};

function formatTime(date: Date) {
  // Get hours, minutes, and seconds from the Date object
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");

  // Format the time as hh:mm:ss
  return `${hours}:${minutes}:${seconds}`;
}
