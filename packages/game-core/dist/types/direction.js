// Source: contracts/src/types/direction.cairo
import { OrientationType } from "./orientation";
export var DirectionType;
(function (DirectionType) {
    DirectionType["None"] = "None";
    DirectionType["NorthWest"] = "NorthWest";
    DirectionType["North"] = "North";
    DirectionType["NorthEast"] = "NorthEast";
    DirectionType["East"] = "East";
    DirectionType["SouthEast"] = "SouthEast";
    DirectionType["South"] = "South";
    DirectionType["SouthWest"] = "SouthWest";
    DirectionType["West"] = "West";
})(DirectionType || (DirectionType = {}));
export class Direction {
    value;
    constructor(direction) {
        this.value = direction;
    }
    into() {
        return Object.values(DirectionType).indexOf(this.value);
    }
    from(index) {
        const direction = Object.values(DirectionType)[index];
        return new Direction(direction);
    }
    rotate(orientation) {
        switch (orientation) {
            case OrientationType.North:
                return new Direction(this.value);
            case OrientationType.East:
                switch (this.value) {
                    case DirectionType.NorthWest:
                        return new Direction(DirectionType.NorthEast);
                    case DirectionType.North:
                        return new Direction(DirectionType.East);
                    case DirectionType.NorthEast:
                        return new Direction(DirectionType.SouthEast);
                    case DirectionType.East:
                        return new Direction(DirectionType.South);
                    case DirectionType.SouthEast:
                        return new Direction(DirectionType.SouthWest);
                    case DirectionType.South:
                        return new Direction(DirectionType.West);
                    case DirectionType.SouthWest:
                        return new Direction(DirectionType.NorthWest);
                    case DirectionType.West:
                        return new Direction(DirectionType.North);
                    default:
                        return new Direction(DirectionType.None);
                }
            case OrientationType.South:
                switch (this.value) {
                    case DirectionType.NorthWest:
                        return new Direction(DirectionType.SouthEast);
                    case DirectionType.North:
                        return new Direction(DirectionType.South);
                    case DirectionType.NorthEast:
                        return new Direction(DirectionType.SouthWest);
                    case DirectionType.East:
                        return new Direction(DirectionType.West);
                    case DirectionType.SouthEast:
                        return new Direction(DirectionType.NorthWest);
                    case DirectionType.South:
                        return new Direction(DirectionType.North);
                    case DirectionType.SouthWest:
                        return new Direction(DirectionType.NorthEast);
                    case DirectionType.West:
                        return new Direction(DirectionType.East);
                    default:
                        return new Direction(DirectionType.None);
                }
            case OrientationType.West:
                switch (this.value) {
                    case DirectionType.NorthWest:
                        return new Direction(DirectionType.SouthWest);
                    case DirectionType.North:
                        return new Direction(DirectionType.West);
                    case DirectionType.NorthEast:
                        return new Direction(DirectionType.NorthWest);
                    case DirectionType.East:
                        return new Direction(DirectionType.North);
                    case DirectionType.SouthEast:
                        return new Direction(DirectionType.NorthEast);
                    case DirectionType.South:
                        return new Direction(DirectionType.East);
                    case DirectionType.SouthWest:
                        return new Direction(DirectionType.SouthEast);
                    case DirectionType.West:
                        return new Direction(DirectionType.South);
                    default:
                        return new Direction(DirectionType.None);
                }
            default:
                return new Direction(DirectionType.None);
        }
    }
    antirotate(orientation) {
        switch (orientation) {
            case OrientationType.North:
                return this.rotate(OrientationType.North);
            case OrientationType.East:
                return this.rotate(OrientationType.West);
            case OrientationType.South:
                return this.rotate(OrientationType.South);
            case OrientationType.West:
                return this.rotate(OrientationType.East);
            default:
                return new Direction(DirectionType.None);
        }
    }
    source() {
        switch (this.value) {
            case DirectionType.NorthWest:
                return new Direction(DirectionType.SouthEast);
            case DirectionType.North:
                return new Direction(DirectionType.South);
            case DirectionType.NorthEast:
                return new Direction(DirectionType.SouthWest);
            case DirectionType.East:
                return new Direction(DirectionType.West);
            case DirectionType.SouthEast:
                return new Direction(DirectionType.NorthWest);
            case DirectionType.South:
                return new Direction(DirectionType.North);
            case DirectionType.SouthWest:
                return new Direction(DirectionType.NorthEast);
            case DirectionType.West:
                return new Direction(DirectionType.East);
            default:
                return new Direction(DirectionType.None);
        }
    }
}
//# sourceMappingURL=direction.js.map