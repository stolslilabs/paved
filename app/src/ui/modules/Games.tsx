import { useEffect, useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/elements/table";
import banner from "/assets/banner.svg";
import { Button } from "@/ui/elements/button";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/elements/tooltip";
import { ScrollArea } from "@/ui/elements/scroll-area";
import { Label } from "@/ui/elements/label";
import { Switch } from "@/ui/elements/switch";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faRightToBracket } from "@fortawesome/free-solid-svg-icons";

import { useDojo } from "@/dojo/useDojo";
import { Has, defineEnterSystem, defineSystem } from "@dojoengine/recs";
import { useNavigate } from "react-router-dom";

import { CreateGame } from "@/ui/components/CreateGame";
import { TournamentDialog, TournamentHeader } from "../components/Tournament";
import { useLobbyStore } from "@/store";
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
    <div className=" h-full">
      <div className="flex flex-col gap-2 items-start w-full p-4  md:px-8 h-full">
        <div className="h-24 flex justify-between w-full">
          <img src={banner} className="h-full " />
        </div>

        <div className="flex my-4 gap-4 items-center">
          <CreateGame mode={gameMode} />
        </div>

        <div className="flex justify-between w-full">
          <h4>Games</h4>
          <div className="flex items-center space-x-2">
            <Switch
              id="show-finished"
              checked={show}
              onCheckedChange={() => setShow(!show)}
            />
            <Label className="text-xs" htmlFor="show-finished">
              Show finished Games
            </Label>
          </div>
        </div>

        <ScrollArea className="w-full pr-4 p-4 shadow">
          <Table>
            <TableHeader>
              <TableRow className="text-sm">
                <TableHead className="w-[100px]">#</TableHead>
                <TableHead>Tiles played</TableHead>
                <TableHead>Score</TableHead>
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
    <TableRow className="text-xs">
      <TableCell>{game.id}</TableCell>
      <TableCell>{tilesPlayed}</TableCell>
      <TableCell>{score}</TableCell>

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
                <span className="self-center">Join</span>

                <FontAwesomeIcon
                  className="self-center"
                  icon={over ? faEye : faRightToBracket}
                />
              </Button>
            </TooltipTrigger>
          </Tooltip>
        </TooltipProvider>
      </TableCell>
    </TableRow>
  );
};
