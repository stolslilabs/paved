import { OrientationType } from "./orientation";
export declare enum SpotType {
    None = "None",
    Center = "Center",
    NorthWest = "NorthWest",
    North = "North",
    NorthEast = "NorthEast",
    East = "East",
    SouthEast = "SouthEast",
    South = "South",
    SouthWest = "SouthWest",
    West = "West"
}
export declare class Spot {
    value: SpotType;
    constructor(spot: SpotType);
    into(): number;
    static from(index: number): Spot;
    rotate(orientation: OrientationType): Spot;
    antirotate(orientation: OrientationType): Spot;
}
//# sourceMappingURL=spot.d.ts.map