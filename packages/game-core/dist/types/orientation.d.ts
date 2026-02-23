export declare enum OrientationType {
    None = "None",
    North = "North",
    East = "East",
    South = "South",
    West = "West"
}
export declare class Orientation {
    value: OrientationType;
    constructor(value: OrientationType);
    into(): number;
    static from(index: number): Orientation;
}
//# sourceMappingURL=orientation.d.ts.map