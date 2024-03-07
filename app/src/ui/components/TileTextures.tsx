import { useState, useEffect, useMemo } from "react";
import { useDojo } from "@/dojo/useDojo";
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
import { Tiles } from "@/utils/store";

type Position = {
  col: number;
  row: number;
};

type Item = {
  tile: any | Position;
  empty: boolean;
};

type Items = {
  [key: string]: Item;
};

export const TileTextures = ({ squareSize }: { squareSize: number }) => {
  const { gameId } = useQueryParams();
  const [items, setItems] = useState<Items>({});
  const [tiles, setTiles] = useState<Tiles>({});

  const {
    setup: {
      world,
      clientComponents: { Tile },
    },
  } = useDojo();

  const offsets = useMemo(
    () => [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
      { x: 0, y: 1 },
    ],
    []
  );

  useEffect(() => {
    defineEnterSystem(
      world,
      [
        Has(Tile),
        HasValue(Tile, { game_id: gameId }),
        NotValue(Tile, { orientation: 0 }),
      ],
      ({ value: [tile] }: typeof Tile) => {
        // Update the tiles
        setTiles((prevTiles: typeof Tile) => {
          const tileKey = `${tile.game_id}-${tile.id}`;
          const positionKey = `${tile.game_id}-${tile.x}-${tile.y}`;
          return { ...prevTiles, [tileKey]: tile, [positionKey]: tile };
        });

        // Create a new item for the tile
        const key = `${tile.game_id}-${tile.x}-${tile.y}`;
        const item: Item = { tile: tile, empty: false };
        const newItems: Items = { [key]: item };

        // Create new items for the surrounding tiles
        offsets.forEach((offset) => {
          const col = tile.x + offset.x;
          const row = tile.y + offset.y;
          const position: Position = { col: col, row: row };
          const key = `${tile.game_id}-${col}-${row}`;

          if (!Object.keys(items).includes(key)) {
            const item: Item = { tile: position, empty: true };
            newItems[key] = item;
          }
        });

        // Merge the new items with the previous items with priority to not empty items
        setItems((prevItems) => {
          const updatedItems = { ...prevItems };
          Object.keys(newItems).forEach((key) => {
            if (
              !Object.keys(updatedItems).includes(key) ||
              !newItems[key].empty
            ) {
              updatedItems[key] = newItems[key];
            }
          });
          return updatedItems;
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
        // Update the tiles
        setTiles((prevTiles: typeof Tile) => {
          const tileKey = `${tile.game_id}-${tile.id}`;
          const positionKey = `${tile.game_id}-${tile.x}-${tile.y}`;
          return { ...prevTiles, [tileKey]: tile, [positionKey]: tile };
        });

        // Create a new item for the tile
        const key = `${tile.game_id}-${tile.x}-${tile.y}`;
        const item: Item = { tile: tile, empty: false };
        const newItems: Items = { [key]: item };

        // Create new items for the surrounding tiles
        offsets.forEach((offset) => {
          const col = tile.x + offset.x;
          const row = tile.y + offset.y;
          const position: Position = { col: col, row: row };
          const key = `${tile.game_id}-${col}-${row}`;

          if (!Object.keys(items).includes(key)) {
            const item: Item = { tile: position, empty: true };
            newItems[key] = item;
          }
        });

        // Merge the new items with the previous items with priority to not empty items
        setItems((prevItems) => {
          const updatedItems = { ...prevItems };
          Object.keys(newItems).forEach((key) => {
            if (
              !Object.keys(updatedItems).includes(key) ||
              !newItems[key].empty
            ) {
              updatedItems[key] = newItems[key];
            }
          });
          return updatedItems;
        });
      }
    );
  }, []);

  return (
    <>
      {Object.keys(items).map((key: string) => {
        const item = items[key];
        if (item.empty) {
          return (
            <TileEmpty
              key={key}
              col={item.tile.col}
              row={item.tile.row}
              size={squareSize}
              tiles={tiles}
            />
          );
        } else {
          return <TileTexture key={key} tile={item.tile} size={squareSize} />;
        }
      })}
    </>
  );
};
