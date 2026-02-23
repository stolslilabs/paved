import { Tile } from "./models/tile";

export type Tiles = { [key: string]: Tile };

export class Store {
  gameId: number;
  tiles: Tiles;

  constructor(gameId: number, tiles: Tiles) {
    this.gameId = gameId;
    this.tiles = tiles;
  }

  getTileById(tileId: number): Tile | undefined {
    return this.tiles[`${this.gameId}-${tileId}`];
  }

  getTileByPosition(x: number, y: number): Tile | undefined {
    return this.tiles[`${this.gameId}-${x}-${y}`];
  }
}
