import { Category } from "./category";
import { Plan } from "./plan";
import { OrientationType } from "./orientation";
import { SpotType } from "./spot";
import { Direction } from "./direction";
import { Tile } from "../models/tile";
export declare const checkCompatibility: (tile: Tile, orientation: number, northTile: Tile, eastTile: Tile, southTile: Tile, westTile: Tile) => boolean;
export declare class Layout {
    center: Category;
    northWest: Category;
    north: Category;
    northEast: Category;
    east: Category;
    southEast: Category;
    south: Category;
    southWest: Category;
    west: Category;
    constructor(center: Category, northWest: Category, north: Category, northEast: Category, east: Category, southEast: Category, south: Category, southWest: Category, west: Category);
    static from(plan: Plan, orientation: OrientationType): Layout;
    isCompatible(reference: Layout, direction: Direction): boolean;
    getCategory(spot: SpotType): Category;
}
//# sourceMappingURL=layout.d.ts.map