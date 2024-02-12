import { Tile, RawTile } from "./models/tile";

export type Tiles = { [key: string]: RawTile };

export class Store {
  gameId: number;
  tiles: Tiles;

  constructor(gameId: number, tiles: Tiles) {
    this.gameId = gameId;
    this.tiles = tiles;
  }

  getTileById(tileId: number): Tile | undefined {
    const raw: RawTile = this.tiles[`${this.gameId}-${tileId}`];
    if (!raw) return undefined;
    return Tile.from(raw);
  }

  getTileByPosition(x: number, y: number): Tile | undefined {
    const raw: RawTile = this.tiles[`${this.gameId}-${x}-${y}`];
    if (!raw) return undefined;
    return Tile.from(raw);
  }
}
