import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
} from "@/components/ui/select";
import { shortenHex } from "@dojoengine/utils";

export const GameLobby = () => {
  const [endtime, setEndtime] = useState(60);
  const [pointsCap, setPointsCap] = useState(100);
  const [tilesCap, setTilesCap] = useState(100);

  const [finishTimeFormat, setFinishTimeFormat] = useState<Date>();

  const {
    account: { account, create, clear, list, select },
    setup: {
      clientComponents: { Game },
      client: { play },
    },
  } = useDojo();

  const games = useEntityQuery([Has(Game)]);

  useEffect(() => {
    const interval = setInterval(() => {
      setFinishTimeFormat(
        new Date(endtime * 60 * 1000 + Math.floor(Date.now()))
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [endtime]);

  return (
    <div className="bg-yellow-100 h-screen w-screen flex">
      <div className="w-1/3 bg-blue-100 h-full p-10">
        <h1>Paved in Order</h1>

        <Select
          onValueChange={(value) => select(value)}
          defaultValue={account.address}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select Addr" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {list().map((account, index) => {
                return (
                  <div key={index} className="flex">
                    <SelectItem value={account.address}>
                      {shortenHex(account.address)}
                    </SelectItem>
                    <Button size={"sm"} variant={"outline"} onClick={clear}>
                      X
                    </Button>
                  </div>
                );
              })}
            </SelectGroup>
          </SelectContent>
        </Select>

        <Button variant={"default"} onClick={() => create()}>
          Deploy
        </Button>
        <Button variant={"default"} onClick={() => clear()}>
          Clear
        </Button>
      </div>
      <div className="w-2/3 p-10">
        <h1>Create Game</h1>

        <div className="flex gap-4">
          <div className="grid items-center gap-1.5 self-end">
            <Label htmlFor="email">End Time (From Now in Minutes)</Label>
            <Input
              type="number"
              value={endtime}
              onChange={(e) => {
                if (e.target.value) {
                  setEndtime(parseInt(e.target.value));
                } else {
                  setEndtime(0);
                }
              }}
            />
            <div className="text-xs">
              End at: {finishTimeFormat?.toLocaleString()}
            </div>
          </div>

          <div className="grid items-center gap-1.5 self-start">
            <Label htmlFor="email">Points Cap</Label>
            <Input
              className="w-20"
              type="number"
              value={pointsCap}
              onChange={(e) => {
                setPointsCap(parseInt(e.target.value));
              }}
            />
          </div>
          <div className="grid items-center gap-1.5 self-start">
            <Label htmlFor="email">Tiles Cap</Label>
            <Input
              className="w-20"
              type="number"
              value={tilesCap}
              onChange={(e) => {
                setTilesCap(parseInt(e.target.value));
              }}
            />
          </div>
          <Button
            variant={"default"}
            className=" self-center"
            onClick={() =>
              play.create({
                account,
                endtime:
                  endtime === 0
                    ? 0
                    : endtime * 60 + Math.floor(Date.now() / 1000),
                points_cap: pointsCap,
                tiles_cap: tilesCap,
              })
            }
          >
            Create game
          </Button>
        </div>

        <h4>Games</h4>
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
      </TableCell>
    </TableRow>
  );
};
