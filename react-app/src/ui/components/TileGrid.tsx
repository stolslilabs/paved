import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useGameStore } from "../../store";
import { useDojo } from "@/dojo/useDojo";
import { TileBackground } from "./TileBackground";

export const TileGrid = ({ rows, cols, squareSize }: any) => {
  const {
    account: { account },
    setup: {
      clientComponents: { Builder, Tile },
    },
  } = useDojo();

  const { gameId, selectedTile, setSelectedTile } = useGameStore();

  const handleTileClick = (col: number, row: number) => {
    setSelectedTile({ col, row });
  };

  const builder = useComponentValue(
    Builder,
    getEntityIdFromKeys([BigInt(gameId), BigInt(account.address)]) as Entity
  );

  const activeTile = useComponentValue(
    Tile,
    getEntityIdFromKeys([
      BigInt(gameId),
      BigInt(builder ? builder.tile_id : 0),
    ]) as Entity
  );

  const squares = [];
  const squareWidth = squareSize;
  const squareHeight = squareSize;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const offset_x = Math.floor(cols / 2);
      const offset_y = Math.floor(rows / 2);
      const x = col * squareWidth;
      const y = row * squareHeight;
      squares.push(
        <TileBackground
          key={`${row}-${col}`}
          position={[x, y, 0]}
          size={squareSize}
          col={col - offset_x}
          row={row - offset_y}
          onTileClick={handleTileClick}
          selectedTile={selectedTile}
          activeTile={activeTile}
        />
      );
    }
  }
  return <>{squares}</>;
};
