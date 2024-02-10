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

  const {
    setup: {
      world,
      clientComponents: { Tile, TilePosition },
    },
  } = useDojo();

  const tilePositionEntities = useEntityQuery([
    Has(TilePosition),
    HasValue(TilePosition, { game_id: gameId }),
  ]);

  useEffect(() => {
    defineEnterSystem(
      world,
      [
        Has(Tile),
        HasValue(Tile, { game_id: gameId }),
        NotValue(Tile, { orientation: 0 }),
      ],
      ({ value: [tile] }: typeof Tile) => {
        const positions: Positions = {};
        const offsets = [
          { x: -1, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: -1 },
          { x: 0, y: 1 },
        ];
        offsets.forEach((offset) => {
          const col = tile.x + offset.x;
          const row = tile.y + offset.y;
          const entity = getEntityIdFromKeys([
            BigInt(tile?.game_id),
            BigInt(col),
            BigInt(row),
          ]) as Entity;

          if (!tilePositionEntities.includes(entity)) {
            positions[entity] = { col: col, row: row };
          }
        });

        setTiles((prevTiles: (typeof Tile)[]) => {
          return { ...prevTiles, [tile.id]: tile };
        });

        setNeighbors((prevNeighbors: Positions) => {
          return { ...prevNeighbors, ...positions };
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
      ({ value: [tile] }: typeof Tile) => {
        const positions: Positions = {};
        const offsets = [
          { x: -1, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: -1 },
          { x: 0, y: 1 },
        ];
        offsets.forEach((offset) => {
          const col = tile.x + offset.x;
          const row = tile.y + offset.y;
          const entity = getEntityIdFromKeys([
            BigInt(tile?.game_id),
            BigInt(col),
            BigInt(row),
          ]) as Entity;

          if (!tilePositionEntities.includes(entity)) {
            positions[entity] = { col: col, row: row };
          }
        });

        setTiles((prevTiles: (typeof Tile)[]) => {
          return { ...prevTiles, [tile.id]: tile };
        });

        setNeighbors((prevNeighbors: Positions) => {
          return { ...prevNeighbors, ...positions };
        });
      }
    );
  }, []);

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
          />
        );
      })}
    </>
  );
};
