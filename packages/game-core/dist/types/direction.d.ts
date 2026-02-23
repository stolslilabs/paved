import { OrientationType } from "./orientation";
export declare enum DirectionType {
    None = "None",
    NorthWest = "NorthWest",
    North = "North",
    NorthEast = "NorthEast",
    East = "East",
    SouthEast = "SouthEast",
    South = "South",
    SouthWest = "SouthWest",
    West = "West"
}
export declare class Direction {
    value: DirectionType;
    constructor(direction: DirectionType);
    into(): number;
    from(index: number): Direction;
    rotate(orientation: OrientationType): Direction;
    antirotate(orientation: OrientationType): Direction;
    source(): Direction;
}
//# sourceMappingURL=direction.d.ts.map