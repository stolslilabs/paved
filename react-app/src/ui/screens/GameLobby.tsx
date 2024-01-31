import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDojo } from "@/dojo/useDojo";
import { useComponentValue, useEntityQuery } from "@dojoengine/react";
import { Has } from "@dojoengine/recs";
import { useNavigate } from "react-router-dom";
import { shortString } from "starknet";

export const GameLobby = () => {
  const [endtime, setEndtime] = useState(0);
  const [pointsCap, setPointsCap] = useState(0);
  const [tilesCap, setTilesCap] = useState(0);

  const {
    account: { account, create, clear },
    setup: {
      clientComponents: { Game },
      client: { play },
    },
  } = useDojo();

  const games = useEntityQuery([Has(Game)]);

  return (
    <div className="bg-yellow-100 h-screen w-screen flex">
      <div className="w-1/3 bg-blue-100 h-full p-10">
        <h1>Game Lobby</h1>
        <h2>{account.address.slice(0, 10)}</h2>
        <Button variant={"default"} onClick={() => create()}>
          Deploy
        </Button>
        <Button variant={"default"} onClick={() => clear()}>
          Clear
        </Button>
      </div>
      <div className="w-2/3 p-10">
        <h1>Create Game</h1>
        <h2>Endtime (unix) - Points Cap - Tiles Cap</h2>

        <div className="flex gap-4">
          <Button
            variant={"default"}
            onClick={() =>
              play.create({
                account,
                endtime: endtime,
                points_cap: pointsCap,
                tiles_cap: tilesCap,
              })
            }
          >
            Create
          </Button>
          <Input
            className="w-20"
            type="number"
            value={endtime}
            onChange={(e) => {
              setEndtime(parseInt(e.target.value));
            }}
          />
          <Input
            className="w-20"
            type="number"
            value={pointsCap}
            onChange={(e) => {
              setPointsCap(parseInt(e.target.value));
            }}
          />
          <Input
            className="w-20"
            type="number"
            value={tilesCap}
            onChange={(e) => {
              setTilesCap(parseInt(e.target.value));
            }}
          />
        </div>

        <h1>Games</h1>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Game</TableHead>
              <TableHead>TileCount</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {games.map((game, index) => {
              return <GameRow key={index} entity={game} />;
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export const GameRow = (entity: any) => {
  const [playerName, setPlayerName] = useState("OHAYO");
  const [order, setOrder] = useState(1);
  const {
    setup: {
      clientComponents: { Game },
      client: { play },
    },
    account: { account },
  } = useDojo();

  const game = useComponentValue(Game, entity.entity);
  const navigate = useNavigate();
  const setGameQueryParam = (id: string) => {
    navigate("?game=" + id, { replace: true });
  };

  return (
    <TableRow>
      <TableCell>{game?.id}</TableCell>
      <TableCell>{game?.tile_count}</TableCell>
      <TableCell className="flex justify-end gap-4">
        <Button
          variant={"default"}
          onClick={() =>
            play.spawn({
              account,
              game_id: game?.id || 0,
              name: shortString.encodeShortString(playerName),
              order: order,
            })
          }
        >
          Spawn
        </Button>
        <Button
          className="align-right"
          onClick={() => setGameQueryParam(game?.id || 0)}
        >
          go to game
        </Button>
        <Input
          className="w-20"
          type="text"
          value={playerName}
          onChange={(e) => {
            setPlayerName(e.target.value);
          }}
        />
        <Input
          className="w-20"
          type="number"
          value={order}
          onChange={(e) => {
            setOrder(parseInt(e.target.value));
          }}
        />
      </TableCell>
    </TableRow>
  );
};
