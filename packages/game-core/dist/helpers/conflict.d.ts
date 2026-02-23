import { Tile } from "../models/tile";
import { Spot } from "../types/spot";
import { Store, Tiles } from "../store";
export type VisitedType = {
    [key: string]: boolean;
};
export declare function checkFeatureIdle(gameId: number, tile: Tile, orientation: number, x: number, y: number, character: number, at: number, tiles: Tiles): boolean;
export declare class Conflict {
    status: boolean;
    start(tile: Tile, at: Spot, store: Store): boolean;
    iter(tile: Tile, at: Spot, visited: VisitedType, store: Store): void;
}
//# sourceMappingURL=conflict.d.ts.map