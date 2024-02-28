import { useEffect, useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faRightToBracket } from "@fortawesome/free-solid-svg-icons";

import { useDojo } from "@/dojo/useDojo";
import { useComponentValue, useEntityQuery } from "@dojoengine/react";
import {
  Entity,
  Has,
  HasValue,
  NotValue,
  defineSystem,
} from "@dojoengine/recs";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useNavigate } from "react-router-dom";

import { CreateGame } from "@/ui/components/CreateGame";
import { shortString } from "starknet";

export const Games = () => {
  const [games, setGames] = useState<{ [key: number]: typeof Game }>({});
  const [show, setShow] = useState<boolean>(false);
  const {
    setup: {
      world,
      clientComponents: { Game },
    },
  } = useDojo();

  useEffect(() => {
    defineSystem(world, [Has(Game)], function ({ value: [game] }: any) {
      setGames((prevTiles: any) => {
        return { ...prevTiles, [game.id]: game };
      });
    });
  }, []);

  const filteredGames = useMemo(() => {
    return Object.values(games).filter((game) => {
      if (show) {
        return true;
      }
      const endtime = game.start_time + game.duration;
      return (
        game.start_time == 0 ||
        game.duration == 0 ||
        endtime > Math.floor(Date.now() / 1000)
      );
    });
  }, [games, show]);

  const backgroundColor = useMemo(() => "#FCF7E7", []);

  return (
    <div className="bg-yellow-100 h-full grow" style={{ backgroundColor }}>
      <div className="flex flex-col gap-8 items-start w-full p-10 h-full">
        <h1>Game lobby</h1>
        <CreateGame />

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

        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow className="text-sm">
                <TableHead className="w-[100px]">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Current players</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Time left</TableHead>
                <TableHead>Tiles played</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.values(filteredGames).map((game, index) => {
                return <GameRow key={index} game={game} />;
              })}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>
    </div>
  );
};

export const GameRow = ({ game }: { game: any }) => {
  const [gameId, setGameId] = useState<number>();
  const [gameName, setGameName] = useState<string>();
  const [playerCount, setPlayerCount] = useState<number>();
  const [startTime, setStartTime] = useState<number>();
  const [duration, setDuration] = useState<number>();
  const [gameDuration, setGameDuration] = useState<string>();
  const [timeLeft, setTimeLeft] = useState<string>();
  const [tilesPlayed, setTilesPlayed] = useState<number>();
  const [over, setOver] = useState<boolean>(false);
  const {
    account: { account },
    setup: {
      clientComponents: { Game, Player, Builder },
    },
  } = useDojo();

  const builders = useEntityQuery([
    Has(Builder),
    HasValue(Builder, { game_id: game?.id }),
    NotValue(Builder, { order: 0 }),
  ]);
  const playerKey = useMemo(
    () => getEntityIdFromKeys([BigInt(account.address)]) as Entity,
    [account]
  );
  const player = useComponentValue(Player, playerKey);
  const builderKey = useMemo(() => {
    if (!game || !player) return undefined;
    return getEntityIdFromKeys([BigInt(game.id), BigInt(player.id)]) as Entity;
  }, [game, player]);
  const builder = useComponentValue(Builder, builderKey);

  useEffect(() => {
    if (game) {
      setGameId(game.id);
      setGameName(shortString.decodeShortString(game.name));
      setStartTime(game.start_time);
      setDuration(game.duration);
      setTilesPlayed(game.tile_count);
      setOver(
        game.start_time !== 0 &&
          game.duration !== 0 &&
          game.start_time + game.duration < Math.floor(Date.now() / 1000)
      );
    }
    setPlayerCount(builders?.length || 0);
  }, [game, builders]);

  // Calculating game duration
  useEffect(() => {
    if (duration) {
      // Calculating hours, minutes, and seconds
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      const seconds = duration % 60;

      // Formatting HH:MM:SS
      const formattedTime = `
        ${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
      setGameDuration(formattedTime);
    } else {
      setGameDuration("∞");
    }
  }, [duration]);

  // Calculating time left
  useEffect(() => {
    if (startTime && duration) {
      const interval = setInterval(() => {
        // Remaining time in seconds
        const dt = startTime + duration - Math.floor(Date.now() / 1000);

        // Calculating hours, minutes, and seconds
        const hours = Math.floor(dt / 3600);
        const minutes = Math.floor((dt % 3600) / 60);
        const seconds = dt % 60;

        // Formatting HH:MM:SS
        const formattedTime = `
          ${hours.toString().padStart(2, "0")}:${minutes
          .toString()
          .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
        setTimeLeft(formattedTime);

        if (dt < 0) {
          clearInterval(interval);
          setTimeLeft("00:00:00");
        }

        if (duration == 0) {
          clearInterval(interval);
          setTimeLeft("00:00:00");
        }
      }, 1000);
      return () => clearInterval(interval);
    } else if (duration) {
      // Calculating hours, minutes, and seconds
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      const seconds = duration % 60;

      // Formatting HH:MM:SS
      const formattedTime = `
        ${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
      setTimeLeft(formattedTime);
    } else {
      setTimeLeft("∞");
    }
  }, [startTime, duration]);

  const navigate = useNavigate();

  const setGameQueryParam = useMemo(() => {
    return (id: string) => {
      navigate("?game=" + id, { replace: true });
    };
  }, [navigate]);

  if (!game) return null;

  return (
    <TableRow className="text-xs">
      <TableCell>{gameId}</TableCell>
      <TableCell>{gameName}</TableCell>
      <TableCell>{playerCount}</TableCell>
      <TableCell>{gameDuration}</TableCell>
      <TableCell>{timeLeft}</TableCell>
      <TableCell>{tilesPlayed}</TableCell>

      <TableCell>
        <Button
          className={`align-right}`}
          variant={"secondary"}
          size={"icon"}
          onClick={() => setGameQueryParam(game.id || 0)}
        >
          <FontAwesomeIcon
            icon={
              (builder || game.start_time === 0) && !over
                ? faRightToBracket
                : faEye
            }
          />
        </Button>
      </TableCell>
    </TableRow>
  );
};
