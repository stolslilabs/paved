import { useDojo } from "@/dojo/useDojo";
import { useEntityQuery, useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { Has, HasValue, NotValue } from "@dojoengine/recs";
import { TileTexture } from "./TileTexture";
import { useGameStore } from "@/store";
import { useQueryParams } from "../../hooks/useQueryParams";

export const TileTextures = ({ squareSize }: { squareSize: number }) => {
  const { gameId } = useQueryParams();
  const { selectedTile, setSelectedTile, setX, setY } = useGameStore();

  const {
    account: { account },
    setup: {
      clientComponents: { Tile, TilePosition, Builder },
    },
  } = useDojo();

  const handleTileClick = (col: number, row: number) => {
    setSelectedTile({ col, row });
    setX(col);
    setY(row);
  };

  const builder = useComponentValue(
    Builder,
    getEntityIdFromKeys([BigInt(gameId), BigInt(account.address)]) as Entity
  );

  const tileEntities = useEntityQuery([
    Has(Tile),
    HasValue(Tile, { game_id: gameId }),
    NotValue(Tile, { orientation: 0 }),
  ]);

  const tilePositionEntities = useEntityQuery([
    Has(TilePosition),
    HasValue(TilePosition, { game_id: gameId }),
  ]);

  const activeTile = useComponentValue(
    Tile,
    getEntityIdFromKeys([
      BigInt(gameId),
      BigInt(builder ? builder.tile_id : 0),
    ]) as Entity
  );

  return (
    <>
      {tileEntities.map((tile) => {
        return (
          <TileTexture
            key={tile}
            entity={tile}
            size={squareSize}
            tilePositionEntities={tilePositionEntities}
            onTileClick={handleTileClick}
            selectedTile={selectedTile}
            activeTile={activeTile}
          />
        );
      })}
    </>
  );
};
