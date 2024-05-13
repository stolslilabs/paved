import { useEffect, useMemo, useState } from "react";
import { useDojo } from "@/dojo/useDojo";
import {
  defineEnterSystem,
  defineSystem,
  getComponentValue,
  getEntitiesWithValue,
  Entity,
  Has,
  HasValue,
  NotValue,
} from "@dojoengine/recs";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useEntityQuery } from "@dojoengine/react";

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

export const useTiles = () => {
  const { gameId } = useQueryParams();
  const [items, setItems] = useState<Items>({});
  const [tiles, setTiles] = useState<any>({});
  const [keys, setKeys] = useState<Entity[]>([]);
  const [trigger, setTrigger] = useState(false);

  const {
    setup: {
      world,
      clientModels: {
        models: { Tile },
        classes: { Tile: TileClass },
      },
    },
  } = useDojo();

  const offsets = useMemo(
    () => [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
      { x: 0, y: 1 },
    ],
    [],
  );

  const createTileAndSet = (tile: any) => {
    // Update the tiles
    setTiles((prevTiles: typeof Tile) => {
      const tileKey = `${tile.gameId}-${tile.id}`;
      const positionKey = `${tile.gameId}-${tile.x}-${tile.y}`;
      return { ...prevTiles, [tileKey]: tile, [positionKey]: tile };
    });

    // Create a new item for the tile
    const key = `${tile.gameId}-${tile.x}-${tile.y}`;
    const item: Item = { tile: tile, empty: false };
    const newItems: Items = { [key]: item };

    // Create new items for the surrounding tiles
    offsets.forEach((offset) => {
      const col = tile.x + offset.x;
      const row = tile.y + offset.y;
      const position: Position = { col: col, row: row };
      const key = `${tile.gameId}-${col}-${row}`;

      if (!Object.keys(items).includes(key)) {
        const item: Item = { tile: position, empty: true };
        newItems[key] = item;
      }
    });

    // Merge the new items with the previous items with priority to not empty items
    setItems((prevItems) => {
      const updatedItems = { ...prevItems };
      Object.keys(newItems).forEach((key) => {
        if (!Object.keys(updatedItems).includes(key) || !newItems[key].empty) {
          updatedItems[key] = newItems[key];
        }
      });
      return updatedItems;
    });
  };

  const tileKeys = useEntityQuery([
    Has(Tile),
    HasValue(Tile, { game_id: gameId }),
    NotValue(Tile, { orientation: 0 }),
  ]);

  useEffect(() => {
    console.log("tileKeys");
    // If some keys has been removed, then reset the state
    const oldKeys = keys.filter((key) => !tileKeys.includes(key));
    if (oldKeys.length) {
      setItems({});
      setTiles({});
      setKeys(tileKeys);
      setTrigger(!trigger);
      return;
    }

    tileKeys.forEach((entity) => {
      const tile = getComponentValue(Tile, entity);

      if (!tile || !tile.orientation) {
        return;
      }

      createTileAndSet(new TileClass(tile));
    });
    setKeys(tileKeys);
  }, [tileKeys, trigger]);

  return { tiles, items };
};
