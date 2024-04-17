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
import { Input } from "@/components/ui/input";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faCircleCheck,
  faCrown,
  faSquareXmark,
} from "@fortawesome/free-solid-svg-icons";

import { useDojo } from "@/dojo/useDojo";
import {
  Has,
  HasValue,
  defineEnterSystem,
  defineSystem,
} from "@dojoengine/recs";
import { useNavigate } from "react-router-dom";
import { shortString } from "starknet";
import { useQueryParams } from "@/hooks/useQueryParams";
import { shortenHex } from "@dojoengine/utils";
import { useLobbyStore } from "@/store";

import { StartGame } from "@/ui/components/StartGame";
import { LeaveGame } from "@/ui/components/LeaveGame";
import { DeleteGame } from "@/ui/components/DeleteGame";
import { TransferGame } from "../components/TransferGame";
import { UpdateGame } from "../components/UpdateGame";
import { ScrollArea } from "@radix-ui/react-scroll-area";
import { Ready } from "../components/Ready";
import { Kick } from "../components/Kick";
import { JoinGame } from "../components/JoinGame";
import { useGame } from "@/hooks/useGame";
import { usePlayer } from "@/hooks/usePlayer";
import { useBuilder } from "@/hooks/useBuilder";

export const Room = () => {
  const { gameId } = useQueryParams();
  const [gameName, setGameName] = useState<string>("");
  const [duration, setDuration] = useState<string>("");
  const [builders, setBuilders] = useState<{ [key: number]: typeof Builder }>(
    {},
  );
  const { resetPlayerEntity } = useLobbyStore();
  const {
    account: { account },
    setup: {
      world,
      clientModels: {
        models: { Builder },
      },
    },
  } = useDojo();

  const { game } = useGame({ gameId });
  const { builder } = useBuilder({
    gameId: gameId,
    playerId: account?.address,
  });

  useMemo(() => {
    defineEnterSystem(
      world,
      [Has(Builder), HasValue(Builder, { game_id: gameId })],
      function ({ value: [builder] }: any) {
        setBuilders((prev: any) => {
          return { ...prev, [builder.player_id]: builder };
        });
      },
    );
    defineSystem(
      world,
      [Has(Builder), HasValue(Builder, { game_id: gameId })],
      function ({ value: [builder] }: any) {
        setBuilders((prev: any) => {
          return { ...prev, [builder.player_id]: builder };
        });
      },
    );
  }, []);

  const backgroundColor = useMemo(() => "#FCF7E7", []);

  const navigate = useNavigate();

  useEffect(() => {
    if (game) {
      setGameName(game.name);
      setDuration(game.duration.toString());
    }
  }, [game]);

  useEffect(() => {
    if (game) {
      // Calculating hours, minutes, and seconds
      const hours = Math.floor(game.duration / 3600);
      const minutes = Math.floor((game.duration % 3600) / 60);
      const seconds = game.duration % 60;

      // Formatting HH:MM:SS
      const formattedTime = `
        ${hours.toString().padStart(2, "0")}:${minutes
          .toString()
          .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
      setDuration(formattedTime.trim());
    }
  }, [game]);

  const handleClickHome = () => {
    resetPlayerEntity();
    navigate("", { replace: true });
  };

  return (
    <div className="bg-yellow-100 h-full grow" style={{ backgroundColor }}>
      <div className="flex flex-col gap-8 items-start w-full p-10">
        <h1>Waiting room</h1>

        <div className="flex gap-4">
          <Input className="text-center" disabled value={gameName} />
          <Input className="text-center" disabled value={duration} />
        </div>

        <div className="flex gap-4">
          <Button variant={"secondary"} onClick={handleClickHome}>
            <FontAwesomeIcon icon={faArrowLeft} />
          </Button>

          {game && builder && builder.index === 0 && <StartGame />}
          {game && (!builder || builder.index >= game.player_count) && (
            <JoinGame />
          )}
          {game && builder && builder.index === 0 && <DeleteGame />}
          {game &&
            builder &&
            builder.index !== 0 &&
            builder.index < game.player_count && <LeaveGame />}
          {game && builder && builder.index === 0 && <UpdateGame />}
        </div>

        <h4>Players</h4>
        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow className="text-sm">
                <TableHead className="w-[48px]" />
                <TableHead className="w-[100px]">#</TableHead>
                <TableHead>Name</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.values(builders)
                .sort((a: any, b: any) => a.index - b.index)
                .map((builder, index) => {
                  return <BuilderRow key={index} builder={builder} />;
                })}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>
    </div>
  );
};

export const BuilderRow = ({ builder }: { builder: any }) => {
  const { gameId } = useQueryParams();
  const { setPlayerEntity } = useLobbyStore();
  const [playerId, setPlayerId] = useState<string>();
  const [playerName, setPlayerName] = useState<string>();
  const [ready, setReady] = useState<boolean>();
  const [display, setDisplay] = useState<boolean>(true);
  const [isHost, setIsHost] = useState(false);
  const [isSelf, setIsSelf] = useState(false);
  const {
    account: { account },
  } = useDojo();

  const { game } = useGame({ gameId });
  const { player, playerKey } = usePlayer({ playerId: builder?.player_id });
  const { builder: self } = useBuilder({
    gameId: gameId,
    playerId: account?.address,
  });

  useEffect(() => {
    if (game && player && builder) {
      if (builder.order == 0 || builder.index >= game.player_count) {
        return setDisplay(false);
      }
      setPlayerId(shortenHex(`${player.id}`).replace("...", ""));
      setPlayerName(player.name);
      setReady(
        BigInt(game.players) & (BigInt(1) << BigInt(builder.index))
          ? true
          : false,
      );
      setIsHost(builder.index === 0);
      setIsSelf(player.id === BigInt(account.address));
      setDisplay(true);
    }
  }, [game, player, builder]);

  const handleClick = () => {
    if (!playerKey) return;
    setPlayerEntity(playerKey);
  };

  if (!player || !builder || !builder.order || !display) return null;

  return (
    <TableRow onClick={handleClick} className="h-16 text-xs">
      <TableCell>
        {ready && (
          <FontAwesomeIcon
            className="h-4"
            icon={faCircleCheck}
            style={{ color: "green" }}
          />
        )}
        {!ready && (
          <FontAwesomeIcon
            className="h-4"
            icon={faSquareXmark}
            style={{ color: "red" }}
          />
        )}
      </TableCell>
      <TableCell>{playerId}</TableCell>
      <TableCell>
        {isHost ? (
          <div className="flex gap-2">
            {playerName}
            <FontAwesomeIcon icon={faCrown} style={{ color: "orange" }} />
          </div>
        ) : (
          playerName
        )}
      </TableCell>
      <TableCell>
        <div className="flex gap-2 justify-end items-center">
          {self?.index === 0 && !isSelf && <TransferGame player={player} />}
          {self?.index === 0 && !isSelf && <Kick player={player} />}
          {isSelf && <Ready builder={builder} />}
        </div>
      </TableCell>
    </TableRow>
  );
};
