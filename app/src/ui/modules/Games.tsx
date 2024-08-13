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
import { ScrollArea, ScrollBar } from "@/ui/elements/scroll-area";

import { useDojo } from "@/dojo/useDojo";
import { Has, defineEnterSystem, defineSystem } from "@dojoengine/recs";
import { useNavigate } from "react-router-dom";

import { useBuilder } from "@/hooks/useBuilder";
import { Game } from "@/dojo/game/types/game";
import { useLobby } from "@/hooks/useLobby";
import viewMapIcon from "/assets/icons/viewmap.svg";

export const Games = () => {
  const { gameMode } = useLobby();

  const [games, setGames] = useState<{ [key: number]: any }>({});
  const [show, setShow] = useState<boolean>(true);

  const {
    account: { account },
    setup: {
      world,
      clientModels: {
        models: { Game },
        classes: { Game: GameClass },
      },
    },
  } = useDojo();

  useMemo(() => {
    defineEnterSystem(world, [Has(Game)], function ({ value: [game] }: any) {
      setGames((prevTiles: any) => {
        return { ...prevTiles, [game.id]: new GameClass(game) };
      });
    });
    defineSystem(world, [Has(Game)], function ({ value: [game] }: any) {
      setGames((prevTiles: any) => {
        return { ...prevTiles, [game.id]: new GameClass(game) };
      });
    });
  }, []);

  const filteredGames: Game[] = useMemo(() => {
    return Object.values(games)
      .filter((game) => {
        if (game.mode.value !== gameMode.value) return false;
        if (show && game.score > 0) return true;
        return !game.isOver();
      })
      .sort((a, b) => b.id - a.id);
  }, [games, show, account, gameMode]);

  return (
    <div className="flex flex-col gap-2 items-start w-full h-full">
      <Table className="mb-4">
        <TableHeader>
          <TableRow className="text-xs">
            <TableHead className="w-[100px] text-center uppercase">Game</TableHead>
            <TableHead className="uppercase text-center">Rank</TableHead>
            <TableHead className="uppercase text-center">Score</TableHead>
            <TableHead className="uppercase text-center">Tiles</TableHead>
            <TableHead className="uppercase text-center">Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Object.values(filteredGames).map((game, index) => {
            return <GameSingleRow key={index} game={game} />;
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export const GameSingleRow = ({ game }: { game: any }) => {
  const [tilesPlayed, setTilesPlayed] = useState<number>();
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
      setTilesPlayed(game.tile_count);
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
    <TableRow className="text-2xs text-center text-background">
      <TableCell>#{game.id}</TableCell>
      <TableCell>1</TableCell>
      <TableCell>{score}</TableCell>
      <TableCell>{tilesPlayed}</TableCell>
      <TableCell>{formatTime(date) ?? "N/A"}</TableCell>

      <TableCell className="flex justify-end">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size={"sm"}
                className={`px-4 flex gap-3 self-end h-8 w-19 hover:bg-transparent ${over ? "border-none" : "border-2"}`}
                variant={over ? "ghost" : "default"}
                onClick={() => setGameQueryParam(game.id || 0)}
              >
                {over ? <img className="h-6 w-10" src={viewMapIcon} /> : "Play"}
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
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');

  // Format the time as hh:mm:ss
  return `${hours}:${minutes}:${seconds}`;
}