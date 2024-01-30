import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDojo } from "@/dojo/useDojo";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useComponentValue, useEntityQuery } from "@dojoengine/react";
import { Entity, Has } from "@dojoengine/recs";
import { useNavigate } from "react-router-dom";
import { shortString } from "starknet";

export const GameLobby = () => {
  const { gameId } = useQueryParams();

  const {
    account: { account },
    setup: {
      clientComponents: { Game },
      client: { play },
    },
  } = useDojo();

  const name = "OHAYO";
  const order = 1;

  const games = useEntityQuery([Has(Game)]);

  return (
    <div className="bg-yellow-100 h-screen w-screen flex">
      <div className="w-1/3 bg-blue-100 h-full p-10">
        <h1>Game Lobby</h1>
      </div>
      <div className="w-2/3 p-10">
        <h1>Create Game</h1>

        <div>
          <Button
            variant={"default"}
            onClick={() =>
              play.initialize({
                account,
              })
            }
          >
            Initialize
          </Button>

          <Button
            variant={"default"}
            onClick={() =>
              play.create({
                account,
                game_id: gameId,
                name: shortString.encodeShortString(name),
                order: order,
              })
            }
          >
            Create
          </Button>
        </div>

        <h1>Games</h1>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Game</TableHead>
              <TableHead>TileCount</TableHead>
              <TableHead>Tiles</TableHead>
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
      <TableCell>{game?.tiles.toString()}</TableCell>
      <TableCell>
        <Button
          variant={"default"}
          onClick={() =>
            play.create({
              account,
              game_id: game?.id || 0,
              name: shortString.encodeShortString("ohayo"),
              order: 1,
            })
          }
        >
          Create
        </Button>
        <Button className="align-right" onClick={() => setGameQueryParam("1 ")}>
          go to game
        </Button>
      </TableCell>
    </TableRow>
  );
};
