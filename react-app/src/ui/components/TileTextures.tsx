import { useState, useEffect } from "react";
import { useDojo } from "@/dojo/useDojo";
import { useEntityQuery, useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import {
  defineEnterSystem,
  defineSystem,
  Has,
  HasValue,
  NotValue,
} from "@dojoengine/recs";
import { TileTexture } from "./TileTexture";
import { TileEmpty } from "./TileEmpty";
import { useQueryParams } from "../../hooks/useQueryParams";
import { Ocean, Size } from "./Ocean";
import { offset, other_offset } from "@/utils";

type Position = {
  col: number;
  row: number;
};

type Positions = {
  [key: string]: Position;
};

export const TileTextures = ({ squareSize }: { squareSize: number }) => {
  const { gameId } = useQueryParams();
  const [tiles, setTiles] = useState<any>({});
  const [neighbors, setNeighbors] = useState<Positions>({});
  const [size, setSize] = useState<Size>({ x: 0, y: 0, l: 0, w: 0 });

  const {
    account: { account },
    setup: {
      world,
      clientComponents: { Tile, TilePosition, Builder },
    },
  } = useDojo();

  const builder = useComponentValue(
    Builder,
    getEntityIdFromKeys([BigInt(gameId), BigInt(account.address)]) as Entity
  );

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

  useEffect(() => {
    defineEnterSystem(
      world,
      [
        Has(Tile),
        HasValue(Tile, { game_id: gameId }),
        NotValue(Tile, { orientation: 0 }),
      ],
      function ({ value: [tile] }: any) {
        setTiles((prevTiles: any) => {
          return { ...prevTiles, [tile.id]: tile };
        });
      }
    );
    defineSystem(
      world,
      [
        Has(Tile),
        HasValue(Tile, { game_id: gameId }),
        NotValue(Tile, { orientation: 0 }),
      ],
      function ({ value: [tile] }: any) {
        setTiles((prevTiles: any) => {
          return { ...prevTiles, [tile.id]: tile };
        });
      }
    );
  }, []);

  useEffect(() => {
    if (!tiles) return;

    const positions: Positions = {};
    const offsets = [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
      { x: 0, y: 1 },
    ];
    let minX = 0;
    let minY = 0;
    let maxX = 0;
    let maxY = 0;

    Object.values(tiles).forEach((tile: typeof Tile) => {
      offsets.forEach((offset) => {
        const col = tile?.x + offset.x;
        const row = tile?.y + offset.y;
        const entity = getEntityIdFromKeys([
          BigInt(tile?.game_id),
          BigInt(col),
          BigInt(row),
        ]) as Entity;

        if (!tilePositionEntities.includes(entity)) {
          const position = {
            col: col,
            row: row,
          };
          if (!minX || col < minX) minX = col;
          if (!minY || row < minY) minY = row;
          if (!minX || col > maxX) maxX = col;
          if (!minX || row > maxY) maxY = row;
          positions[entity] = position;
        }
      });
    });

    setSize({
      x: ((maxX + minX) / 2 - offset + other_offset) * squareSize,
      y: ((maxY + minY) / 2 - offset + other_offset) * squareSize,
      l: (maxX - minX + 2) * squareSize,
      w: (maxY - minY + 2) * squareSize,
    });
    setNeighbors(positions);
  }, [tiles]);

  return (
    <>
      {Object.values(tiles).map((tile: any) => {
        return <TileTexture key={tile.id} tile={tile} size={squareSize} />;
      })}
      {Object.values(neighbors).map((position: any) => {
        return (
          <TileEmpty
            key={`empty-${position.col}-${position.row}`}
            col={position.col}
            row={position.row}
            size={squareSize}
            activeTile={activeTile}
          />
        );
      })}
      {/* <Ocean size={size} /> */}
    </>
  );
};
