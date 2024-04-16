import { useState, useEffect, useMemo } from "react";
import { useDojo } from "@/dojo/useDojo";
import {
  defineEnterSystem,
  defineSystem,
  Has,
  HasValue,
  NotValue,
} from "@dojoengine/recs";
import { useQueryParams } from "@/hooks/useQueryParams";
import { create } from "zustand";
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
type TileState = {
  items: Items;
  tiles: any;
  setItems: (newItems: Items) => void;
  setTiles: (newTiles: any) => void;
};

const useTileStore = create<TileState>((set) => ({
  items: {},
  tiles: {},
  setItems: (newItems) =>
    set((state) => ({ items: { ...state.items, ...newItems } })),
  setTiles: (newTiles) =>
    set((state) => ({ tiles: { ...state.tiles, ...newTiles } })),
}));

export const useTiles = () => {
  const { gameId } = useQueryParams();
  const { items, setItems, tiles, setTiles } = useTileStore();

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
    []
  );

  const createTileAndSet = (tile: any) => {
    const tileKey = `${tile.gameId}-${tile.id}`;
    const positionKey = `${tile.gameId}-${tile.x}-${tile.y}`;

    // Update the tiles
    setTiles({
      [tileKey]: tile,
      [positionKey]: tile,
    });

    // Create a new item for the tile
    const key = `${tile.gameId}-${tile.x}-${tile.y}`;
    const item: Item = { tile: tile, empty: false };
    const newItems: Items = { [key]: item };

    // Create new items for the surrounding tiles
    offsets.forEach((offset) => {
      const col = tile.x + offset.x;
      const row = tile.y + offset.y;
      const position: Position = { col, row };
      const key = `${tile.gameId}-${col}-${row}`;

      if (!Object.keys(items).includes(key)) {
        newItems[key] = { tile: position, empty: true };
      }
    });

    setItems(newItems);
  };

  useEffect(() => {
    defineEnterSystem(
      world,
      [
        Has(Tile),
        HasValue(Tile, { game_id: gameId }),
        NotValue(Tile, { orientation: 0 }),
      ],
      ({ value: [raw] }: typeof Tile) => {
        const tile = new TileClass(raw);
        createTileAndSet(tile);
      }
    );
    // defineSystem(
    //   world,
    //   [
    //     Has(Tile),
    //     HasValue(Tile, { game_id: gameId }),
    //     NotValue(Tile, { orientation: 0 }),
    //   ],
    //   ({ value: [raw] }: typeof Tile) => {
    //     const tile = new TileClass(raw);
    //     createTileAndSet(tile);
    //   }
    // );
  }, []);

  return { tiles, items };
};
