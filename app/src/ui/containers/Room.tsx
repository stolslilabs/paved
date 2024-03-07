import { useEffect, useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
} from "@/components/ui/select";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faCheck,
  faMoon,
  faSun,
} from "@fortawesome/free-solid-svg-icons";

import { useDojo } from "@/dojo/useDojo";
import { useComponentValue, useEntityQuery } from "@dojoengine/react";
import { Entity, Has, HasValue } from "@dojoengine/recs";
import { useNavigate } from "react-router-dom";
import { shortString } from "starknet";
import { useQueryParams } from "@/hooks/useQueryParams";
import { getEntityIdFromKeys, shortenHex } from "@dojoengine/utils";
import { useLobbyStore } from "@/store";

import {
  getLightOrders,
  getDarkOrders,
  getOrderFromName,
  getOrder,
} from "@/utils";

import { StartGame } from "@/ui/components/StartGame";
import { LeaveGame } from "@/ui/components/LeaveGame";
import { TransferGame } from "../components/TransferGame";
import { UpdateGame } from "../components/UpdateGame";
import { ScrollArea } from "@radix-ui/react-scroll-area";

export const Room = () => {
  const { gameId } = useQueryParams();
  const [gameName, setGameName] = useState<string>("");
  const [duration, setDuration] = useState<string>("");
  const { resetPlayerEntity } = useLobbyStore();
  const {
    setup: {
      clientComponents: { Game, Builder },
    },
  } = useDojo();

  const gameKey = useMemo(
    () => getEntityIdFromKeys([BigInt(gameId)]),
    [gameId]
  );
  const game = useComponentValue(Game, gameKey);
  const builders = useEntityQuery([
    Has(Builder),
    HasValue(Builder, { game_id: game?.id }),
  ]);

  const backgroundColor = useMemo(() => "#FCF7E7", []);

  const navigate = useNavigate();

  useEffect(() => {
    if (game) {
      setGameName(shortString.decodeShortString(game.name));
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
    <div className="bg-yellow-100 h-screen grow" style={{ backgroundColor }}>
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

          <StartGame />
          <LeaveGame />
          <TransferGame />
          <UpdateGame />
        </div>

        <h4>Players</h4>
        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow className="text-sm">
                <TableHead className="w-[100px]">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Ready</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {builders.map((builder, index) => {
                return <BuilderRow key={index} entity={builder} />;
              })}
              <PlayerRow />
            </TableBody>
          </Table>
        </ScrollArea>
      </div>
    </div>
  );
};

export const PlayerRow = () => {
  const { gameId } = useQueryParams();
  const [playerId, setPlayerId] = useState<string>();
  const [playerName, setPlayerName] = useState<string>();
  const [orderName, setOrderName] = useState("");
  const [order, setOrder] = useState(1);

  const {
    account: { account },
    setup: {
      clientComponents: { Game, Player, Builder },
      systemCalls: { join_game },
    },
  } = useDojo();

  const playerKey = useMemo(
    () => getEntityIdFromKeys([BigInt(account.address)]),
    [gameId, account]
  );
  const player = useComponentValue(Player, playerKey);
  const builderKey = useMemo(
    () => getEntityIdFromKeys([BigInt(gameId), BigInt(account.address)]),
    [gameId, account]
  );
  const builder = useComponentValue(Builder, builderKey);

  const lightOrders = useMemo(() => {
    return getLightOrders();
  }, []);

  const darkOrders = useMemo(() => {
    return getDarkOrders();
  }, []);

  useEffect(() => {
    if (player) {
      setPlayerId(shortenHex(`${player.id}`).replace("...", ""));
      setPlayerName(shortString.decodeShortString(player.name));
      setOrderName(getOrder(player.order));
    }
  }, [player]);

  useEffect(() => {
    if (orderName) {
      setOrder(getOrderFromName(orderName));
    }
  }, [orderName]);

  const handleClick = () => {
    join_game({
      account: account,
      game_id: gameId,
      order: order,
    });
  };

  if (!player || builder?.order) return null;

  return (
    <TableRow className="text-xs">
      <TableCell>{playerId}</TableCell>
      <TableCell>{playerName}</TableCell>
      <TableCell>
        <Select
          onValueChange={(value) => setOrderName(value)}
          value={orderName}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select order" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {lightOrders.map((name) => {
                return (
                  <SelectItem key={name} value={name}>
                    <FontAwesomeIcon className="pr-4" icon={faSun} />
                    {name}
                  </SelectItem>
                );
              })}
              {darkOrders.map((name) => {
                return (
                  <SelectItem key={name} value={name}>
                    <FontAwesomeIcon className="pr-4" icon={faMoon} />
                    {name}
                  </SelectItem>
                );
              })}
            </SelectGroup>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Button variant={"secondary"} size={"icon"} onClick={handleClick}>
          <FontAwesomeIcon icon={faCheck} />
        </Button>
      </TableCell>
    </TableRow>
  );
};

export const BuilderRow = ({ entity }: { entity: Entity }) => {
  const { gameId } = useQueryParams();
  const { setPlayerEntity } = useLobbyStore();
  const [playerId, setPlayerId] = useState<string>();
  const [playerName, setPlayerName] = useState<string>();
  const [orderName, setOrderName] = useState<string>();
  const [ready, setReady] = useState<string>();
  const [display, setDisplay] = useState<boolean>(true);
  const [isHost, setIsHost] = useState(false);
  const {
    setup: {
      clientComponents: { Game, Player, Builder },
    },
  } = useDojo();

  const gameKey = useMemo(
    () => getEntityIdFromKeys([BigInt(gameId)]),
    [gameId]
  );
  const game = useComponentValue(Game, gameKey);
  const builder = useComponentValue(Builder, entity);
  const playerKey = useMemo(
    () => getEntityIdFromKeys([BigInt(builder?.player_id)]) as Entity,
    [builder]
  );
  const player = useComponentValue(Player, playerKey);

  useEffect(() => {
    if (game && player && builder) {
      if (builder.order == 0) {
        return setDisplay(false);
      }
      setPlayerId(shortenHex(`${player.id}`).replace("...", ""));
      setPlayerName(shortString.decodeShortString(player.name));
      setOrderName(getOrder(builder.order));
      setReady("yes");
      setIsHost(player.id === game.host);
      setDisplay(true);
    }
  }, [builder, player, game]);

  const handleClick = () => {
    setPlayerEntity(playerKey);
  };

  if (!player || !builder || !display) return null;

  return (
    <TableRow onClick={handleClick} className="text-xs">
      <TableCell>{playerId}</TableCell>
      <TableCell>{isHost ? `${playerName} ★` : playerName}</TableCell>
      <TableCell>{orderName}</TableCell>
      <TableCell>{ready}</TableCell>
    </TableRow>
  );
};
