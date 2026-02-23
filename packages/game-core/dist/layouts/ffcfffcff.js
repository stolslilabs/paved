// Source: contracts/src/layouts/ffcfffcff.cairo
import { AreaType } from "../types/area";
import { Move } from "../types/move";
import { Direction, DirectionType } from "../types/direction";
import { Spot, SpotType } from "../types/spot";
export class Configuration {
    static starts() {
        return [SpotType.Center, SpotType.North, SpotType.South];
    }
    static moves(from) {
        switch (from) {
            case SpotType.Center:
            case SpotType.NorthWest:
            case SpotType.NorthEast:
            case SpotType.East:
            case SpotType.SouthEast:
            case SpotType.SouthWest:
            case SpotType.West:
                return [
                    new Move(new Direction(DirectionType.East), new Spot(SpotType.West)),
                    new Move(new Direction(DirectionType.West), new Spot(SpotType.East)),
                ];
            case SpotType.North:
                return [
                    new Move(new Direction(DirectionType.North), new Spot(SpotType.South)),
                ];
            case SpotType.South:
                return [
                    new Move(new Direction(DirectionType.South), new Spot(SpotType.North)),
                ];
            default:
                return [];
        }
    }
    static area(from) {
        switch (from) {
            case SpotType.Center:
            case SpotType.NorthWest:
            case SpotType.NorthEast:
            case SpotType.East:
            case SpotType.SouthEast:
            case SpotType.SouthWest:
            case SpotType.West:
                return AreaType.A;
            case SpotType.North:
                return AreaType.B;
            case SpotType.South:
                return AreaType.C;
            default:
                return AreaType.None;
        }
    }
    static adjacentRoads(_from) {
        return [];
    }
    static adjacentCities(from) {
        switch (from) {
            case SpotType.Center:
            case SpotType.NorthWest:
            case SpotType.NorthEast:
            case SpotType.East:
            case SpotType.SouthEast:
            case SpotType.SouthWest:
            case SpotType.West:
                return [SpotType.North, SpotType.South];
            default:
                return [];
        }
    }
}
//# sourceMappingURL=ffcfffcff.js.map