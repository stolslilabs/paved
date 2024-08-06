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
import { ScrollArea } from "@/ui/elements/scroll-area";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faRightToBracket } from "@fortawesome/free-solid-svg-icons";

import { useDojo } from "@/dojo/useDojo";
import { Has, defineEnterSystem, defineSystem } from "@dojoengine/recs";
import { useNavigate } from "react-router-dom";

import { useBuilder } from "@/hooks/useBuilder";
import { Game } from "@/dojo/game/types/game";
import { useLobby } from "@/hooks/useLobby";

export const Games = () => {
  const { gameMode } = useLobby();

  const [games, setGames] = useState<{ [key: number]: any }>({});
  const [show, setShow] = useState<boolean>(false);

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
      <ScrollArea className="w-full">
        <Table>
          <TableHeader>
            <TableRow className="text-sm">
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
      </ScrollArea>
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
    <TableRow className="text-xs text-center text-background">
      <TableCell>#{game.id}</TableCell>
      <TableCell>1</TableCell>
      <TableCell>{score}</TableCell>
      <TableCell>{tilesPlayed}</TableCell>
      <TableCell>00:00:00</TableCell>

      <TableCell className="flex justify-end">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size={"sm"}
                className="px-4 flex gap-3 self-end"
                variant={"default"}
                onClick={() => setGameQueryParam(game.id || 0)}
              >
                Join
                <FontAwesomeIcon icon={over ? faEye : faRightToBracket} />
              </Button>
            </TooltipTrigger>
          </Tooltip>
        </TooltipProvider>
      </TableCell>
    </TableRow>
  );
};
