// Source: contracts/src/types/layout.cairo
import { Category, CategoryType } from "./category";
import { Orientation, OrientationType } from "./orientation";
import { SpotType } from "./spot";
import { Direction, DirectionType } from "./direction";
export const checkCompatibility = (tile, orientation, northTile, eastTile, southTile, westTile) => {
    tile.orientation = Orientation.from(orientation);
    const layout = tile.getLayout();
    let status = true;
    if (northTile) {
        const north = northTile.getLayout();
        const direction = new Direction(DirectionType.North);
        status = status && layout.isCompatible(north, direction);
    }
    if (eastTile) {
        const east = eastTile.getLayout();
        const direction = new Direction(DirectionType.East);
        status = status && layout.isCompatible(east, direction);
    }
    if (southTile) {
        const south = southTile.getLayout();
        const direction = new Direction(DirectionType.South);
        status = status && layout.isCompatible(south, direction);
    }
    if (westTile) {
        const west = westTile.getLayout();
        const direction = new Direction(DirectionType.West);
        status = status && layout.isCompatible(west, direction);
    }
    return status;
};
export class Layout {
    center;
    northWest;
    north;
    northEast;
    east;
    southEast;
    south;
    southWest;
    west;
    constructor(center, northWest, north, northEast, east, southEast, south, southWest, west) {
        this.center = center;
        this.northWest = northWest;
        this.north = north;
        this.northEast = northEast;
        this.east = east;
        this.southEast = southEast;
        this.south = south;
        this.southWest = southWest;
        this.west = west;
    }
    static from(plan, orientation) {
        const [center, northWest, north, northEast, east, southEast, south, southWest, west,] = plan.unpack();
        switch (orientation) {
            case OrientationType.North:
                return new Layout(center, northWest, north, northEast, east, southEast, south, southWest, west);
            case OrientationType.East:
                return new Layout(center, southWest, west, northWest, north, northEast, east, southEast, south);
            case OrientationType.South:
                return new Layout(center, southEast, south, southWest, west, northWest, north, northEast, east);
            case OrientationType.West:
                return new Layout(center, northEast, east, southEast, south, southWest, west, northWest, north);
            default:
                throw new Error("Invalid orientation");
        }
    }
    isCompatible(reference, direction) {
        switch (direction.value) {
            case DirectionType.North:
                return this.north.value === reference.south.value;
            case DirectionType.East:
                return this.east.value === reference.west.value;
            case DirectionType.South:
                return this.south.value === reference.north.value;
            case DirectionType.West:
                return this.west.value === reference.east.value;
            default:
                return false;
        }
    }
    getCategory(spot) {
        switch (spot) {
            case SpotType.None:
                return new Category(CategoryType.None);
            case SpotType.Center:
                return this.center;
            case SpotType.NorthWest:
                return this.northWest;
            case SpotType.North:
                return this.north;
            case SpotType.NorthEast:
                return this.northEast;
            case SpotType.East:
                return this.east;
            case SpotType.SouthEast:
                return this.southEast;
            case SpotType.South:
                return this.south;
            case SpotType.SouthWest:
                return this.southWest;
            case SpotType.West:
                return this.west;
        }
    }
}
//# sourceMappingURL=layout.js.map