import { Direction } from "../types/direction";
import { Layout } from "../types/layout";
import { Spot, SpotType } from "../types/spot";
import { Plan } from "../types/plan";
import { Orientation } from "../types/orientation";
import { Area } from "../types/area";
import { Move } from "../types/move";
export interface TileData {
    game_id: number;
    id: number;
    player_id: number | bigint | string;
    plan: number;
    orientation: number;
    x: number;
    y: number;
    occupied_spot: number;
}
export declare class Tile {
    gameId: number;
    id: number;
    playerId: string;
    plan: Plan;
    orientation: Orientation;
    x: number;
    y: number;
    occupiedSpot: Spot;
    constructor(tile: TileData);
    getKey(area: Area): string;
    referenceDirection(reference: Tile): Direction;
    getLayout(): Layout;
    areConnected(from: Spot, to: Spot): boolean;
    isEmpty(): boolean;
    canPlace(neighbors: Array<Tile>): boolean;
    northOrientedStarts(): Array<SpotType>;
    northOrientedWonder(): SpotType;
    northOrientedMoves(at: Spot): Array<Move>;
    area(at: Spot): Area;
    northOrientedAdjacentRoads(at: Spot): Array<SpotType>;
    northOrientedAdjacentCities(at: Spot): Array<SpotType>;
    proxyCoordinates(direction: Direction): [number, number];
}
//# sourceMappingURL=tile.d.ts.map