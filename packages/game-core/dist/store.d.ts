import { Tile } from "./models/tile";
export type Tiles = {
    [key: string]: Tile;
};
export declare class Store {
    gameId: number;
    tiles: Tiles;
    constructor(gameId: number, tiles: Tiles);
    getTileById(tileId: number): Tile | undefined;
    getTileByPosition(x: number, y: number): Tile | undefined;
}
//# sourceMappingURL=store.d.ts.map